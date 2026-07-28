/**
 * Learning execution loop — user actions → memory/state → replan.
 *
 * UI calls these APIs only (via @/application), never core directly.
 */

import { completeJourneyStep } from "@/lib/journey-progress";
import { logMistake, bumpStreak, recordActivity } from "@/lib/user-activity";
import { loadProfile, getDefaultProfile } from "@/lib/user-profile";
import { applyNearReviewOutcome, applyReviewOutcome } from "@/core";
import type { RevisionMemoryItem, UserState } from "@/core";
import type { TodayPlanResult } from "../types";
import {
  getPlanningService,
  type PlanningService,
  type PlanningServiceOptions,
} from "../planning/planning-service";
import { advanceHifzCursorAfterSession } from "../planning/hifz-cursor";
import type {
  CommitProgressOptions,
  CommitProgressResult,
  CompleteSessionInput,
  LearningProgressEvent,
  RecordMistakeInput,
  RecordReviewInput,
  ReviewQuality,
  SessionOutcome,
} from "./execution-types";
import {
  createArchitectureState,
  appendEvidence,
  mergeSessionRangeIntoMap,
  refreshMapStrengthFromEvidence,
  recordConfusion,
  classifyError,
  type EvidenceRecord,
} from "@/core/architecture";

function toIsoDate(d?: string | Date): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const p = new Date(d);
    return Number.isNaN(p.getTime())
      ? new Date().toISOString().slice(0, 10)
      : p.toISOString().slice(0, 10);
  }
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

function qualityToOutcome(
  quality: ReviewQuality | undefined,
  fallback: "success" | "fail"
): "success" | "fail" {
  if (quality === undefined) return fallback;
  return quality < 3 ? "fail" : "success";
}

function sessionOutcomeToReview(
  outcome: SessionOutcome
): "success" | "fail" | null {
  if (outcome === "success") return "success";
  if (outcome === "fail" || outcome === "partial") return "fail";
  return null;
}

function applyMemoryReview(
  item: RevisionMemoryItem,
  outcome: "success" | "fail",
  asOfDate: string,
  extraMistakes = 0
): RevisionMemoryItem {
  if (item.isNear || item.urgent) {
    return applyNearReviewOutcome(item, outcome, asOfDate);
  }
  return applyReviewOutcome(item, outcome, asOfDate, extraMistakes);
}

function appendSession(
  state: UserState | null,
  input: {
    kind: string;
    outcome: string;
    surahNumber?: number;
    fromAyah?: number;
    toAyah?: number;
    durationMinutes?: number;
    date: string;
  }
): UserState | null {
  if (!state) return state;
  const id = `sess_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const kindMap: Record<string, UserState["sessions"]["records"][0]["kind"]> = {
    revision: "near_revision",
    new_hifz: "new_hifz",
    listening: "listening",
    quiz: "quiz",
    reflect: "reflection",
    mutashabihat: "mutashabihat",
    other: "reflection",
  };
  const outcomeMap: Record<
    string,
    UserState["sessions"]["records"][0]["outcome"]
  > = {
    success: "completed",
    fail: "failed",
    partial: "partial",
    skipped: "skipped",
  };

  const record = {
    id,
    userId: state.userId,
    date: input.date,
    kind: kindMap[input.kind] ?? "near_revision",
    surahNumber: input.surahNumber,
    outcome: outcomeMap[input.outcome] ?? "completed",
    durationMinutes: input.durationMinutes,
    createdAt: new Date().toISOString(),
    target:
      input.surahNumber && input.fromAyah
        ? {
            surah: input.surahNumber,
            fromAyah: input.fromAyah,
            toAyah: input.toAyah ?? input.fromAyah,
          }
        : undefined,
  };

  return {
    ...state,
    sessions: {
      ...state.sessions,
      records: [record, ...state.sessions.records].slice(
        0,
        state.sessions.maxRecords || 200
      ),
    },
    updatedAt: input.date,
  };
}

export class LearningExecutionService {
  constructor(private readonly planning: PlanningService) {}

  commitProgress(
    events: LearningProgressEvent[],
    options: CommitProgressOptions = {}
  ): CommitProgressResult {
    const autoReplan = options.autoReplan !== false;
    const asOfDate = toIsoDate(options.asOfDate);

    let replanRecommended = false;

    const nextSnap = this.planning.updateLearningSnapshot((snapshot) => {
      const memory = [...snapshot.revisionMemory];
      let userState = snapshot.userState
        ? (JSON.parse(JSON.stringify(snapshot.userState)) as UserState)
        : null;

      const touchMemory = (
        id: string,
        fn: (m: RevisionMemoryItem) => RevisionMemoryItem
      ) => {
        const idx = memory.findIndex((m) => m.id === id);
        if (idx < 0) return;
        memory[idx] = fn(memory[idx]);
        replanRecommended = true;
      };

      for (const event of events) {
        if (event.type === "invalidate_plan_cache") {
          replanRecommended = true;
          continue;
        }

        if (event.type === "review_outcome") {
          const outcome = qualityToOutcome(event.quality, event.outcome);
          const extra =
            event.extraMistakes ??
            (event.quality !== undefined && event.quality < 2 ? 1 : 0);
          touchMemory(event.revisionMemoryId, (m) =>
            applyMemoryReview(
              m,
              outcome,
              toIsoDate(event.date ?? asOfDate),
              extra
            )
          );
          continue;
        }

        if (event.type === "plan_item_completed") {
          replanRecommended = true;
          if (event.revisionMemoryId && event.outcome !== "skipped") {
            const rev = sessionOutcomeToReview(event.outcome);
            if (rev) {
              const outcome = qualityToOutcome(event.quality, rev);
              touchMemory(event.revisionMemoryId, (m) =>
                applyMemoryReview(m, outcome, toIsoDate(event.date ?? asOfDate))
              );
            }
          }
          continue;
        }

        if (event.type === "session_completed") {
          replanRecommended = true;
          const sessionDate = toIsoDate(event.date ?? asOfDate);
          userState = appendSession(userState, {
            kind: event.sessionKind,
            outcome: event.outcome,
            surahNumber: event.surahNumber,
            fromAyah: event.fromAyah,
            toAyah: event.toAyah,
            durationMinutes: event.durationMinutes,
            date: sessionDate,
          });

          // Real NEW_HIFZ completion advances HifzCursor (Case 5)
          if (
            event.sessionKind === "new_hifz" &&
            event.outcome === "success" &&
            userState &&
            typeof event.surahNumber === "number" &&
            typeof event.toAyah === "number"
          ) {
            let memSel = null as
              | ReturnType<typeof loadProfile>["memorizationSelection"]
              | null;
            try {
              memSel = loadProfile().memorizationSelection ?? null;
            } catch {
              memSel = null;
            }
            const next = advanceHifzCursorAfterSession({
              surah: event.surahNumber,
              toAyah: event.toAyah,
              memorizationSelection: memSel,
            });
            userState = {
              ...userState,
              hifz: {
                ...userState.hifz,
                currentPointer: { surah: next.surah, ayah: next.ayah },
                lastAdvancedDate: sessionDate,
              },
              planning: {
                ...userState.planning,
                currentHifzPointer: { surah: next.surah, ayah: next.ayah },
              },
              updatedAt: sessionDate,
            };
          }

          if (event.revisionMemoryId && event.outcome !== "skipped") {
            const rev = sessionOutcomeToReview(event.outcome);
            if (rev) {
              const outcome = qualityToOutcome(event.quality, rev);
              touchMemory(event.revisionMemoryId, (m) =>
                applyMemoryReview(m, outcome, sessionDate)
              );
            }
          }
          continue;
        }

        if (event.type === "mistake_recorded") {
          if (event.revisionMemoryId) {
            touchMemory(event.revisionMemoryId, (m) => ({
              ...m,
              content: { ...m.content },
              mistakesCount: m.mistakesCount + 1,
              strengthScore: Math.max(0, m.strengthScore - 0.05),
              stabilityScore: Math.max(0, m.stabilityScore - 0.04),
            }));
          } else if (event.surahNumber) {
            const idx = memory.findIndex(
              (m) =>
                m.content.surah === event.surahNumber ||
                m.content.fromSurah === event.surahNumber
            );
            if (idx >= 0) {
              memory[idx] = {
                ...memory[idx],
                content: { ...memory[idx].content },
                mistakesCount: memory[idx].mistakesCount + 1,
                strengthScore: Math.max(0, memory[idx].strengthScore - 0.05),
              };
              replanRecommended = true;
            }
          }
        }
      }

      const nowIso = new Date().toISOString();
      // Phase 3: mark Actual provenance so sync never treats this as forecast
      const source = events.some((e) => e.type === "session_completed")
        ? ("session_completed" as const)
        : events.some((e) => e.type === "review_outcome")
          ? ("review_outcome" as const)
          : ("unknown" as const);

      // P4/P5/P7 — Evidence + Map/Strength (Session Completion is sole reality writer)
      let profile;
      try {
        profile = loadProfile();
      } catch {
        profile = getDefaultProfile();
      }
      let architecture = createArchitectureState(
        profile,
        snapshot.architecture ?? null
      );

      const evidenceBatch: EvidenceRecord[] = [];
      for (const event of events) {
        if (event.type === "session_completed") {
          const isOk = event.outcome === "success";
          const isPartial = event.outcome === "partial";
          evidenceBatch.push({
            id: `ev-${nowIso}-${evidenceBatch.length}`,
            kind: isOk
              ? "session_complete"
              : isPartial
                ? "partial_complete"
                : "revision_fail",
            sessionType:
              event.sessionKind === "new_hifz"
                ? "NEW_HIFZ"
                : event.sessionKind === "listening"
                  ? "LISTENING"
                  : "REVISION",
            surahId: event.surahNumber,
            fromAyah: event.fromAyah,
            toAyah: event.toAyah,
            quality: event.quality,
            createdAt: nowIso,
          });
          if (
            (isOk || isPartial) &&
            event.sessionKind === "new_hifz" &&
            typeof event.surahNumber === "number" &&
            typeof event.fromAyah === "number" &&
            typeof event.toAyah === "number"
          ) {
            architecture = {
              ...architecture,
              memorizationMap: mergeSessionRangeIntoMap(
                architecture.memorizationMap,
                event.surahNumber,
                event.fromAyah,
                event.toAyah
              ),
            };
          }
        }
        if (event.type === "review_outcome") {
          evidenceBatch.push({
            id: `ev-${nowIso}-${evidenceBatch.length}`,
            kind:
              event.outcome === "success"
                ? "revision_success"
                : "revision_fail",
            sessionType: "REVISION",
            createdAt: nowIso,
          });
        }
        if (event.type === "mistake_recorded") {
          evidenceBatch.push({
            id: `ev-${nowIso}-${evidenceBatch.length}`,
            kind: "mistake",
            sessionType: "MISTAKE_REVIEW",
            surahId: event.surahNumber,
            fromAyah: event.ayahNumber,
            toAyah: event.ayahNumber,
            createdAt: nowIso,
            meta: {
              confusedSurah: event.confusedSurah,
              confusedAyah: event.confusedAyah,
              nearSequence: event.nearSequence,
            },
          });
          if (typeof event.surahNumber === "number") {
            const cat = classifyError({
              expectedSurah: event.surahNumber,
              expectedAyah: event.ayahNumber,
              producedSurah: event.confusedSurah,
              producedAyah: event.confusedAyah,
              nearSequence: event.nearSequence,
            });
            architecture = {
              ...architecture,
              confusion: recordConfusion(architecture.confusion, {
                category: cat,
                surahId: event.surahNumber,
                ayah: event.ayahNumber ?? 1,
                relatedSurahId: event.confusedSurah,
                relatedAyah: event.confusedAyah,
              }),
            };
          }
        }
      }

      if (evidenceBatch.length) {
        architecture = appendEvidence(architecture, evidenceBatch);
        architecture = {
          ...architecture,
          memorizationMap: refreshMapStrengthFromEvidence(
            architecture.memorizationMap,
            architecture.evidence
          ),
        };
      }

      return {
        ...snapshot,
        revisionMemory: memory,
        userState,
        planCache: replanRecommended ? {} : snapshot.planCache,
        cacheMeta: replanRecommended ? undefined : snapshot.cacheMeta,
        updatedAt: nowIso,
        learningStateMeta: {
          version: 2,
          updatedAt: nowIso,
          source,
        },
        architecture,
      };
    });

    let today: TodayPlanResult | undefined;
    if (autoReplan && replanRecommended) {
      today = this.planning.refreshLearningState({
        asOfDate,
        force: true,
      }).today;
    }

    return {
      snapshot: today ? this.planning.getLearningSnapshot() : nextSnap,
      replanRecommended,
      today,
    };
  }

  completeSession(input: CompleteSessionInput): CommitProgressResult {
    const outcome = input.outcome ?? "success";
    const events: LearningProgressEvent[] = [
      {
        type: "session_completed",
        sessionKind: input.sessionKind,
        planItemId: input.planItemId,
        revisionMemoryId: input.revisionMemoryId,
        outcome,
        quality: input.quality,
        surahNumber: input.surahNumber,
        fromAyah: input.fromAyah,
        toAyah: input.toAyah,
        durationMinutes: input.durationMinutes,
        date: input.date,
      },
    ];

    if (input.planItemId) {
      events.push({
        type: "plan_item_completed",
        planItemId: input.planItemId,
        outcome,
        revisionMemoryId: input.revisionMemoryId,
        quality: input.quality,
        sessionKind: input.sessionKind,
        date: input.date,
      });
      try {
        completeJourneyStep(input.planItemId);
      } catch {
        /* non-fatal */
      }
    }

    try {
      recordActivity();
      bumpStreak();
    } catch {
      /* non-fatal outside browser */
    }

    return this.commitProgress(events, {
      autoReplan: input.autoReplan !== false,
      asOfDate: input.date,
    });
  }

  recordReviewOutcome(input: RecordReviewInput): CommitProgressResult {
    return this.commitProgress(
      [
        {
          type: "review_outcome",
          revisionMemoryId: input.revisionMemoryId,
          outcome: input.outcome,
          quality: input.quality,
          extraMistakes: input.extraMistakes,
          date: input.date,
        },
      ],
      {
        autoReplan: input.autoReplan !== false,
        asOfDate: input.date,
      }
    );
  }

  recordMistake(input: RecordMistakeInput): CommitProgressResult {
    try {
      logMistake({
        surahNumber: input.surahNumber,
        ayahNumber: input.ayahNumber,
        pageNumber: input.pageNumber,
        type: input.type ?? "OTHER",
        difficulty: input.difficulty,
        note: input.note,
      });
    } catch {
      /* tests / SSR */
    }

    return this.commitProgress(
      [
        {
          type: "mistake_recorded",
          surahNumber: input.surahNumber,
          ayahNumber: input.ayahNumber,
          pageNumber: input.pageNumber,
          mistakeType: input.type,
          difficulty: input.difficulty,
          note: input.note,
          revisionMemoryId: input.revisionMemoryId,
          date: input.date,
          confusedSurah: input.confusedSurah,
          confusedAyah: input.confusedAyah,
          nearSequence: input.nearSequence,
        },
      ],
      {
        autoReplan: input.autoReplan === true,
        asOfDate: input.date,
      }
    );
  }
}

let defaultExec: LearningExecutionService | null = null;

export function getLearningExecutionService(
  options?: PlanningServiceOptions
): LearningExecutionService {
  if (options) {
    return new LearningExecutionService(getPlanningService(options));
  }
  if (!defaultExec) {
    defaultExec = new LearningExecutionService(getPlanningService());
  }
  return defaultExec;
}

export function resetLearningExecutionService(): void {
  defaultExec = null;
}

/** Primary progress door (expanded events + auto-replan). */
export function commitDayProgress(
  events: LearningProgressEvent[],
  options?: CommitProgressOptions
): CommitProgressResult {
  return getLearningExecutionService().commitProgress(events, options);
}

export function completeSession(
  input: CompleteSessionInput
): CommitProgressResult {
  return getLearningExecutionService().completeSession(input);
}

export function recordReviewOutcome(
  input: RecordReviewInput
): CommitProgressResult {
  return getLearningExecutionService().recordReviewOutcome(input);
}

export function recordMistake(input: RecordMistakeInput): CommitProgressResult {
  return getLearningExecutionService().recordMistake(input);
}
