/**
 * Plan Generator — multi-day pure generation with SRS revision intelligence.
 *
 * Architecture:
 *   Validated Decision + UserState
 *     → Plan Generator
 *       → Quran Chunk Engine   (NEW_HIFZ)
 *       → SRS Revision Engine  (NEAR / FAR)
 *     → GeneratedPlan
 *
 * Does NOT:
 * - evaluate Logic Bible rules
 * - access DB / localStorage / UI
 * - invent pedagogy (Decision already decided)
 */

import type { Decision, DecisionValidationResult } from "../rules";
import type { QuranSlice, UserState } from "../models";
import type {
  RevisionContentRef,
  RevisionMemoryItem,
} from "../models/revision-memory";
import type { ValidatedDecisionResult } from "../engine/decision-runner";
import type {
  GeneratePlanOptions,
  GeneratedPlan,
  GeneratedPlanMeta,
  PlanDay,
  PlanItem,
  PlanItemSourceRange,
} from "./types";
import type {
  ChunkDirection,
  QuranChunk,
  QuranGeometry,
  QuranPointer,
} from "./quran/types";
import {
  advancePointer,
  createNextHifzChunk,
} from "./quran/chunk-engine";
import { createMetadataQuranGeometry } from "./quran/default-geometry";
import { scheduleNearRevision } from "../revision";
import { addDays } from "../revision/dates";
import {
  memorizedRangesFromMemory,
  packRevisionDay,
  type HorizonRevisionCursor,
} from "./day-revision-packer";
import type { RangeRef } from "./revision-units";

export type PlanGeneratorDecisionInput =
  | Decision
  | ValidatedDecisionResult
  | {
      decision: Decision;
      validation?: DecisionValidationResult;
      asOfDate?: string;
    };

function isValidatedResult(
  input: PlanGeneratorDecisionInput
): input is ValidatedDecisionResult {
  return (
    typeof input === "object" &&
    input !== null &&
    "decision" in input &&
    "validation" in input &&
    "appliedRules" in input
  );
}

function unwrapDecision(input: PlanGeneratorDecisionInput): {
  decision: Decision;
  validation: DecisionValidationResult;
  asOfDate?: string;
} {
  if (isValidatedResult(input)) {
    return {
      decision: input.decision,
      validation: input.validation,
      asOfDate: input.asOfDate,
    };
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "decision" in input &&
    !("newHifzEnabled" in input)
  ) {
    const bag = input as {
      decision: Decision;
      validation?: DecisionValidationResult;
      asOfDate?: string;
    };
    return {
      decision: bag.decision,
      validation: bag.validation ?? {
        valid: true,
        errors: [],
        warnings: [],
      },
      asOfDate: bag.asOfDate,
    };
  }
  const decision = input as Decision;
  return {
    decision,
    validation: { valid: true, errors: [], warnings: [] },
  };
}

/** Deep-clone UserState — never mutates caller state. */
export function cloneUserState(state: UserState): UserState {
  return JSON.parse(JSON.stringify(state)) as UserState;
}

/** Deep-clone revision memory bank. */
export function cloneRevisionMemory(
  items: readonly RevisionMemoryItem[]
): RevisionMemoryItem[] {
  return JSON.parse(JSON.stringify(items)) as RevisionMemoryItem[];
}

function addCalendarDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const d = new Date(utc);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function sumMinutes(items: readonly PlanItem[]): number {
  return items.reduce((n, it) => n + Math.max(0, it.estimatedMinutes || 0), 0);
}

function resolveDirection(
  decision: Decision,
  state: UserState
): ChunkDirection {
  if (decision.track === "bottom_up") return "backward";
  if (state.hifz.track === "bottom_up") return "backward";
  if (state.hifz.track === "from_start") return "forward";
  return "forward";
}

/**
 * Apply Decision track *label* onto working state.
 *
 * Position for NEW_HIFZ is owned by application HifzCursor → UserState pointer.
 * When continuationMode === "from_cursor" (S-003 default), we NEVER relocate
 * the pointer from continueAfterSurah / max(surah).
 *
 * continueAfterSurah remains on Decision as observability metadata only.
 */
function applyDecisionTrackToState(
  state: UserState,
  decision: Decision
): void {
  const meta = decision.trackMeta as {
    startSurah?: number;
    continueAfterSurah?: number;
    lastMemorizedSurah?: number;
    forcePointerSurah?: number;
    forcePointerAyah?: number;
    continuationMode?: string;
  };

  const fromCursor =
    meta.continuationMode === "from_cursor" ||
    decision.track === "continue_from_last_surah";

  // Executive path: track label only — keep application-resolved pointer
  if (fromCursor && decision.track !== "bottom_up") {
    state.hifz.track = "continue_forward";
    state.hifz.paused = false;
    state.planning.currentHifzPointer = { ...state.hifz.currentPointer };
    return;
  }

  if (decision.track === "bottom_up") {
    // Direction only if pointer not already set by application cursor
    // (resolveHifzCursor sets 114:1 for bottom_up). Do not recompute from meta.
    state.hifz.track = "bottom_up";
    state.hifz.paused = false;
    state.planning.currentHifzPointer = { ...state.hifz.currentPointer };
    return;
  }

  if (decision.track === "fragmented_revision_only") {
    state.hifz.track = "continue_forward";
  }
}

function resolveHifzPageCapacity(
  decision: Decision,
  state: UserState
): number {
  if (typeof decision.dailyCapacity.pages === "number") {
    return Math.max(0, decision.dailyCapacity.pages);
  }
  if (typeof state.learning.dailyPageCapacity === "number") {
    return Math.max(0, state.learning.dailyPageCapacity);
  }
  if (typeof state.planning.dailyPageCapacity === "number") {
    return Math.max(0, state.planning.dailyPageCapacity);
  }
  return decision.newHifzEnabled ? 1 : 0;
}

function resolveMinuteCap(decision: Decision, state: UserState): number {
  if (typeof decision.dailyCapacity.minutes === "number") {
    return Math.max(0, decision.dailyCapacity.minutes);
  }
  return Math.max(0, state.learning.dailyMinuteCapacity || 0);
}

/** Days since last planned/advanced activity (sliding-window compress). */
function estimateAbsenceDays(state: UserState, asOf: string): number {
  const last =
    state.hifz.lastAdvancedDate ||
    state.lastPlannedDate ||
    state.updatedAt ||
    "";
  if (!last || last.length < 10 || asOf.length < 10) return 0;
  const a = Date.parse(asOf.slice(0, 10) + "T12:00:00Z");
  const b = Date.parse(last.slice(0, 10) + "T12:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((a - b) / 86400000));
}

function toQuranPointer(state: UserState): QuranPointer {
  return {
    surahNumber: state.hifz.currentPointer.surah,
    ayahNumber: state.hifz.currentPointer.ayah,
  };
}

function applyPointerToState(state: UserState, pointer: QuranPointer): void {
  state.hifz.currentPointer = {
    surah: pointer.surahNumber,
    ayah: pointer.ayahNumber,
  };
  state.planning.currentHifzPointer = {
    surah: pointer.surahNumber,
    ayah: pointer.ayahNumber,
  };
}

function chunkToSourceRange(chunk: QuranChunk): PlanItemSourceRange {
  return {
    surah: chunk.startPointer.surahNumber,
    fromAyah: chunk.startPointer.ayahNumber,
    toAyah: chunk.endPointer.ayahNumber,
    fromSurah: chunk.surahRange.fromSurah,
    toSurah: chunk.surahRange.toSurah,
    startPage: chunk.startPointer.pageNumber,
    endPage: chunk.endPointer.pageNumber,
    pagesApprox: chunk.pages,
  };
}

function chunkToSlice(chunk: QuranChunk): QuranSlice {
  const multi =
    chunk.surahRange.fromSurah !== chunk.surahRange.toSurah ||
    chunk.startPointer.surahNumber !== chunk.endPointer.surahNumber;

  return {
    labelAr: chunk.labelAr ?? "حفظ جديد",
    pagesApprox: chunk.pages,
    startPage: chunk.startPointer.pageNumber,
    endPage: chunk.endPointer.pageNumber,
    range: multi
      ? undefined
      : {
          surah: chunk.startPointer.surahNumber,
          fromAyah: chunk.startPointer.ayahNumber,
          toAyah: chunk.endPointer.ayahNumber,
        },
    span: multi
      ? {
          fromSurah: chunk.surahRange.fromSurah,
          toSurah: chunk.surahRange.toSurah,
        }
      : undefined,
  };
}

function chunkToContentRef(chunk: QuranChunk): RevisionContentRef {
  return {
    surah: chunk.startPointer.surahNumber,
    page: chunk.startPointer.pageNumber,
    fromAyah: chunk.startPointer.ayahNumber,
    toAyah: chunk.endPointer.ayahNumber,
    fromSurah: chunk.surahRange.fromSurah,
    toSurah: chunk.surahRange.toSurah,
    pagesApprox: chunk.pages,
    labelAr: chunk.labelAr,
  };
}

function hifzItemFromChunk(
  chunk: QuranChunk,
  dayNumber: number,
  runId: string
): PlanItem {
  const base = chunk.labelAr?.trim() || "ورد جديد";
  return {
    id: `${runId}-d${dayNumber}-NEW_HIFZ`,
    type: "NEW_HIFZ",
    sourceRange: chunkToSourceRange(chunk),
    surah: chunk.startPointer.surahNumber,
    page: chunk.startPointer.pageNumber,
    estimatedMinutes: Math.max(1, chunk.estimatedMinutes),
    // Always prefix so users never confuse with revision of known material
    labelAr: base.startsWith("حفظ") ? base : `حفظ جديد: ${base}`,
  };
}

/**
 * Map UserState revision queues → ephemeral RevisionMemoryItem[] when
 * no explicit memory bank is provided (enables SRS path without app wiring).
 */
function memoryFromUserState(
  state: UserState,
  asOfDate: string
): RevisionMemoryItem[] {
  const out: RevisionMemoryItem[] = [];

  for (const n of state.revision.nearStack) {
    out.push({
      id: n.id,
      content: {
        surah: n.slice.range?.surah,
        fromAyah: n.slice.range?.fromAyah,
        toAyah: n.slice.range?.toAyah,
        fromSurah: n.slice.span?.fromSurah,
        toSurah: n.slice.span?.toSurah,
        page: n.slice.startPage,
        pagesApprox: n.slice.pagesApprox,
        labelAr: n.slice.labelAr,
      },
      lastReviewedAt: n.lastServedDate ?? null,
      reviewCount: n.timesServed || 0,
      mistakesCount: 0,
      successRate: 1,
      strengthScore: 0.55,
      stabilityScore: 0.4,
      nextReviewDate: asOfDate,
      intervalDays: 1,
      easeFactor: 2.5,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      isNear: true,
      urgent: false,
      source: "near_carry",
    });
  }

  // Prefer application-layer initializeSrsFromProfile when possible.
  // Fallback: stagger first due dates — never dump entire corpus as due today.
  let idx = 0;
  for (const f of state.revision.farQueue) {
    const prio = f.priority || 0;
    const strengthScore =
      prio >= 160 ? 0.25 : prio >= 120 ? 0.4 : prio >= 80 ? 0.55 : 0.75;
    const stabilityScore = Math.max(0.2, strengthScore - 0.1);
    const pages = Math.max(0.25, f.slice.pagesApprox ?? 0.5);
    const baseInterval =
      strengthScore >= 0.8 ? 7 : strengthScore >= 0.65 ? 4 : strengthScore >= 0.5 ? 2 : 1;
    const stagger = idx % (strengthScore >= 0.65 ? 7 : 4);
    const firstDueIn = baseInterval + stagger;
    // addCalendarDays-compatible via ISO parse
    const nextReviewDate = (() => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOfDate);
      if (!m) return asOfDate;
      const utc = Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]) + firstDueIn
      );
      const d = new Date(utc);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    })();
    out.push({
      id: f.id,
      content: {
        surah: f.slice.range?.surah,
        fromAyah: f.slice.range?.fromAyah,
        toAyah: f.slice.range?.toAyah,
        fromSurah: f.slice.span?.fromSurah,
        toSurah: f.slice.span?.toSurah,
        page: f.slice.startPage,
        pagesApprox: pages,
        labelAr: f.slice.labelAr,
      },
      lastReviewedAt: f.lastServedDate ?? null,
      reviewCount: f.timesServed || 0,
      mistakesCount: 0,
      successRate: Math.min(0.95, 0.5 + strengthScore * 0.4),
      strengthScore,
      stabilityScore,
      nextReviewDate,
      intervalDays: baseInterval,
      easeFactor: 2.5,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      isNear: false,
      urgent: strengthScore < 0.3,
      source: "far_corpus",
    });
    idx++;
  }

  return out;
}

/**
 * Horizon simulation only: after packing a revision item into a day, push its
 * next due date so the same short surah cannot monopolize every day of the week.
 * Does not write ActualState (application never commits endingRevisionMemory).
 */
function markPlannedInHorizon(
  memory: RevisionMemoryItem[],
  ids: Iterable<string>,
  asOfDate: string
): RevisionMemoryItem[] {
  const set = new Set(ids);
  if (set.size === 0) return memory;
  return memory.map((m) => {
    if (!set.has(m.id)) return m;
    const interval = Math.max(1, m.intervalDays || 1);
    return {
      ...m,
      content: { ...m.content },
      isNear: false,
      urgent: false,
      lastReviewedAt: asOfDate,
      nextReviewDate: addDays(asOfDate, interval),
    };
  });
}

/** Best-effort link of pedagogical units → SRS bank ids. */
function attachMemoryIds(
  items: PlanItem[],
  memory: readonly RevisionMemoryItem[]
): PlanItem[] {
  return items.map((item) => {
    if (item.revisionMemoryId) return item;
    const surah = item.surah ?? item.sourceRange?.surah;
    const from = item.sourceRange?.fromAyah;
    const to = item.sourceRange?.toAyah;
    if (surah == null) return item;
    const hit = memory.find((m) => {
      if (m.content.surah !== surah) return false;
      const mf = m.content.fromAyah ?? 1;
      const mt = m.content.toAyah ?? mf;
      if (from == null || to == null) return true;
      // overlap
      return mf <= to && mt >= from;
    });
    if (!hit) return item;
    return {
      ...item,
      revisionMemoryId: hit.id,
      // Prefer pedagogical score; keep SRS score as secondary signal in reasons
      priorityReasons: [
        ...(item.priorityReasons ?? []),
        ...(hit.urgent ? ["srs:urgent"] : []),
      ],
    };
  });
}

/** Urgent single-ayah recovery only — never routine 52→52. */
function findUrgentSingleAyah(
  memory: readonly RevisionMemoryItem[]
): RangeRef | null {
  const hit = memory.find(
    (m) =>
      m.urgent === true &&
      (m.consecutiveFailures ?? 0) > 0 &&
      typeof m.content.surah === "number" &&
      typeof m.content.fromAyah === "number"
  );
  if (!hit || hit.content.surah == null || hit.content.fromAyah == null) {
    return null;
  }
  const a = hit.content.fromAyah;
  return {
    surah: hit.content.surah,
    fromAyah: a,
    toAyah: hit.content.toAyah ?? a,
  };
}

/**
 * Pack candidates in priority order under a hard minute ceiling.
 * Always tries to keep the first item of each higher tier when possible.
 */
function packByPriority(
  tiers: PlanItem[][],
  maxMinutes: number
): PlanItem[] {
  const out: PlanItem[] = [];
  let used = 0;
  const cap =
    maxMinutes > 0 ? maxMinutes : Number.POSITIVE_INFINITY;

  for (const tier of tiers) {
    for (const item of tier) {
      const m = Math.max(0, item.estimatedMinutes || 0);
      if (used + m <= cap || (out.length === 0 && m > 0)) {
        // Allow first item even if slightly over empty day (edge: tiny cap)
        if (used + m > cap && out.length > 0) continue;
        if (used + m > cap && out.length === 0 && cap < m) {
          // Still add one required item scaled? Keep full for near required.
          out.push(item);
          used += m;
          continue;
        }
        out.push(item);
        used += m;
      }
    }
  }
  return out;
}

function pushNearCarry(
  working: UserState,
  chunk: QuranChunk,
  dayNumber: number,
  date: string | undefined
): void {
  const item = {
    id: `near_carry_d${dayNumber}`,
    slice: chunkToSlice(chunk),
    priority: 1000 + dayNumber,
    timesServed: 0,
    lastServedDate: date,
    source: "near_carry" as const,
  };
  working.revision.nearStack.push(item);
  working.planning.nearStack = [...working.revision.nearStack];

  const max = working.revision.nearStackMax || 7;
  if (working.revision.nearStack.length > max) {
    working.revision.nearStack.splice(
      0,
      working.revision.nearStack.length - max
    );
    working.planning.nearStack = [...working.revision.nearStack];
  }

  working.hifz.weekHifzLog.push(chunkToSlice(chunk));
  working.planning.weekHifzLog = [...working.hifz.weekHifzLog];
  working.hifz.lastCompletedSlice = chunkToSlice(chunk);
  if (date) working.hifz.lastAdvancedDate = date;
}

/**
 * Generate a multi-day plan from Decision + UserState + optional SRS memory.
 */
export function generatePlan(
  decisionInput: PlanGeneratorDecisionInput,
  state: UserState,
  options: GeneratePlanOptions = {}
): GeneratedPlan {
  const { decision, validation, asOfDate } = unwrapDecision(decisionInput);

  const horizonDays = Math.max(
    0,
    Math.floor(
      typeof options.horizonDays === "number" ? options.horizonDays : 1
    )
  );

  const runId = options.runId ?? "plan";
  const startDate = options.startDate ?? asOfDate;
  const geometry: QuranGeometry =
    options.geometry ?? createMetadataQuranGeometry();

  const startingState = cloneUserState(state);
  const working = cloneUserState(state);

  // Working SRS bank (clone — never touch caller array)
  const seedAsOf =
    startDate && startDate.length >= 10
      ? startDate.slice(0, 10)
      : asOfDate ?? "1970-01-01";

  let workingMemory: RevisionMemoryItem[] =
    options.revisionMemory && options.revisionMemory.length > 0
      ? cloneRevisionMemory(options.revisionMemory)
      : memoryFromUserState(working, seedAsOf);

  const notes: string[] = [];
  const srsEnabled = true;

  if (!validation.valid) {
    notes.push(
      "Decision validation reported errors; returning empty day list."
    );
    for (const e of validation.errors) {
      notes.push(`validation: ${e}`);
    }
  }

  if (horizonDays === 0) {
    notes.push("horizonDays=0 → empty plan (no day shells).");
  }

  const revisionOnly =
    decision.revisionOnly === true || decision.newHifzEnabled === false;

  if (revisionOnly) {
    notes.push("Revision-only / hifz disabled → no NEW_HIFZ items.");
  }

  notes.push(
    "Multi-day generator: RevisionPolicy (70/20/10) + Quran chunks for NEW_HIFZ."
  );

  const days: PlanDay[] = [];

  /** Memory ids scheduled as near from previous day's hifz */
  let previousNearMemoryId: string | null = null;
  /**
   * Sequential revision horizon — finish surah before next.
   * Do NOT hardcode rangeIdx 0 (that restarts at Fatiha every day).
   * Seed from options when resuming; packer defaults to primary if seq omitted.
   */
  const initialSeq = options.initialRevisionSeq;
  let revisionHorizon: HorizonRevisionCursor = {
    stabilizeAyah: initialSeq?.ayah ?? 1,
    corpus: initialSeq
      ? { rangeIdx: initialSeq.rangeIdx, ayah: initialSeq.ayah }
      : { rangeIdx: 0, ayah: 1 },
    seq: initialSeq
      ? { rangeIdx: initialSeq.rangeIdx, ayah: initialSeq.ayah }
      : undefined,
  };
  let capturedStartSeq: { rangeIdx: number; ayah: number } | undefined =
    initialSeq
      ? { rangeIdx: initialSeq.rangeIdx, ayah: initialSeq.ayah }
      : undefined;
  let previousHifzRange: RangeRef | null = null;

  // Align NEW_HIFZ pointer with Decision track (never leave stale Fatiha default
  // when S-003 says continue after last memorized surah).
  applyDecisionTrackToState(working, decision);

  const direction = resolveDirection(decision, working);
  const pageCap = resolveHifzPageCapacity(decision, working);
  const minuteCap = resolveMinuteCap(decision, working);

  /**
   * Split daily capacity so revision protects memorization but never replaces it.
   * Example 60m: ~35m revision + ~25m NEW_HIFZ (when hifz enabled).
   * R-002 recommended revision is honored but capped so hifz keeps ≥25% of day.
   */
  const revScale = Math.min(
    1.4,
    Math.max(0.5, options.loadScale?.revisionScale ?? 1)
  );
  const hifzScale = Math.min(
    1.3,
    Math.max(0.5, options.loadScale?.hifzScale ?? 1)
  );

  const recRevMin = decision.recommendedRevision?.minutes;
  let revisionMinuteBudget: number;
  let hifzMinuteBudget: number;
  if (revisionOnly) {
    revisionMinuteBudget = Math.round(minuteCap * revScale);
    hifzMinuteBudget = 0;
  } else {
    const defaultRev = Math.round(minuteCap * 0.58); // ~35 of 60
    const minHifz = Math.max(8, Math.round(minuteCap * 0.25)); // ≥25% reserved
    const rawRev =
      typeof recRevMin === "number" && recRevMin > 0
        ? recRevMin
        : defaultRev;
    revisionMinuteBudget = Math.round(
      Math.min(rawRev, minuteCap - minHifz) * revScale
    );
    hifzMinuteBudget = Math.round(
      Math.max(minHifz, minuteCap - revisionMinuteBudget / Math.max(0.5, revScale)) *
        hifzScale
    );
    // Re-clamp so total stays sensible
    if (revisionMinuteBudget + hifzMinuteBudget > minuteCap) {
      const overflow = revisionMinuteBudget + hifzMinuteBudget - minuteCap;
      revisionMinuteBudget = Math.max(
        5,
        revisionMinuteBudget - Math.ceil(overflow * 0.6)
      );
      hifzMinuteBudget = Math.max(0, minuteCap - revisionMinuteBudget);
    }
    // Adaptive decrease must not eliminate NEW_HIFZ when Decision allows it
    if (decision.newHifzEnabled && hifzMinuteBudget < 8) {
      hifzMinuteBudget = 8;
      revisionMinuteBudget = Math.max(5, minuteCap - hifzMinuteBudget);
    }
  }

  // Sliding window: after multi-day absence, compress revision load (no 30-task dump)
  const absenceDays = estimateAbsenceDays(working, seedAsOf);
  const compressFactor =
    absenceDays >= 7 ? 0.45 : absenceDays >= 3 ? 0.65 : 1;

  const maxRevItems =
    typeof options.maxFarItemsPerDay === "number"
      ? Math.max(1, options.maxFarItemsPerDay + 1)
      : revisionOnly
        ? Math.max(2, Math.round(5 * compressFactor))
        : Math.max(2, Math.round(4 * compressFactor));

  // Ranges for policy (from SRS bank — due still lives in SRS; order from policy)
  const baseMemorizedRanges = memorizedRangesFromMemory(workingMemory);

  if (validation.valid && horizonDays > 0) {
    for (let i = 0; i < horizonDays; i++) {
      const dayNumber = i + 1;
      const date =
        startDate != null && startDate.length >= 10
          ? addCalendarDays(startDate.slice(0, 10), i)
          : seedAsOf;

      // ── 1–3. Pedagogical revision via RevisionPolicy + Units ──
      // SRS remains due-engine only: urgent recovery items may inject single-ayah.
      const urgentSingle = findUrgentSingleAyah(workingMemory);

      const packedRev = packRevisionDay({
        hifzPointer: {
          surah: working.hifz.currentPointer.surah,
          ayah: working.hifz.currentPointer.ayah,
        },
        memorizedRanges: baseMemorizedRanges,
        revisionMinutes: Math.max(
          5,
          Math.round(revisionMinuteBudget * compressFactor)
        ),
        revisionPages:
          typeof options.revisionPages === "number" && options.revisionPages > 0
            ? options.revisionPages
            : 3,
        previousHifz: previousHifzRange,
        horizonCursor: revisionHorizon,
        geometry,
        dayNumber,
        runId,
        maxItems: maxRevItems,
        urgentSingleAyah: urgentSingle,
      });
      revisionHorizon = packedRev.nextCursor;
      if (!capturedStartSeq && packedRev.startCursor.seq) {
        capturedStartSeq = {
          rangeIdx: packedRev.startCursor.seq.rangeIdx,
          ayah: packedRev.startCursor.seq.ayah,
        };
      }
      for (const n of packedRev.notes) notes.push(`d${dayNumber}: ${n}`);

      // Attach previous near memory id to first neighborhood-like item if present
      if (previousNearMemoryId && packedRev.items[0]) {
        packedRev.items[0] = {
          ...packedRev.items[0],
          revisionMemoryId: previousNearMemoryId,
        };
      }

      // Link SRS memory ids when content overlaps (due engine stays internal)
      const revisionTier = attachMemoryIds(packedRev.items, workingMemory);

      // ── 4. NEW_HIFZ candidate (Decision-gated; packed last) ──
      const hifzTier: PlanItem[] = [];
      let pendingHifz: {
        item: PlanItem;
        chunk: QuranChunk;
        nearMem: RevisionMemoryItem;
      } | null = null;

      // Warm-up lock: only failed/urgent NEAR holds — not entire far corpus flags
      const warmUpLocked =
        decision.lockProgression === true ||
        decision.recoveryRequired === true ||
        workingMemory.some(
          (m) =>
            m.isNear === true &&
            (m.urgent === true ||
              (m.consecutiveFailures ?? 0) > 0 ||
              ((m.successRate ?? 1) < 0.5 && (m.reviewCount ?? 0) >= 1))
        );

      if (
        !revisionOnly &&
        decision.newHifzEnabled &&
        pageCap > 0 &&
        !warmUpLocked &&
        hifzMinuteBudget > 0
      ) {
        const pointer = toQuranPointer(working);
        const scaledPages = Math.max(0.25, pageCap * hifzScale);
        const hifzMinutes = Math.max(
          1,
          Math.min(
            hifzMinuteBudget,
            Math.round(scaledPages * 12) || Math.round(hifzMinuteBudget * 0.9)
          )
        );
        const chunk = createNextHifzChunk(
          pointer,
          { pages: scaledPages, minutes: hifzMinutes },
          geometry,
          { direction }
        );

        if (chunk) {
          const hifzItem = hifzItemFromChunk(chunk, dayNumber, runId);
          // Schedule near revision via SRS API (not duplicated logic)
          const nearMem = scheduleNearRevision(
            `${runId}-near-d${dayNumber}`,
            chunkToContentRef(chunk),
            date
          );
          hifzItem.revisionMemoryId = nearMem.id;
          pendingHifz = { item: hifzItem, chunk, nearMem };
          hifzTier.push(hifzItem);
        }
      } else if (warmUpLocked && !revisionOnly) {
        notes.push(
          "Warm-up lock: critical prior material must stabilize before new hifz."
        );
      }

      // ── Capacity pack ──
      // Revision: N Madani pages is a HARD budget from packRevisionDay.
      // Do NOT drop sequential pages by minute cap (that advanced the cursor
      // past pages that never appeared → holes like ص2,3 then ص5,6).
      const revisionPacked = revisionTier;
      let hifzPacked = packByPriority([hifzTier], hifzMinuteBudget);
      // Guaranteed NEW_HIFZ slot when Decision enables it and a chunk exists
      if (
        !revisionOnly &&
        decision.newHifzEnabled &&
        pendingHifz &&
        hifzPacked.length === 0 &&
        hifzTier.length > 0
      ) {
        hifzPacked = [hifzTier[0]];
      }
      const packed = [...revisionPacked, ...hifzPacked];

      // Apply hifz side-effects only if NEW_HIFZ survived packing
      let todayHifz: PlanItem | null = null;
      let todayNearMemoryId: string | null = null;

      const hifzInDay = packed.find((p) => p.type === "NEW_HIFZ");
      if (pendingHifz && hifzInDay) {
        todayHifz = hifzInDay;
        todayNearMemoryId = pendingHifz.nearMem.id;
        const nextPtr = advancePointer(
          toQuranPointer(working),
          pendingHifz.chunk,
          geometry,
          { direction }
        );
        applyPointerToState(working, nextPtr);
        pushNearCarry(working, pendingHifz.chunk, dayNumber, date);
        // Add scheduled near unit to working memory for later days
        workingMemory = [...workingMemory, pendingHifz.nearMem];
      }

      previousNearMemoryId = todayNearMemoryId;
      if (todayHifz?.sourceRange?.surah && todayHifz.sourceRange.fromAyah) {
        previousHifzRange = {
          surah: todayHifz.sourceRange.surah,
          fromAyah: todayHifz.sourceRange.fromAyah,
          toAyah:
            todayHifz.sourceRange.toAyah ?? todayHifz.sourceRange.fromAyah,
        };
      }

      // Simulate SRS consumption across the horizon (plan-only; not Actual)
      const plannedIds = packed
        .map((p) => p.revisionMemoryId)
        .filter((id): id is string => Boolean(id));
      workingMemory = markPlannedInHorizon(workingMemory, plannedIds, date);

      working.planning.generatedDayCount = dayNumber;
      working.planning.hifzEnabled = decision.newHifzEnabled && !revisionOnly;

      days.push({
        dayNumber,
        date,
        items: packed,
        totalMinutes: sumMinutes(packed),
      });
    }
  }

  if (startDate && days.length > 0) {
    working.lastPlannedDate =
      days[days.length - 1]?.date ?? startDate.slice(0, 10);
  }
  working.updatedAt = working.lastPlannedDate ?? startingState.updatedAt;

  const endingSeq = revisionHorizon.seq
    ? {
        rangeIdx: revisionHorizon.seq.rangeIdx,
        ayah: revisionHorizon.seq.ayah,
      }
    : undefined;

  const meta: GeneratedPlanMeta = {
    asOfDate: asOfDate ?? startDate,
    decisionValid: validation.valid,
    newHifzEnabled: decision.newHifzEnabled && !revisionOnly,
    revisionOnly,
    horizonDays,
    srsEnabled,
    notes: Object.freeze([...notes]),
    startingRevisionSeq: capturedStartSeq,
    endingRevisionSeq: endingSeq,
  };

  return {
    days,
    startingState,
    endingState: working,
    endingRevisionMemory: Object.freeze(cloneRevisionMemory(workingMemory)),
    meta,
  };
}
