/**
 * Logic Bible — Progression predicates (P-001…P-004).
 * Deterministic signals only; no scheduling, no Quran text analysis.
 */

import type {
  MistakeHistory,
  MistakeRecord,
  SessionHistory,
  SessionRecord,
  UserProfile,
  UserState,
} from "../../../models";
import type { RuleResult } from "../../../models";
import type { Decision } from "../../resolution/types";

/** Rolling lookback for recent performance signals (days). */
export const PROGRESSION_LOOKBACK_DAYS = 7;

/** Max recent mistakes still considered "stable". */
export const LOW_MISTAKE_THRESHOLD = 2;

/** Mistake count that marks instability / regression risk. */
export const HIGH_MISTAKE_THRESHOLD = 5;

/** Min completed sessions in lookback for "consistent performance". */
export const CONSISTENT_SESSION_MIN = 3;

/** Min completion ratio (completed / attempted) for stability. */
export const STABLE_COMPLETION_RATIO = 0.75;

/** Strength scores (1–5). */
export const STRENGTH_READY_MIN = 3;
export const STRENGTH_STRONG_MIN = 4;
export const STRENGTH_WEAK_MAX = 2;

export type StrengtheningArea =
  | "overall_retention"
  | "recent_mistakes"
  | "revision_queue"
  | "specific_surah"
  | "scenario_lock"
  | "none";

function parseIsoDay(iso: string): number {
  // YYYY-MM-DD → utc day index; invalid → NaN
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

export function daysBetween(a: string, b: string): number {
  const da = parseIsoDay(a);
  const db = parseIsoDay(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(db - da);
}

export function isWithinLookback(
  eventDate: string,
  asOfDate: string,
  lookbackDays = PROGRESSION_LOOKBACK_DAYS
): boolean {
  const d = daysBetween(eventDate, asOfDate);
  return d <= lookbackDays;
}

export function effectiveStrengthScore(
  profile: UserProfile,
  state: UserState
): 1 | 2 | 3 | 4 | 5 {
  const fromState = state.learning?.strengthScore;
  if (fromState === 1 || fromState === 2 || fromState === 3 || fromState === 4 || fromState === 5) {
    return fromState;
  }
  return profile.memorizationStrength;
}

export function recentMistakes(
  history: MistakeHistory | undefined,
  asOfDate: string,
  lookbackDays = PROGRESSION_LOOKBACK_DAYS
): MistakeRecord[] {
  const records = history?.records ?? [];
  return records.filter((m) =>
    isWithinLookback(m.lastOccurredAt, asOfDate, lookbackDays)
  );
}

export function recentMistakeCount(
  history: MistakeHistory | undefined,
  asOfDate: string,
  lookbackDays = PROGRESSION_LOOKBACK_DAYS
): number {
  // Count weighted by frequency (capped contribution per record)
  return recentMistakes(history, asOfDate, lookbackDays).reduce(
    (sum, m) => sum + Math.max(1, Math.min(m.frequency || 1, 5)),
    0
  );
}

export function dominantMistakeSurah(
  history: MistakeHistory | undefined,
  asOfDate: string
): number | null {
  const recent = recentMistakes(history, asOfDate);
  if (recent.length === 0) return null;
  const bySurah = new Map<number, number>();
  for (const m of recent) {
    bySurah.set(m.surah, (bySurah.get(m.surah) ?? 0) + Math.max(1, m.frequency || 1));
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [surah, n] of bySurah) {
    if (n > bestN) {
      best = surah;
      bestN = n;
    }
  }
  return best;
}

export function recentSessions(
  history: SessionHistory | undefined,
  asOfDate: string,
  lookbackDays = PROGRESSION_LOOKBACK_DAYS
): SessionRecord[] {
  const records = history?.records ?? [];
  return records.filter((s) => isWithinLookback(s.date, asOfDate, lookbackDays));
}

export interface SessionStability {
  attempted: number;
  completed: number;
  failedOrPartial: number;
  completionRatio: number;
  consistent: boolean;
  unstable: boolean;
}

export function computeSessionStability(
  history: SessionHistory | undefined,
  asOfDate: string
): SessionStability {
  const sessions = recentSessions(history, asOfDate);
  const attempted = sessions.filter((s) => s.outcome !== "skipped").length;
  const completed = sessions.filter((s) => s.outcome === "completed").length;
  const failedOrPartial = sessions.filter(
    (s) => s.outcome === "failed" || s.outcome === "partial"
  ).length;
  const completionRatio = attempted === 0 ? 1 : completed / attempted;
  const consistent =
    completed >= CONSISTENT_SESSION_MIN &&
    completionRatio >= STABLE_COMPLETION_RATIO;
  const unstable =
    attempted >= 2 &&
    (completionRatio < 0.5 || failedOrPartial >= 2);
  return {
    attempted,
    completed,
    failedOrPartial,
    completionRatio,
    consistent,
    unstable,
  };
}

export interface RevisionStability {
  nearDepth: number;
  nearMax: number;
  nearOverflow: boolean;
  highPressureItems: number;
  stable: boolean;
  unstable: boolean;
}

/**
 * Revision stability from queue pressure (not scheduling).
 * Overflow or many high timesServed items ⇒ unstable.
 */
export function computeRevisionStability(state: UserState): RevisionStability {
  const rev = state.revision;
  const nearDepth = rev?.nearStack?.length ?? 0;
  const nearMax = rev?.nearStackMax ?? 7;
  const nearOverflow = nearDepth > nearMax;
  const highPressureItems = (rev?.nearStack ?? []).filter(
    (item) => item.timesServed >= 3
  ).length;
  const unstable = nearOverflow || highPressureItems >= 2;
  const stable = !unstable && nearDepth <= Math.max(1, Math.floor(nearMax * 0.75));
  return {
    nearDepth,
    nearMax,
    nearOverflow,
    highPressureItems,
    stable,
    unstable,
  };
}

/**
 * Scenario / prior hard locks that already disable new hifz.
 */
export function priorHardHifzLock(
  priorResults: ReadonlyMap<string, RuleResult> | undefined
): { locked: boolean; ruleId: string | null; reason: string } {
  if (!priorResults) {
    return { locked: false, ruleId: null, reason: "" };
  }
  for (const [id, r] of priorResults) {
    if (!r.applied) continue;
    if (r.severity !== "hard") continue;
    if (r.overrides?.newHifzEnabled === false) {
      return {
        locked: true,
        ruleId: id,
        reason: `Prior hard rule ${id} disabled new hifz.`,
      };
    }
    const meta = r.meta;
    if (
      meta?.disableNewMemorization === true ||
      meta?.disableAutomaticNewMemorization === true ||
      meta?.newHifzEnabled === false ||
      meta?.lockProgression === true
    ) {
      return {
        locked: true,
        ruleId: id,
        reason: `Prior hard rule ${id} locked progression / new hifz.`,
      };
    }
  }
  return { locked: false, ruleId: null, reason: "" };
}

/**
 * Decision from resolution layer when available; else synthesize from priorResults.
 */
export function resolveDecisionSignals(
  decision: Decision | undefined,
  priorResults: ReadonlyMap<string, RuleResult> | undefined
): {
  newHifzEnabled: boolean | null;
  revisionOnly: boolean | null;
  lockProgression: boolean;
  source: "decision" | "prior" | "none";
} {
  if (decision) {
    return {
      newHifzEnabled: decision.newHifzEnabled,
      revisionOnly: decision.revisionOnly,
      lockProgression: decision.lockProgression ?? false,
      source: "decision",
    };
  }
  const hard = priorHardHifzLock(priorResults);
  if (hard.locked) {
    return {
      newHifzEnabled: false,
      revisionOnly: true,
      lockProgression: true,
      source: "prior",
    };
  }
  // Soft signals from prior applied results
  let newHifz: boolean | null = null;
  let revisionOnly: boolean | null = null;
  if (priorResults) {
    for (const r of priorResults.values()) {
      if (!r.applied) continue;
      if (typeof r.overrides?.newHifzEnabled === "boolean") {
        newHifz = r.overrides.newHifzEnabled;
      }
      if (typeof r.meta?.revisionOnly === "boolean") {
        revisionOnly = r.meta.revisionOnly as boolean;
      }
    }
  }
  return {
    newHifzEnabled: newHifz,
    revisionOnly,
    lockProgression: false,
    source: priorResults && priorResults.size > 0 ? "prior" : "none",
  };
}

export function isReadyForNewHifz(input: {
  strength: number;
  mistakeCount: number;
  revision: RevisionStability;
  sessions: SessionStability;
  decisionLocked: boolean;
}): { ready: boolean; reason: string } {
  if (input.decisionLocked) {
    return {
      ready: false,
      reason: "Scenario/resolution decision already locks new hifz.",
    };
  }
  if (input.strength <= STRENGTH_WEAK_MAX) {
    return {
      ready: false,
      reason: `Strength ${input.strength} ≤ ${STRENGTH_WEAK_MAX} (weak retention).`,
    };
  }
  if (input.mistakeCount > HIGH_MISTAKE_THRESHOLD) {
    return {
      ready: false,
      reason: `Recent mistake load ${input.mistakeCount} exceeds high threshold ${HIGH_MISTAKE_THRESHOLD}.`,
    };
  }
  if (input.revision.unstable) {
    return {
      ready: false,
      reason: "Revision queue pressure is unstable.",
    };
  }
  if (input.sessions.unstable) {
    return {
      ready: false,
      reason: "Recent session outcomes are unstable.",
    };
  }
  if (input.strength >= STRENGTH_READY_MIN && input.mistakeCount <= LOW_MISTAKE_THRESHOLD) {
    return {
      ready: true,
      reason: `Strength ${input.strength} ≥ ${STRENGTH_READY_MIN} and mistakes ≤ ${LOW_MISTAKE_THRESHOLD}.`,
    };
  }
  // Mid strength with elevated mistakes — not ready
  return {
    ready: false,
    reason: `Not ready: strength=${input.strength}, mistakes=${input.mistakeCount}.`,
  };
}

export function shouldIncreaseCapacity(input: {
  strength: number;
  mistakeCount: number;
  sessions: SessionStability;
  revision: RevisionStability;
  progressionLocked: boolean;
}): { increase: boolean; pagesDelta: number; minutesDelta: number; reason: string } {
  if (input.progressionLocked) {
    return {
      increase: false,
      pagesDelta: 0,
      minutesDelta: 0,
      reason: "Progression locked — capacity increase denied.",
    };
  }
  if (input.strength < STRENGTH_STRONG_MIN) {
    return {
      increase: false,
      pagesDelta: 0,
      minutesDelta: 0,
      reason: `Strength ${input.strength} < ${STRENGTH_STRONG_MIN}; hold capacity.`,
    };
  }
  if (input.mistakeCount > LOW_MISTAKE_THRESHOLD) {
    return {
      increase: false,
      pagesDelta: 0,
      minutesDelta: 0,
      reason: "Mistake rate not low enough for capacity increase.",
    };
  }
  if (!input.sessions.consistent) {
    return {
      increase: false,
      pagesDelta: 0,
      minutesDelta: 0,
      reason: "Need consistent successful sessions before increasing capacity.",
    };
  }
  if (!input.revision.stable) {
    return {
      increase: false,
      pagesDelta: 0,
      minutesDelta: 0,
      reason: "Revision not stable enough for capacity increase.",
    };
  }
  // Soft suggestion only — later scheduling must still respect S-004 ceiling
  return {
    increase: true,
    pagesDelta: 0.25,
    minutesDelta: 5,
    reason:
      "Consistent performance, low mistakes, stable revision — suggest +0.25 page and +5 minutes.",
  };
}

export function assessStrengthening(input: {
  strength: number;
  mistakeCount: number;
  revision: RevisionStability;
  dominantSurah: number | null;
  decisionLocked: boolean;
}): {
  required: boolean;
  area: StrengtheningArea;
  reason: string;
} {
  if (input.strength <= STRENGTH_WEAK_MAX) {
    return {
      required: true,
      area: "overall_retention",
      reason: `Strength ${input.strength} requires strengthening before progression.`,
    };
  }
  if (input.mistakeCount > HIGH_MISTAKE_THRESHOLD) {
    return {
      required: true,
      area: input.dominantSurah != null ? "specific_surah" : "recent_mistakes",
      reason:
        input.dominantSurah != null
          ? `High recent mistakes concentrated on surah ${input.dominantSurah}.`
          : `High recent mistake load (${input.mistakeCount}).`,
    };
  }
  if (input.revision.unstable) {
    return {
      required: true,
      area: "revision_queue",
      reason: "Revision queue pressure requires strengthening before progression.",
    };
  }
  if (input.decisionLocked) {
    return {
      required: true,
      area: "scenario_lock",
      reason: "Scenario lock already requires strengthening / revision focus.",
    };
  }
  return {
    required: false,
    area: "none",
    reason: "No strengthening threshold breached.",
  };
}

export function assessRegression(input: {
  strength: number;
  mistakeCount: number;
  sessions: SessionStability;
  revision: RevisionStability;
}): { lock: boolean; reason: string } {
  if (input.strength <= STRENGTH_WEAK_MAX && input.mistakeCount > LOW_MISTAKE_THRESHOLD) {
    return {
      lock: true,
      reason: `Regression lock: weak strength (${input.strength}) with elevated mistakes (${input.mistakeCount}).`,
    };
  }
  if (input.mistakeCount > HIGH_MISTAKE_THRESHOLD && input.sessions.unstable) {
    return {
      lock: true,
      reason: "Regression lock: high mistakes combined with unstable sessions.",
    };
  }
  if (input.revision.unstable && input.sessions.failedOrPartial >= 2) {
    return {
      lock: true,
      reason: "Regression lock: revision instability with repeated failed/partial sessions.",
    };
  }
  if (input.sessions.unstable && input.strength <= STRENGTH_READY_MIN) {
    return {
      lock: true,
      reason: "Regression lock: unstable sessions at borderline strength.",
    };
  }
  return {
    lock: false,
    reason: "Stability above regression threshold.",
  };
}
