/**
 * Planning orchestration service — the only door UI should use for plans.
 *
 * Flow:
 *   load snapshot + HafizProfile
 *   → buildPlanningContext (core adapters)
 *   → runDecisionPipeline
 *   → generatePlan
 *   → persist (1-day commits durable state; multi-day caches display only)
 *
 * Cache invalidation: see plan-cache.ts
 * No React. No Prisma. No core mutations.
 */

import { loadProfile, type HafizProfile } from "@/lib/user-profile";
import {
  loadAyahProgress,
  loadMemStats,
} from "@/lib/memorization-store";
import { loadMistakes } from "@/lib/user-activity";
import { loadReaderPos } from "@/lib/reader-store";
import {
  buildPlanningContext,
  runDecisionPipeline,
  generatePlan,
  createDefaultQuranGeometry,
  applyReviewOutcome,
  type AppProgressSource,
  type GeneratedPlan,
  type UserState,
} from "@/core";
import type {
  AppDate,
  CommitDayProgressResult,
  DayProgressEvent,
  GenerateJourneyOptions,
  GetTodayPlanOptions,
  JourneyPlanResult,
  LearningSnapshot,
  RefreshLearningStateResult,
  TodayPlanResult,
} from "../types";
import {
  getDefaultLearningStore,
  type LearningStore,
} from "../persistence/learning-store";
import {
  buildPlanInputFingerprint,
  isCacheFingerprintValid,
  prunePlanCache,
} from "./plan-cache";
import { enrichProgressFromProfile } from "./bootstrap-from-profile";
import { initializeSrsFromProfile } from "./srs-init";
import {
  computeLoadAdjustment,
} from "./load-adjustment";
import {
  createArchitectureState,
  resolveNewHifzPath,
  measureQuranRange,
  composeDailyJourney,
  buildMutashabihSupportSignals,
  refreshMapStrengthFromEvidence,
  type ArchitectureState,
} from "@/core/architecture";

export interface PlanningServiceOptions {
  store?: LearningStore;
  /**
   * Override profile loader (tests / future auth context).
   * Defaults to loadProfile() from localStorage.
   */
  loadProfile?: () => HafizProfile;
  /** Inject geometry; defaults to production Uthmani geometry from core */
  useMetadataGeometry?: boolean;
}

function toIsoDate(d?: AppDate | Date): string {
  if (!d) {
    return new Date().toISOString().slice(0, 10);
  }
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function cacheKey(asOfDate: string, horizonDays: number): string {
  return `${asOfDate}:${horizonDays}`;
}

/**
 * Map existing local progress stores → AppProgressSource for core adapters.
 */
function loadProgressSource(
  profile: HafizProfile,
  existingState: UserState | null
): AppProgressSource {
  const mistakes = loadMistakes();
  const ayahProgress = loadAyahProgress();
  const memStats = loadMemStats();
  const reader = loadReaderPos();

  // Prefer durable core state when present
  if (existingState) {
    const fromState: AppProgressSource = {
      userId: existingState.userId,
      streakDays: existingState.streakDays,
      lastPlannedDate: existingState.lastPlannedDate,
      updatedAt: existingState.updatedAt,
      hifzPointer: {
        surah: existingState.hifz.currentPointer.surah,
        ayah: existingState.hifz.currentPointer.ayah,
      },
      hifzTrack: existingState.hifz.track,
      hifzPaused: existingState.hifz.paused,
      weekHifzLog: existingState.hifz.weekHifzLog.map((s) => ({
        labelAr: s.labelAr,
        pagesApprox: s.pagesApprox,
        range: s.range,
        span: s.span,
        startPage: s.startPage,
        endPage: s.endPage,
      })),
      lastCompletedSlice: existingState.hifz.lastCompletedSlice
        ? {
            labelAr: existingState.hifz.lastCompletedSlice.labelAr,
            pagesApprox: existingState.hifz.lastCompletedSlice.pagesApprox,
            range: existingState.hifz.lastCompletedSlice.range,
            span: existingState.hifz.lastCompletedSlice.span,
            startPage: existingState.hifz.lastCompletedSlice.startPage,
            endPage: existingState.hifz.lastCompletedSlice.endPage,
          }
        : undefined,
      lastAdvancedDate: existingState.hifz.lastAdvancedDate,
      nearStack: existingState.revision.nearStack.map((n) => ({
        id: n.id,
        priority: n.priority,
        timesServed: n.timesServed,
        lastServedDate: n.lastServedDate,
        source: n.source,
        slice: {
          labelAr: n.slice.labelAr,
          pagesApprox: n.slice.pagesApprox,
          range: n.slice.range,
          span: n.slice.span,
          startPage: n.slice.startPage,
          endPage: n.slice.endPage,
        },
      })),
      farQueue: existingState.revision.farQueue.map((n) => ({
        id: n.id,
        priority: n.priority,
        timesServed: n.timesServed,
        lastServedDate: n.lastServedDate,
        source: n.source,
        slice: {
          labelAr: n.slice.labelAr,
          pagesApprox: n.slice.pagesApprox,
          range: n.slice.range,
          span: n.slice.span,
          startPage: n.slice.startPage,
          endPage: n.slice.endPage,
        },
      })),
      farIndex: existingState.revision.farIndex,
      nearStackMax: existingState.revision.nearStackMax,
      weekLog: existingState.revision.weekLog.map((n) => ({
        id: n.id,
        priority: n.priority,
        timesServed: n.timesServed,
        lastServedDate: n.lastServedDate,
        source: n.source,
        slice: {
          labelAr: n.slice.labelAr,
          pagesApprox: n.slice.pagesApprox,
        },
      })),
      strengthScore: existingState.learning.strengthScore,
      effectiveStrength: existingState.learning.effectiveStrength,
      learningStyle: existingState.learning.learningStyle,
      revisionStyle: existingState.learning.revisionStyle,
      newHifzEnabled: existingState.learning.newHifzEnabled,
      dailyPageCapacity: existingState.learning.dailyPageCapacity,
      dailyMinuteCapacity: existingState.learning.dailyMinuteCapacity,
      planningScenarioId: existingState.planning.scenarioId,
      planningHifzEnabled: existingState.planning.hifzEnabled,
      planningDailyPageCapacity: existingState.planning.dailyPageCapacity,
      generatedDayCount: existingState.planning.generatedDayCount,
      horizonStartDate: existingState.planning.horizonStartDate,
      mistakes: existingState.mistakes.records.map((m) => ({
        id: m.id,
        surahNumber: m.surah,
        ayahNumber: m.ayah,
        pageNumber: m.page,
        type: m.category,
        frequency: m.frequency,
        note: m.note,
        lastOccurredAt: m.lastOccurredAt,
      })),
      sessions: existingState.sessions.records.map((s) => ({
        id: s.id,
        userId: s.userId,
        date: s.date,
        kind: s.kind,
        surahNumber: s.surahNumber,
        outcome: s.outcome,
        durationMinutes: s.durationMinutes,
        notes: s.notes,
        createdAt: s.createdAt,
        target: s.target,
      })),
      ayahProgress,
    };
    // Re-align pointer/far queue from onboarding selection until real progress exists
    return enrichProgressFromProfile(profile, fromState);
  }

  // Bootstrap from local UI stores when no core state yet
  const bootstrap: AppProgressSource = {
    userId: profile.name ? `local_${profile.name}` : "anonymous",
    streakDays: 0,
    strengthScore: profile.memorizationStrength,
    learningStyle: profile.learningStyle,
    revisionStyle: profile.revisionStyle,
    dailyPageCapacity: profile.pagesPerDay,
    dailyMinuteCapacity: profile.dailyMinutes,
    hifzTrack:
      profile.progressionMode === "from_start"
        ? "from_start"
        : !profile.memorizationSelection?.surahSelections?.length &&
            !profile.memorizationSelection?.juzSelections?.length &&
            !profile.memorizationSelection?.range
          ? "bottom_up"
          : "continue_forward",
    // Prefer profile-derived pointer over reader pos (reader often defaults to Fatiha)
    hifzPointer: undefined,
    mistakes: mistakes.map((m) => ({
      id: m.id,
      surahNumber: m.surahNumber,
      ayahNumber: m.ayahNumber,
      pageNumber: m.pageNumber,
      type: m.type,
      frequency: m.frequency,
      note: m.note,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
    ayahProgress,
    // memStats reserved for later session mapping
    ...(memStats ? {} : {}),
    ...(reader
      ? {
          /* reader is continuity only after real sessions — see enrich */
        }
      : {}),
  };
  return enrichProgressFromProfile(profile, bootstrap);
}

function planIsUsable(plan: GeneratedPlan | undefined): plan is GeneratedPlan {
  return !!plan && Array.isArray(plan.days) && plan.days.length > 0;
}

/**
 * Planning orchestration service.
 */
export class PlanningService {
  private readonly store: LearningStore;
  private readonly loadProfileFn: () => HafizProfile;

  constructor(options: PlanningServiceOptions = {}) {
    this.store = options.store ?? getDefaultLearningStore();
    this.loadProfileFn = options.loadProfile ?? loadProfile;
  }

  /** Load current learning snapshot (no replan). */
  getLearningSnapshot(): LearningSnapshot {
    return this.store.load();
  }

  /**
   * Persist a full learning snapshot (used by learning execution loop).
   * Application-layer only — not for UI.
   */
  persistLearningSnapshot(snapshot: LearningSnapshot): void {
    this.store.save({
      ...snapshot,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Immutable update helper for learning snapshot.
   */
  updateLearningSnapshot(
    updater: (snapshot: LearningSnapshot) => LearningSnapshot
  ): LearningSnapshot {
    const current = this.store.load();
    const next = updater(current);
    this.persistLearningSnapshot(next);
    return this.store.load();
  }

  /**
   * Get or generate today's single-day plan.
   */
  getTodayPlan(options: GetTodayPlanOptions = {}): TodayPlanResult {
    const asOfDate = toIsoDate(options.asOfDate);
    const result = this.generateJourneyPlan({
      days: 1,
      asOfDate,
      force: options.force,
      runId: `today-${asOfDate}`,
    });

    return {
      asOfDate: result.asOfDate,
      plan: result.plan,
      today: result.plan.days[0] ?? null,
      decision: result.decision,
      validation: result.validation,
      appliedRules: result.appliedRules,
      fromCache: result.fromCache,
    };
  }

  /**
   * Generate (or return cached) multi-day journey plan.
   *
   * Multi-day horizons are display/planning previews — they do not commit
   * simulated endingState into durable userState (see computeAndPersist).
   */
  generateJourneyPlan(options: GenerateJourneyOptions): JourneyPlanResult {
    const asOfDate = toIsoDate(options.asOfDate);
    const horizonDays = Math.max(1, Math.floor(options.days || 1));
    const key = cacheKey(asOfDate, horizonDays);
    const profile = this.loadProfileFn();

    // FREE_EXPLORER / EXTERNAL_TRACKER: no automatic plan engine
    if (
      profile.usageTrack === "FREE_EXPLORER" ||
      profile.usageTrack === "EXTERNAL_TRACKER" ||
      profile.hasActivePlan === false
    ) {
      return emptyManualTrackPlan(asOfDate, horizonDays, profile);
    }

    let snapshot = this.store.load();

    // Drop other-day cache entries (user returned on a new calendar day)
    const pruned = prunePlanCache(snapshot.planCache, asOfDate);
    if (Object.keys(pruned).length !== Object.keys(snapshot.planCache || {}).length) {
      snapshot = {
        ...snapshot,
        planCache: pruned as LearningSnapshot["planCache"],
      };
      this.store.save(snapshot);
    }

    const fingerprintOk = isCacheFingerprintValid(snapshot, profile, asOfDate);
    const canUseCache =
      !options.force &&
      fingerprintOk &&
      planIsUsable(snapshot.planCache[key]) &&
      !!snapshot.lastDecision?.decision &&
      snapshot.lastDecision.asOfDate === asOfDate;

    if (canUseCache) {
      const cached = snapshot.planCache[key];
      const last = snapshot.lastDecision!;
      return {
        asOfDate,
        horizonDays,
        plan: cached,
        decision: last.decision,
        validation: last.validation,
        appliedRules: last.appliedRules,
        fromCache: true,
      };
    }

    /**
     * Cache wipe policy (Journey integrity):
     * - Fingerprint miss → wipe ALL horizons (inputs changed).
     * - force alone → recompute THIS horizon only; keep sibling caches
     *   (critical: plan-reveal force:week must NOT erase today's :1 plan).
     */
    const clearAllCache = !fingerprintOk;
    return this.computeAndPersist(
      asOfDate,
      horizonDays,
      options.runId,
      clearAllCache
    );
  }

  /**
   * Clear plan cache (keep durable userState + revision memory).
   * Call after profile/capacity changes when UI cannot force-replan immediately.
   */
  invalidatePlanCache(): LearningSnapshot {
    const snapshot = this.store.load();
    const next: LearningSnapshot = {
      ...snapshot,
      planCache: {},
      cacheMeta: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.store.save(next);
    return next;
  }

  /**
   * Full reset after onboarding (or profile re-selection).
   * Clears durable userState + synthetic revision memory so the next plan
   * bootstraps from the new memorizationSelection — never a stale Fatiha pointer.
   */
  resetLearningForNewProfile(): LearningSnapshot {
    const empty: LearningSnapshot = {
      version: 1,
      updatedAt: new Date().toISOString(),
      userState: null,
      revisionMemory: [],
      planCache: {},
      lastDecision: undefined,
      cacheMeta: undefined,
    };
    this.store.save(empty);
    return empty;
  }

  /**
   * Force rebuild of learning plan for today after profile/progress change.
   */
  refreshLearningState(
    options: GetTodayPlanOptions = {}
  ): RefreshLearningStateResult {
    // Wipe stale horizons so force recompute is authoritative
    this.invalidatePlanCache();
    const today = this.getTodayPlan({ ...options, force: true });
    return {
      snapshot: this.store.load(),
      today,
    };
  }

  /**
   * Apply day progress events (skeleton).
   * - review_outcome updates revision memory via core applyReviewOutcome
   * - any completion invalidates plan cache (replan recommended)
   */
  commitDayProgress(events: DayProgressEvent[]): CommitDayProgressResult {
    const snapshot = this.store.load();
    const memory = [...snapshot.revisionMemory];
    let replanRecommended = false;

    for (const event of events) {
      if (event.type === "invalidate_plan_cache") {
        replanRecommended = true;
        continue;
      }

      if (event.type === "review_outcome") {
        const idx = memory.findIndex((m) => m.id === event.revisionMemoryId);
        if (idx >= 0) {
          const date = toIsoDate(event.date);
          memory[idx] = applyReviewOutcome(
            memory[idx],
            event.outcome,
            date
          );
          replanRecommended = true;
        }
        continue;
      }

      if (event.type === "plan_item_completed") {
        replanRecommended = true;
        if (event.revisionMemoryId && event.outcome !== "skipped") {
          const idx = memory.findIndex(
            (m) => m.id === event.revisionMemoryId
          );
          if (idx >= 0) {
            const outcome =
              event.outcome === "success"
                ? "success"
                : event.outcome === "fail"
                  ? "fail"
                  : "success";
            memory[idx] = applyReviewOutcome(
              memory[idx],
              outcome === "fail" ? "fail" : "success",
              toIsoDate(event.date)
            );
          }
        }
      }
    }

    const next: LearningSnapshot = {
      ...snapshot,
      revisionMemory: memory,
      planCache: replanRecommended ? {} : snapshot.planCache,
      cacheMeta: replanRecommended ? undefined : snapshot.cacheMeta,
      updatedAt: new Date().toISOString(),
    };
    this.store.save(next);

    return { snapshot: next, replanRecommended };
  }

  // ── internal ─────────────────────────────────────────────────────

  private computeAndPersist(
    asOfDate: string,
    horizonDays: number,
    runId?: string,
    clearAllCache = false
  ): JourneyPlanResult {
    const profile = this.loadProfileFn();
    const snapshot = this.store.load();

    const progress = loadProgressSource(profile, snapshot.userState);

    const ctx = buildPlanningContext({
      profile: {
        ...profile,
        userId: progress.userId,
      },
      progress,
      asOfDate,
      profileOptions: { userId: progress.userId },
      stateOptions: { userId: progress.userId },
    });

    // Prefer durable core UserState when available (pointer continuity)
    let planningContext = snapshot.userState
      ? {
          profile: ctx.profile,
          state: snapshot.userState,
          asOfDate: ctx.asOfDate,
        }
      : ctx;

    // ── P0–P8 Architecture envelope (seed / refresh; not Actual writer) ──
    let architecture: ArchitectureState = createArchitectureState(
      profile,
      snapshot.architecture ?? null
    );
    // Strength from evidence (P5) — signals only
    if (architecture.evidence.length >= 2) {
      architecture = {
        ...architecture,
        memorizationMap: refreshMapStrengthFromEvidence(
          architecture.memorizationMap,
          architecture.evidence
        ),
      };
    }

    const path = resolveNewHifzPath({
      intent: architecture.intent,
      map: architecture.memorizationMap,
      hifzCursor: snapshot.userState?.hifz.currentPointer ?? null,
      externalAssignments: architecture.externalAssignments,
      profile,
    });

    const pathPtr = path.newHifzPointer;
    /**
     * Align planning pointer with Path Resolver when:
     * - no Actual yet, OR
     * - Actual has no real session advance (bootstrap) and path disagrees
     *   (fixes "I memorized Baqarah" but cursor stuck re-teaching Baqarah).
     * Never rewrite cursor after real session progress (lastAdvancedDate).
     */
    const hasRealAdvance = Boolean(
      snapshot.userState?.hifz.lastAdvancedDate ||
        (snapshot.userState?.sessions?.records?.length ?? 0) > 0
    );
    const actualPtr = snapshot.userState?.hifz.currentPointer;
    const pathDisagrees =
      pathPtr &&
      actualPtr &&
      (actualPtr.surah !== pathPtr.surahId || actualPtr.ayah !== pathPtr.ayah);
    const shouldAlignPointer =
      pathPtr &&
      (!snapshot.userState || (!hasRealAdvance && pathDisagrees));

    if (shouldAlignPointer && pathPtr) {
      planningContext = {
        ...planningContext,
        state: {
          ...planningContext.state,
          hifz: {
            ...planningContext.state.hifz,
            currentPointer: {
              surah: pathPtr.surahId,
              ayah: pathPtr.ayah,
            },
          },
          planning: {
            ...planningContext.state.planning,
            currentHifzPointer: {
              surah: pathPtr.surahId,
              ayah: pathPtr.ayah,
            },
          },
        },
      };
    }

    const validated = runDecisionPipeline(planningContext);
    const geometry = createDefaultQuranGeometry();

    // ── Actual SRS bank (never replaced by plan forecast) ────────────
    let actualMemory = snapshot.revisionMemory;
    if (!actualMemory || actualMemory.length === 0) {
      actualMemory = initializeSrsFromProfile(profile, asOfDate);
    }

    // ── Adaptive load from actual sessions only ──────────────────────
    const loadAdj = computeLoadAdjustment(planningContext.state);

    // Freeze Actual HifzCursor (after path bootstrap for first plan)
    const cursorBefore = {
      surah: planningContext.state.hifz.currentPointer.surah,
      ayah: planningContext.state.hifz.currentPointer.ayah,
    };
    const lastAdvancedBefore = planningContext.state.hifz.lastAdvancedDate;
    const weekLogBefore = planningContext.state.hifz.weekHifzLog
      ? [...planningContext.state.hifz.weekHifzLog]
      : [];
    const lastCompletedBefore = planningContext.state.hifz.lastCompletedSlice;
    const sessionsBefore = planningContext.state.sessions;

    // Measurement (P1): size only — used for journey composition metadata
    const measuredNewHifz =
      pathPtr && architecture.capacity.newHifzPages > 0
        ? measureQuranRange({
            startPointer: pathPtr,
            capacityPages: architecture.capacity.newHifzPages,
            direction: "forward",
          })
        : null;

    // Sequential revision resume: same calendar day freezes start; new day continues
    const prevSeq = snapshot.revisionSeq;
    const sameDaySeq =
      prevSeq?.planDate === asOfDate && prevSeq.startOfDay
        ? prevSeq.startOfDay
        : undefined;
    const resumeSeq =
      sameDaySeq ??
      (prevSeq?.cursor && prevSeq.planDate !== asOfDate
        ? prevSeq.cursor
        : prevSeq?.cursor && !prevSeq.planDate
          ? prevSeq.cursor
          : undefined);

    const plan = generatePlan(validated, planningContext.state, {
      horizonDays,
      startDate: asOfDate,
      runId: runId ?? `journey-${asOfDate}-${horizonDays}`,
      geometry,
      revisionMemory: actualMemory,
      initialRevisionSeq: resumeSeq,
      // N Madani faces for sequential revision (profile / architecture capacity)
      revisionPages:
        architecture.capacity.revisionPages > 0
          ? architecture.capacity.revisionPages
          : profile.revisionPagesPerDay && profile.revisionPagesPerDay > 0
            ? profile.revisionPagesPerDay
            : 3,
      loadScale: {
        revisionScale:
          architecture.adaptation.revisionExposure === "intensive"
            ? Math.min(1.3, loadAdj.revisionScale * 1.15)
            : architecture.adaptation.revisionExposure === "light"
              ? Math.max(0.6, loadAdj.revisionScale * 0.85)
              : loadAdj.revisionScale,
        hifzScale:
          architecture.adaptation.difficultyBalance === "ease"
            ? Math.max(0.55, loadAdj.hifzScale * 0.85)
            : architecture.adaptation.difficultyBalance === "challenge"
              ? Math.min(1.25, loadAdj.hifzScale * 1.1)
              : loadAdj.hifzScale,
      },
    });

    // Day Composer (P3) — structure only for horizon=1 presentation
    const mutashSignals = buildMutashabihSupportSignals(
      architecture.confusion
    );
    const dailyJourney =
      horizonDays === 1
        ? composeDailyJourney({
            date: asOfDate,
            path,
            capacity: architecture.capacity,
            newHifz: measuredNewHifz,
            planItems: plan.days[0]?.items ?? [],
            adaptation: architecture.adaptation,
            mutashabihHints: mutashSignals.map((s) => ({
              reasonAr: s.reasonAr,
              surahId: s.surahId,
            })),
          })
        : snapshot.lastDailyJourney;

    architecture = {
      ...architecture,
      lastPath: path,
      lastJourney: dailyJourney ?? architecture.lastJourney,
    };

    // Forecast tip only (multi-day ending pointer) — never Actual
    const forecastEnd = plan.endingState?.hifz?.currentPointer;
    const lastForecastHint =
      horizonDays > 1 && forecastEnd
        ? {
            asOfDate,
            summaryAr: `توقع إن استمريت: سورة ${forecastEnd.surah} آية ${forecastEnd.ayah} بعد ${horizonDays} يوماً (ليس تقدماً فعلياً).`,
            projectedPointer: {
              surah: forecastEnd.surah,
              ayah: forecastEnd.ayah,
            },
          }
        : snapshot.lastForecastHint;

    const key = cacheKey(asOfDate, horizonDays);
    /**
     * Actual vs Plan vs Forecast:
     * - Actual userState: cursor/sessions frozen from pre-plan (or prior session commits)
     * - Actual revisionMemory: seeded once / session-updated — NOT endingRevisionMemory
     * - Plan: planCache only
     * - Forecast: lastForecastHint only
     */
    const commitsDurableShell = horizonDays === 1;
    const baseCache = clearAllCache
      ? {}
      : (prunePlanCache(snapshot.planCache, asOfDate) as LearningSnapshot["planCache"]);

    /**
     * Actual userState ownership:
     * - Existing Actual wins (never replaced by multi-day endingState).
     * - First 1-day plan may bootstrap a shell from endingState BUT must strip
     *   forecast artifacts (near_carry, weekHifzLog, lastAdvancedDate) that
     *   generatePlan writes during simulation — those are Plan/Forecast only.
     */
    let durableState: UserState | null = snapshot.userState;

    if (!durableState && commitsDurableShell && plan.endingState) {
      const shell = plan.endingState;
      durableState = {
        ...shell,
        hifz: {
          ...shell.hifz,
          currentPointer: { ...cursorBefore },
          lastAdvancedDate: lastAdvancedBefore,
          weekHifzLog: weekLogBefore.length ? weekLogBefore : [],
          lastCompletedSlice: lastCompletedBefore,
        },
        revision: {
          ...shell.revision,
          // Do not promote simulated near_carry into Actual nearStack
          nearStack: [],
        },
        planning: {
          ...shell.planning,
          currentHifzPointer: { ...cursorBefore },
          nearStack: [],
          weekHifzLog: weekLogBefore.length ? weekLogBefore : [],
        },
        sessions: sessionsBefore ?? shell.sessions,
      };
    } else if (durableState) {
      // Freeze Actual progress fields after any replan (1-day or multi-day)
      durableState = {
        ...durableState,
        hifz: {
          ...durableState.hifz,
          currentPointer: { ...cursorBefore },
          lastAdvancedDate: lastAdvancedBefore,
          weekHifzLog: weekLogBefore,
          lastCompletedSlice: lastCompletedBefore,
        },
        planning: {
          ...durableState.planning,
          currentHifzPointer: { ...cursorBefore },
          weekHifzLog: weekLogBefore,
        },
        sessions: sessionsBefore ?? durableState.sessions,
      };
    }

    const fingerprintSource: LearningSnapshot = {
      ...snapshot,
      userState: durableState,
      revisionMemory: actualMemory,
    };
    const fingerprint = buildPlanInputFingerprint(
      profile,
      fingerprintSource,
      asOfDate
    );

    const nowIso = new Date().toISOString();
    // Preserve Actual provenance (session_completed must not become plan_seed)
    const prevMeta = snapshot.learningStateMeta;
    const strongActual =
      prevMeta?.source === "session_completed" ||
      prevMeta?.source === "review_outcome" ||
      prevMeta?.source === "sync_merge";
    const learningStateMeta = strongActual
      ? prevMeta
      : {
          version: 2 as const,
          updatedAt: nowIso,
          source: (snapshot.userState ? "plan_seed" : "bootstrap") as
            | "plan_seed"
            | "bootstrap",
        };

    // Persist sequential stream only for durable 1-day plans (Actual pedagogy)
    let revisionSeq = snapshot.revisionSeq;
    if (commitsDurableShell) {
      const startSeq =
        plan.meta.startingRevisionSeq ??
        sameDaySeq ??
        resumeSeq;
      const endSeq = plan.meta.endingRevisionSeq ?? startSeq;
      revisionSeq = {
        planDate: asOfDate,
        startOfDay: startSeq,
        cursor: endSeq,
      };
    }

    const nextSnapshot: LearningSnapshot = {
      version: 1,
      updatedAt: nowIso,
      userState: durableState,
      revisionMemory: actualMemory,
      planCache: {
        ...baseCache,
        [key]: plan,
      },
      lastDecision: {
        asOfDate: validated.asOfDate,
        appliedRules: validated.appliedRules,
        validation: validated.validation,
        decision: validated.decision,
      },
      cacheMeta: {
        asOfDate,
        fingerprint,
      },
      loadAdjustment: {
        direction: loadAdj.direction,
        reason: loadAdj.reason,
        confidence: loadAdj.confidence,
        revisionScale: loadAdj.revisionScale,
        hifzScale: loadAdj.hifzScale,
        computedAt: nowIso,
      },
      lastForecastHint,
      learningStateMeta,
      architecture,
      lastDailyJourney: dailyJourney ?? snapshot.lastDailyJourney,
      lastPathResolution: path,
      revisionSeq,
    };

    this.store.save(nextSnapshot);

    return {
      asOfDate,
      horizonDays,
      plan,
      decision: validated.decision,
      validation: validated.validation,
      appliedRules: validated.appliedRules,
      fromCache: false,
    };
  }
}

/**
 * EXTERNAL_TRACKER / FREE_EXPLORER: empty scheduled plan shell.
 * Optional manual wird as a single optional item when set.
 */
function emptyManualTrackPlan(
  asOfDate: string,
  horizonDays: number,
  profile: HafizProfile
): JourneyPlanResult {
  const items: GeneratedPlan["days"][0]["items"] = [];
  if (
    profile.usageTrack === "EXTERNAL_TRACKER" &&
    profile.manualWird &&
    profile.manualWird.surah >= 1
  ) {
    const w = profile.manualWird;
    items.push({
      id: `manual-wird-${asOfDate}`,
      type: "NEAR_REVISION",
      surah: w.surah,
      estimatedMinutes: Math.max(10, profile.dailyMinutes || 20),
      labelAr:
        w.labelAr ||
        `الورد الحالي: سورة ${w.surah} · ${w.fromAyah}–${w.toAyah}`,
      sourceRange: {
        surah: w.surah,
        fromAyah: w.fromAyah,
        toAyah: w.toAyah,
      },
      priorityReasons: ["manual_wird", "EXTERNAL_TRACKER"],
      priorityScore: 50,
    });
  }

  const day = {
    dayNumber: 1,
    date: asOfDate,
    items,
    totalMinutes: items.reduce((s, i) => s + (i.estimatedMinutes || 0), 0),
  };

  const plan: GeneratedPlan = {
    days: Array.from({ length: horizonDays }, (_, i) => ({
      ...day,
      dayNumber: i + 1,
    })),
    startingState: {} as UserState,
    endingState: {} as UserState,
    endingRevisionMemory: Object.freeze([]),
    meta: {
      asOfDate,
      decisionValid: true,
      newHifzEnabled: false,
      revisionOnly: true,
      horizonDays,
      srsEnabled: false,
      notes: Object.freeze([
        profile.usageTrack === "FREE_EXPLORER"
          ? "FREE_EXPLORER: no automatic plan — use free tools"
          : "EXTERNAL_TRACKER: manual wird only — engine schedule off",
      ]),
    },
  };

  const decision = {
    track: "fragmented_revision_only" as const,
    newHifzEnabled: false,
    revisionOnly: true,
    dailyCapacity: {
      minutes: profile.dailyMinutes || 0,
      pages: 0,
    },
    additionalListeningPractice: false,
    additionalMistakeReview: false,
    revisionScheduleEnabled: false,
    allowNewHifz: false,
    lockProgression: true,
    strengtheningRequired: false,
    strengtheningArea: null,
    suggestedCapacityChange: null,
    revisionPriority: true,
    recommendedRevision: null,
    recoveryRequired: false,
    recoveryScope: null,
    stabilityGatePassed: true,
    appliedRules: Object.freeze(["MANUAL_TRACK"] as string[]),
    reasons: Object.freeze([]),
    effects: Object.freeze([]),
    conflicts: Object.freeze([]),
    warnings: Object.freeze([]),
    trackMeta: {},
  };

  return {
    asOfDate,
    horizonDays,
    plan,
    decision: decision as JourneyPlanResult["decision"],
    validation: { valid: true, errors: [], warnings: [] },
    appliedRules: ["MANUAL_TRACK"],
    fromCache: false,
  };
}

// ── Singleton + functional public API ───────────────────────────────

let defaultService: PlanningService | null = null;

export function getPlanningService(
  options?: PlanningServiceOptions
): PlanningService {
  if (options?.store || options?.loadProfile) {
    return new PlanningService(options);
  }
  if (!defaultService) {
    defaultService = new PlanningService();
  }
  return defaultService;
}

/** Reset singleton (tests). */
export function resetPlanningService(): void {
  defaultService = null;
}

export function getTodayPlan(
  options?: GetTodayPlanOptions
): TodayPlanResult {
  return getPlanningService().getTodayPlan(options);
}

export function generateJourneyPlan(
  options: GenerateJourneyOptions
): JourneyPlanResult {
  return getPlanningService().generateJourneyPlan(options);
}

export function refreshLearningState(
  options?: GetTodayPlanOptions
): RefreshLearningStateResult {
  return getPlanningService().refreshLearningState(options);
}

/** Clear plan cache without recomputing (profile change prep / tests). */
export function invalidatePlanCache(): LearningSnapshot {
  return getPlanningService().invalidatePlanCache();
}

/** Wipe durable state after onboarding so selection drives the next plan. */
export function resetLearningForNewProfile(): LearningSnapshot {
  return getPlanningService().resetLearningForNewProfile();
}

export function commitDayProgress(
  events: DayProgressEvent[]
): CommitDayProgressResult {
  return getPlanningService().commitDayProgress(events);
}

export function getLearningSnapshot(): LearningSnapshot {
  return getPlanningService().getLearningSnapshot();
}
