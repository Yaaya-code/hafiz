/**
 * Phase 3 — Cloud sync integrity: Intent / Actual / Forecast merge rules.
 *
 * Does NOT touch Decision, Planner algorithms, or HifzCursor design.
 * Pure functions — usable on client (local apply) and server (push merge).
 */

import type { HafizProfile } from "@/lib/user-profile";
import { getDefaultProfile } from "@/lib/user-profile";
import type { LearningSnapshotCloud } from "@/lib/sync/types";

// ── Learning state meta (versioning / source of truth) ──────────────

export type LearningStateSource =
  | "session_completed"
  | "review_outcome"
  | "sync_merge"
  | "plan_seed"
  | "bootstrap"
  | "unknown";

export type LearningStateMeta = {
  /** Envelope schema version (Phase 3 = 2) */
  version: number;
  updatedAt: string;
  source: LearningStateSource;
};

export const LEARNING_STATE_META_VERSION = 2;

const SOURCE_RANK: Record<LearningStateSource, number> = {
  session_completed: 50,
  review_outcome: 40,
  sync_merge: 30,
  bootstrap: 20,
  plan_seed: 10,
  unknown: 0,
};

export function makeLearningStateMeta(
  source: LearningStateSource,
  updatedAt?: string
): LearningStateMeta {
  return {
    version: LEARNING_STATE_META_VERSION,
    updatedAt: updatedAt || new Date().toISOString(),
    source,
  };
}

// ── Validation ──────────────────────────────────────────────────────

export type LearningSnapshotValidation = {
  ok: boolean;
  errors: string[];
};

/**
 * Structural validation for cloud LearningSnapshot payloads.
 * Rejects garbage / oversized blobs before merge or persist.
 */
export function validateLearningSnapshotCloud(
  raw: unknown
): LearningSnapshotValidation {
  const errors: string[] = [];
  if (raw == null) {
    return { ok: true, errors: [] }; // null is allowed (no learning state yet)
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["learningSnapshot must be an object"] };
  }
  const s = raw as Record<string, unknown>;

  if (s.version != null && s.version !== 1) {
    errors.push("learningSnapshot.version must be 1 when present");
  }
  if (s.userState != null && (typeof s.userState !== "object" || Array.isArray(s.userState))) {
    errors.push("userState must be an object or null");
  }
  if (s.revisionMemory != null && !Array.isArray(s.revisionMemory)) {
    errors.push("revisionMemory must be an array");
  }
  if (Array.isArray(s.revisionMemory) && s.revisionMemory.length > 5000) {
    errors.push("revisionMemory too large (>5000)");
  }
  if (s.planCache != null && (typeof s.planCache !== "object" || Array.isArray(s.planCache))) {
    errors.push("planCache must be an object");
  }
  if (s.planCache && typeof s.planCache === "object") {
    const keys = Object.keys(s.planCache as object);
    if (keys.length > 60) errors.push("planCache too large (>60 entries)");
  }

  // Soft-check cursor shape if present
  const us = s.userState as Record<string, unknown> | null | undefined;
  if (us && typeof us === "object") {
    const hifz = us.hifz as Record<string, unknown> | undefined;
    const ptr = hifz?.currentPointer as { surah?: unknown; ayah?: unknown } | undefined;
    if (ptr) {
      if (typeof ptr.surah === "number" && (ptr.surah < 1 || ptr.surah > 114)) {
        errors.push("hifz.currentPointer.surah out of range");
      }
      if (typeof ptr.ayah === "number" && (ptr.ayah < 1 || ptr.ayah > 300)) {
        errors.push("hifz.currentPointer.ayah out of range");
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Pointer / progress helpers ──────────────────────────────────────

export type HifzPointerLike = { surah: number; ayah: number };

/** Quran order: higher surah, then higher ayah = further forward progress. */
export function compareHifzPointer(
  a: HifzPointerLike | null | undefined,
  b: HifzPointerLike | null | undefined
): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.surah !== b.surah) return a.surah - b.surah;
  return a.ayah - b.ayah;
}

/** Never go backward: pick the more advanced pointer. */
export function maxHifzPointer(
  a: HifzPointerLike | null | undefined,
  b: HifzPointerLike | null | undefined
): HifzPointerLike | null {
  if (!a && !b) return null;
  if (!a) return b ? { surah: b.surah, ayah: b.ayah } : null;
  if (!b) return { surah: a.surah, ayah: a.ayah };
  return compareHifzPointer(a, b) >= 0
    ? { surah: a.surah, ayah: a.ayah }
    : { surah: b.surah, ayah: b.ayah };
}

function isMushafTerminal(p: HifzPointerLike | null | undefined): boolean {
  return Boolean(p && p.surah >= 114);
}

/**
 * Merge NEW_HIFZ pointers across devices.
 * - Prefer side with real lastAdvancedDate / more sessions
 * - Never let a plan_seed park at An-Nas (114) overwrite mid-mushaf progress
 * - Otherwise never regress (max)
 */
export function mergeHifzPointers(input: {
  local?: HifzPointerLike | null;
  remote?: HifzPointerLike | null;
  localLastAdvanced?: string | null;
  remoteLastAdvanced?: string | null;
  localSessionCount?: number;
  remoteSessionCount?: number;
}): HifzPointerLike | null {
  const L = input.local;
  const R = input.remote;
  if (!L && !R) return null;
  if (!L) return R ? { surah: R.surah, ayah: R.ayah } : null;
  if (!R) return { surah: L.surah, ayah: L.ayah };

  const lAdv = input.localLastAdvanced || "";
  const rAdv = input.remoteLastAdvanced || "";
  if (lAdv && rAdv) {
    return lAdv >= rAdv
      ? { surah: L.surah, ayah: L.ayah }
      : { surah: R.surah, ayah: R.ayah };
  }
  if (lAdv && !rAdv) return { surah: L.surah, ayah: L.ayah };
  if (rAdv && !lAdv) return { surah: R.surah, ayah: R.ayah };

  const lS = input.localSessionCount ?? 0;
  const rS = input.remoteSessionCount ?? 0;
  if (lS > 0 && rS === 0) return { surah: L.surah, ayah: L.ayah };
  if (rS > 0 && lS === 0) return { surah: R.surah, ayah: R.ayah };

  // Stale plan_seed often leaves 114:1 while real continuation is e.g. 2:91
  if (isMushafTerminal(L) && !isMushafTerminal(R)) {
    return { surah: R.surah, ayah: R.ayah };
  }
  if (isMushafTerminal(R) && !isMushafTerminal(L)) {
    return { surah: L.surah, ayah: L.ayah };
  }

  return maxHifzPointer(L, R);
}

function maxIsoDate(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b || undefined;
  if (!b) return a;
  return a >= b ? a : b;
}

function parseTs(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

// ── Intent merge (Profile) ──────────────────────────────────────────

const INTENT_KEYS = [
  "learningGoalId",
  "progressionMode",
  "goals",
  "memorizationSelection",
  "dailyMinutes",
  "pagesPerDay",
  "revisionPagesPerDay",
  "revisionSessionsPerDay",
  "memorizationStrength",
  "revisionStyle",
  "learningStyle",
  "preferredQariId",
  "name",
  "usageTrack",
  "hasActivePlan",
  "hifzStartPreference",
  "customStartSurah",
  "manualWird",
] as const;

function intentTimestamp(p: HafizProfile | null | undefined): number {
  if (!p) return 0;
  // Prefer explicit intent stamp, then onboarding completion time
  const raw =
    (p as HafizProfile & { intentUpdatedAt?: string }).intentUpdatedAt ||
    p.completedAt ||
    "";
  return parseTs(raw);
}

/**
 * User Intent merge: newest intent wins.
 * Never invent incomplete defaults over completed onboarding.
 * Actual progress is NOT here.
 */
export function mergeUserIntent(
  local: HafizProfile | null,
  remote: HafizProfile | null
): HafizProfile | null {
  if (!local && !remote) return null;
  if (!local) return remote ? { ...getDefaultProfile(), ...remote, version: 2 } : null;
  if (!remote) return { ...getDefaultProfile(), ...local, version: 2 };

  const localComplete = local.onboardingComplete === true;
  const remoteComplete = remote.onboardingComplete === true;

  // Sticky onboarding: never downgrade complete → incomplete
  if (localComplete && !remoteComplete) {
    return {
      ...getDefaultProfile(),
      ...remote,
      ...local,
      onboardingComplete: true,
      plan: local.plan ?? remote.plan,
      completedAt: local.completedAt || remote.completedAt || "",
      memorizationSelection:
        local.memorizationSelection ?? remote.memorizationSelection,
      learningGoalId: local.learningGoalId ?? remote.learningGoalId,
      progressionMode: local.progressionMode ?? remote.progressionMode,
      goals: local.goals?.length ? local.goals : remote.goals || [],
      version: 2,
    };
  }

  const lt = intentTimestamp(local);
  const rt = intentTimestamp(remote);
  // Newer intent wins scalar intent fields; fill gaps from the other side
  const newer = rt > lt ? remote : local;
  const older = rt > lt ? local : remote;

  const base: HafizProfile = {
    ...getDefaultProfile(),
    ...older,
    ...newer,
    version: 2,
    onboardingComplete: localComplete || remoteComplete,
  };

  // Intent fields: prefer newer non-empty
  for (const key of INTENT_KEYS) {
    const nVal = newer[key as keyof HafizProfile];
    const oVal = older[key as keyof HafizProfile];
    if (nVal === undefined || nVal === null || nVal === "") {
      if (oVal !== undefined && oVal !== null && oVal !== "") {
        (base as Record<string, unknown>)[key] = oVal;
      }
    }
  }

  // memorizationSelection: never drop declared corpus for empty shell
  const nSel = newer.memorizationSelection;
  const oSel = older.memorizationSelection;
  const nEmpty =
    !nSel ||
    ((nSel.surahSelections?.length ?? 0) === 0 &&
      (nSel.juzSelections?.length ?? 0) === 0);
  const oEmpty =
    !oSel ||
    ((oSel.surahSelections?.length ?? 0) === 0 &&
      (oSel.juzSelections?.length ?? 0) === 0);
  if (nEmpty && !oEmpty) {
    base.memorizationSelection = oSel;
  }

  // goals: prefer non-empty
  if (!base.goals?.length && older.goals?.length) {
    base.goals = older.goals;
  }

  // plan: prefer completed side
  if (localComplete && remoteComplete) {
    base.plan = rt > lt ? remote.plan ?? local.plan : local.plan ?? remote.plan;
    base.completedAt =
      rt > lt
        ? remote.completedAt || local.completedAt || ""
        : local.completedAt || remote.completedAt || "";
  } else if (remoteComplete) {
    base.plan = remote.plan ?? local.plan;
    base.completedAt = remote.completedAt || local.completedAt || "";
  } else if (localComplete) {
    base.plan = local.plan ?? remote.plan;
    base.completedAt = local.completedAt || remote.completedAt || "";
  }

  // Stamp intent time as max of both
  const maxT = Math.max(lt, rt);
  if (maxT > 0) {
    (base as HafizProfile & { intentUpdatedAt?: string }).intentUpdatedAt =
      new Date(maxT).toISOString();
  }

  // Preferred qari: never drop a real local choice for default/empty remote
  const lQ = local.preferredQariId;
  const rQ = remote.preferredQariId;
  if (lQ && lQ !== "alafasy" && (!rQ || rQ === "alafasy") && rt <= lt) {
    base.preferredQariId = lQ;
  } else if (rQ && rQ !== "alafasy" && (!lQ || lQ === "alafasy") && lt < rt) {
    base.preferredQariId = rQ;
  } else if (lQ || rQ) {
    base.preferredQariId = (rt >= lt ? rQ || lQ : lQ || rQ) || "alafasy";
  }

  // manualWird (EXTERNAL_TRACKER): keep newer non-empty
  const lW = local.manualWird;
  const rW = remote.manualWird;
  if (lW || rW) {
    const lWt = parseTs(lW?.updatedAt);
    const rWt = parseTs(rW?.updatedAt);
    base.manualWird = rWt >= lWt ? rW || lW : lW || rW;
  }

  // usageTrack: prefer newer intent, never invent AUTOMATIC over explicit free/external
  // (already covered by INTENT_KEYS if listed — ensure sticky)

  return base;
}

// ── SRS memory merge ────────────────────────────────────────────────

type SrsItem = {
  id: string;
  nextReviewDate?: string | null;
  lastReviewedAt?: string | null;
  reviewCount?: number;
  mistakesCount?: number;
  strengthScore?: number;
  stabilityScore?: number;
  [key: string]: unknown;
};

/**
 * Merge SRS banks by item id.
 * Prefer the item with more reviews / more recent lastReviewedAt;
 * nextReviewDate from the preferred side (identity-stable).
 */
export function mergeRevisionMemory(
  local: unknown[] | null | undefined,
  remote: unknown[] | null | undefined
): unknown[] {
  const map = new Map<string, SrsItem>();

  const ingest = (arr: unknown[] | null | undefined) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as SrsItem;
      if (!item.id || typeof item.id !== "string") continue;
      const prev = map.get(item.id);
      if (!prev) {
        map.set(item.id, { ...item });
        continue;
      }
      map.set(item.id, pickBetterSrsItem(prev, item));
    }
  };

  ingest(local);
  ingest(remote);
  return Array.from(map.values());
}

function pickBetterSrsItem(a: SrsItem, b: SrsItem): SrsItem {
  const aReviews = a.reviewCount ?? 0;
  const bReviews = b.reviewCount ?? 0;
  if (bReviews !== aReviews) return bReviews > aReviews ? b : a;

  const aLast = parseTs(a.lastReviewedAt);
  const bLast = parseTs(b.lastReviewedAt);
  if (bLast !== aLast) return bLast > aLast ? b : a;

  // Prefer higher mistakesCount (more signal) when review history equal
  const aMist = a.mistakesCount ?? 0;
  const bMist = b.mistakesCount ?? 0;
  if (bMist !== aMist) return bMist > aMist ? b : a;

  // Prefer earlier nextReviewDate (safer — won't skip due items)
  const aDue = a.nextReviewDate || "9999-12-31";
  const bDue = b.nextReviewDate || "9999-12-31";
  if (aDue !== bDue) return aDue <= bDue ? a : b;

  return b; // stable: later write when truly equal
}

// ── Session history merge ───────────────────────────────────────────

type SessionRec = {
  id?: string;
  createdAt?: string;
  date?: string;
  [key: string]: unknown;
};

function mergeSessions(
  a: SessionRec[] | undefined,
  b: SessionRec[] | undefined
): SessionRec[] {
  const map = new Map<string, SessionRec>();
  for (const s of [...(a || []), ...(b || [])]) {
    if (!s) continue;
    const key =
      s.id ||
      `${s.date || ""}:${s.createdAt || ""}:${JSON.stringify(s.kind || "")}:${JSON.stringify(s.outcome || "")}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, s);
      continue;
    }
    const pt = prev.createdAt || prev.date || "";
    const rt = s.createdAt || s.date || "";
    if (rt >= pt) map.set(key, s);
  }
  return Array.from(map.values()).slice(0, 200);
}

// ── Actual userState merge ──────────────────────────────────────────

type LooseUserState = {
  hifz?: {
    currentPointer?: HifzPointerLike;
    lastAdvancedDate?: string;
    weekHifzLog?: unknown[];
    lastCompletedSlice?: unknown;
    track?: string;
    paused?: boolean;
    [key: string]: unknown;
  };
  planning?: {
    currentHifzPointer?: HifzPointerLike;
    weekHifzLog?: unknown[];
    [key: string]: unknown;
  };
  sessions?: { records?: SessionRec[]; maxRecords?: number };
  mistakes?: { records?: unknown[]; maxRecords?: number };
  revision?: Record<string, unknown>;
  learning?: Record<string, unknown>;
  streakDays?: number;
  updatedAt?: string;
  stateVersion?: number;
  userId?: string;
  [key: string]: unknown;
};

/**
 * Merge Actual learning userState.
 * Cursor never regresses. Sessions union by id. Forecast fields ignored here.
 */
export function mergeActualUserState(
  local: unknown | null | undefined,
  remote: unknown | null | undefined
): unknown | null {
  if (!local && !remote) return null;
  if (!local) return remote ?? null;
  if (!remote) return local;

  const L = local as LooseUserState;
  const R = remote as LooseUserState;

  const sessions = mergeSessions(
    L.sessions?.records,
    R.sessions?.records
  );

  const pointer = mergeHifzPointers({
    local: L.hifz?.currentPointer,
    remote: R.hifz?.currentPointer,
    localLastAdvanced: L.hifz?.lastAdvancedDate,
    remoteLastAdvanced: R.hifz?.lastAdvancedDate,
    localSessionCount: L.sessions?.records?.length ?? 0,
    remoteSessionCount: R.sessions?.records?.length ?? 0,
  });

  const lastAdvanced = maxIsoDate(
    L.hifz?.lastAdvancedDate,
    R.hifz?.lastAdvancedDate
  );

  // Prefer side that owns the winning pointer for hifz shell
  const hifzSource =
    pointer &&
    R.hifz?.currentPointer &&
    compareHifzPointer(pointer, R.hifz.currentPointer) === 0
      ? R.hifz
      : L.hifz || R.hifz;

  const base: LooseUserState = {
    ...L,
    ...R,
    userId: L.userId || R.userId,
    streakDays: Math.max(L.streakDays ?? 0, R.streakDays ?? 0),
    stateVersion: Math.max(L.stateVersion ?? 1, R.stateVersion ?? 1),
    updatedAt: maxIsoDate(L.updatedAt, R.updatedAt) || new Date().toISOString().slice(0, 10),
    hifz: {
      ...(hifzSource || {}),
      currentPointer: pointer || L.hifz?.currentPointer || R.hifz?.currentPointer,
      lastAdvancedDate: lastAdvanced,
      // Keep longer week log (actual)
      weekHifzLog:
        (L.hifz?.weekHifzLog?.length || 0) >= (R.hifz?.weekHifzLog?.length || 0)
          ? L.hifz?.weekHifzLog
          : R.hifz?.weekHifzLog,
      lastCompletedSlice:
        L.hifz?.lastCompletedSlice ?? R.hifz?.lastCompletedSlice,
      track: L.hifz?.track || R.hifz?.track,
      paused: Boolean(L.hifz?.paused && R.hifz?.paused)
        ? true
        : L.hifz?.paused || R.hifz?.paused || false,
    },
    planning: {
      ...(L.planning || {}),
      ...(R.planning || {}),
      currentHifzPointer:
        pointer ||
        L.planning?.currentHifzPointer ||
        R.planning?.currentHifzPointer,
    },
    sessions: {
      maxRecords: L.sessions?.maxRecords || R.sessions?.maxRecords || 200,
      records: sessions,
    },
    // Mistakes history: prefer longer list (union by rough length; detailed in mistakes table)
    mistakes: {
      maxRecords: L.mistakes?.maxRecords || R.mistakes?.maxRecords || 200,
      records:
        (L.mistakes?.records?.length || 0) >= (R.mistakes?.records?.length || 0)
          ? L.mistakes?.records || []
          : R.mistakes?.records || [],
    },
    revision: { ...(L.revision || {}), ...(R.revision || {}) },
    learning: { ...(L.learning || {}), ...(R.learning || {}) },
  };

  return base;
}

// ── Full LearningSnapshot merge ─────────────────────────────────────

function readMeta(s: LearningSnapshotCloud | null | undefined): LearningStateMeta {
  const m = s?.learningStateMeta;
  if (m && typeof m === "object" && typeof m.version === "number") {
    return {
      version: m.version,
      updatedAt: m.updatedAt || s?.updatedAt || "",
      source: (m.source as LearningStateSource) || "unknown",
    };
  }
  return {
    version: LEARNING_STATE_META_VERSION,
    updatedAt: s?.updatedAt || "",
    source: "unknown",
  };
}

/**
 * Merge two LearningSnapshots (local + cloud).
 *
 * Rules:
 * - Actual: cursor never regresses; sessions union; SRS by id
 * - Forecast: discarded (recomputed by planner)
 * - planCache: prefer non-empty newer side for display; safe to drop
 * - learningStateMeta: source=sync_merge, version bumped stamp
 */
export function mergeLearningSnapshots(
  local: LearningSnapshotCloud | null | undefined,
  remote: LearningSnapshotCloud | null | undefined
): LearningSnapshotCloud | null {
  if (!local && !remote) return null;
  if (!local) {
    return stripForecast(remote);
  }
  if (!remote) {
    return stripForecast(local);
  }

  const localMeta = readMeta(local);
  const remoteMeta = readMeta(remote);

  // Guard: never let pure plan_seed / forecast-only overwrite session_completed
  // when the weaker side has a newer updatedAt (classic LWW bug)
  const localRank = SOURCE_RANK[localMeta.source] ?? 0;
  const remoteRank = SOURCE_RANK[remoteMeta.source] ?? 0;

  const userState = mergeActualUserState(local.userState, remote.userState);
  const revisionMemory = mergeRevisionMemory(
    local.revisionMemory,
    remote.revisionMemory
  );

  // planCache: keep union of keys; prefer remote entry if both (display only)
  const planCache: Record<string, unknown> = {
    ...(typeof local.planCache === "object" && local.planCache
      ? local.planCache
      : {}),
    ...(typeof remote.planCache === "object" && remote.planCache
      ? remote.planCache
      : {}),
  };

  // lastDecision: prefer higher-rank source, else newer timestamp
  let lastDecision = local.lastDecision ?? remote.lastDecision;
  if (local.lastDecision && remote.lastDecision) {
    if (remoteRank > localRank) lastDecision = remote.lastDecision;
    else if (localRank > remoteRank) lastDecision = local.lastDecision;
    else {
      lastDecision =
        parseTs(remote.updatedAt) >= parseTs(local.updatedAt)
          ? remote.lastDecision
          : local.lastDecision;
    }
  }

  const loadAdjustment =
    parseTs(remote.updatedAt) >= parseTs(local.updatedAt)
      ? remote.loadAdjustment ?? local.loadAdjustment
      : local.loadAdjustment ?? remote.loadAdjustment;

  const updatedAt = maxIsoDate(local.updatedAt, remote.updatedAt) ||
    new Date().toISOString();

  return {
    version: 1,
    updatedAt,
    userState,
    revisionMemory,
    planCache,
    lastDecision,
    cacheMeta: undefined, // force fingerprint rebuild after sync
    loadAdjustment,
    // Forecast always discarded on merge — planner recalculates
    lastForecastHint: undefined,
    learningStateMeta: makeLearningStateMeta("sync_merge", updatedAt),
  };
}

/** Drop forecast fields so they never rehydrate as Actual. */
export function stripForecast(
  snap: LearningSnapshotCloud | null | undefined
): LearningSnapshotCloud | null {
  if (!snap) return null;
  const rest = { ...snap };
  delete rest.lastForecastHint;
  return {
    ...rest,
    version: 1,
    lastForecastHint: undefined,
  };
}

/**
 * True if cloud learning payload is forecast-only noise
 * (no userState cursor / no sessions / no SRS) — safe to ignore for Actual.
 */
export function isForecastOnlyLearningSnapshot(
  snap: LearningSnapshotCloud | null | undefined
): boolean {
  if (!snap) return true;
  const hasCursor = Boolean(
    (snap.userState as LooseUserState | null)?.hifz?.currentPointer
  );
  const sessions =
    (snap.userState as LooseUserState | null)?.sessions?.records?.length || 0;
  const mem = Array.isArray(snap.revisionMemory)
    ? snap.revisionMemory.length
    : 0;
  const hasForecast = Boolean(snap.lastForecastHint);
  return hasForecast && !hasCursor && sessions === 0 && mem === 0;
}
