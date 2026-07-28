/**
 * Adaptive load adjustment from actual session performance.
 *
 * Does NOT mutate HifzCursor or mastery.
 * Only advises the planner how heavy today's revision/hifz budgets should be.
 */

import type { UserState } from "@/core";

export type LoadAdjustmentDirection = "increase" | "maintain" | "decrease";

export type LoadAdjustment = {
  direction: LoadAdjustmentDirection;
  reason: string;
  confidence: number; // 0–1
  /** Multiplier for revision item/minute budget (0.5–1.4) */
  revisionScale: number;
  /** Multiplier for NEW_HIFZ minute/page budget (0.5–1.3) */
  hifzScale: number;
};

export function defaultLoadAdjustment(): LoadAdjustment {
  return {
    direction: "maintain",
    reason: "Insufficient session history — maintain baseline load.",
    confidence: 0.2,
    revisionScale: 1,
    hifzScale: 1,
  };
}

type SessionRec = UserState["sessions"]["records"][number];

function recentSessions(state: UserState | null, lookbackDays = 7): SessionRec[] {
  if (!state?.sessions?.records?.length) return [];
  const today = state.updatedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const t = Date.parse(today + "T12:00:00Z");
  return state.sessions.records.filter((s) => {
    const d = Date.parse((s.date || "").slice(0, 10) + "T12:00:00Z");
    if (!Number.isFinite(d) || !Number.isFinite(t)) return true;
    return (t - d) / 86400000 <= lookbackDays;
  });
}

/**
 * Derive load adjustment from recent completed sessions (actual only).
 */
export function computeLoadAdjustment(
  state: UserState | null
): LoadAdjustment {
  const sessions = recentSessions(state, 7);
  if (sessions.length < 2) {
    return defaultLoadAdjustment();
  }

  // Last up to 7 attempts
  const window = sessions.slice(0, 12);
  let success = 0;
  let fail = 0;
  let consecutiveFails = 0;
  let consecutiveSuccess = 0;
  let runFail = 0;
  let runOk = 0;

  for (const s of window) {
    const bad =
      s.outcome === "failed" ||
      s.outcome === "partial" ||
      s.outcome === "skipped";
    if (bad) {
      fail++;
      runFail++;
      runOk = 0;
      consecutiveFails = Math.max(consecutiveFails, runFail);
    } else {
      success++;
      runOk++;
      runFail = 0;
      consecutiveSuccess = Math.max(consecutiveSuccess, runOk);
    }
  }

  const total = success + fail;
  const completionRate = total > 0 ? success / total : 0.5;

  // Case 2: fail streak
  if (consecutiveFails >= 3) {
    return {
      direction: "decrease",
      reason: `${consecutiveFails} consecutive weak/failed sessions — reduce upcoming load.`,
      confidence: Math.min(0.95, 0.55 + consecutiveFails * 0.1),
      revisionScale: 0.65,
      hifzScale: 0.55,
    };
  }

  if (completionRate < 0.45 && fail >= 2) {
    return {
      direction: "decrease",
      reason: `Low completion rate (${Math.round(completionRate * 100)}%) — ease load.`,
      confidence: 0.7,
      revisionScale: 0.75,
      hifzScale: 0.7,
    };
  }

  // Case 3: strong week
  if (consecutiveSuccess >= 5 && completionRate >= 0.85) {
    return {
      direction: "increase",
      reason: `${consecutiveSuccess}+ strong sessions — gradual load increase.`,
      confidence: 0.8,
      revisionScale: 1.15,
      hifzScale: 1.2,
    };
  }

  if (completionRate >= 0.8 && success >= 4) {
    return {
      direction: "increase",
      reason: "High accuracy streak — slight load increase.",
      confidence: 0.65,
      revisionScale: 1.1,
      hifzScale: 1.1,
    };
  }

  return {
    direction: "maintain",
    reason: `Stable performance (success rate ${Math.round(completionRate * 100)}%).`,
    confidence: 0.5,
    revisionScale: 1,
    hifzScale: 1,
  };
}
