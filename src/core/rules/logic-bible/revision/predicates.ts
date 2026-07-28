/**
 * Logic Bible — Revision structure predicates (R-001…R-004).
 * Deterministic signals only; no scheduling, no Quran text analysis.
 */

import type {
  MemorizationSelection,
  UserProfile,
  UserState,
} from "../../../models";
import type { RuleResult } from "../../../models";
import type { Decision } from "../../resolution/types";
import {
  computeRevisionStability,
  computeSessionStability,
  effectiveStrengthScore,
  recentMistakeCount,
  resolveDecisionSignals,
  STRENGTH_READY_MIN,
  STRENGTH_STRONG_MIN,
  STRENGTH_WEAK_MAX,
  HIGH_MISTAKE_THRESHOLD,
  LOW_MISTAKE_THRESHOLD,
  type RevisionStability,
  type SessionStability,
} from "../progression/predicates";
import {
  collectMemorizedSurahNumbers,
  hasAnyMemorization,
} from "../predicates";

export type RevisionPriorityLevel = "normal" | "elevated" | "critical";

export type RecoveryScope =
  | "none"
  | "weak_surahs"
  | "recent_mistakes"
  | "revision_queue"
  | "failed_sessions"
  | "broad_corpus";

/** Minutes per approximate mushaf page for revision budget math. */
export const MINUTES_PER_REVISION_PAGE = 12;

/** Soft floor/ceiling for revision page recommendations. */
export const MIN_REVISION_PAGES = 0.25;
export const MAX_REVISION_PAGES_CAP = 4;

export interface RevisionSignals {
  strength: 1 | 2 | 3 | 4 | 5;
  mistakeCount: number;
  revision: RevisionStability;
  sessions: SessionStability;
  memorizedSurahCount: number;
  weakSurahCount: number;
  decisionLocked: boolean;
  revisionOnlyAlready: boolean;
}

export function countWeakSurahs(sel: MemorizationSelection): number {
  let n = 0;
  for (const s of sel.surahSelections ?? []) {
    if (s.strength === "WEAK" || s.strength === "NEEDS_REVIEW") n += 1;
  }
  if (sel.range) {
    if (sel.range.strength === "WEAK" || sel.range.strength === "NEEDS_REVIEW") {
      const a = Math.min(sel.range.fromSurah, sel.range.toSurah);
      const b = Math.max(sel.range.fromSurah, sel.range.toSurah);
      n += b - a + 1;
    }
  }
  for (const j of sel.juzSelections ?? []) {
    if (j.strength === "WEAK" || j.strength === "NEEDS_REVIEW") {
      // Juz weak without expansion: count as 4 weak-surah equivalents
      n += 4;
    }
  }
  return n;
}

export function estimateMemorizedSurahCount(sel: MemorizationSelection): number {
  const surahs = collectMemorizedSurahNumbers(sel);
  if (surahs.length > 0) return surahs.length;
  const juz = sel.juzSelections?.length ?? 0;
  if (juz > 0) return juz * 4; // coarse proxy without juz→surah expansion
  return 0;
}

export function collectRevisionSignals(
  profile: UserProfile,
  state: UserState,
  asOfDate: string,
  decision: Decision | undefined,
  priorResults: ReadonlyMap<string, RuleResult> | undefined
): RevisionSignals {
  const strength = effectiveStrengthScore(profile, state);
  const mistakeCount = recentMistakeCount(state.mistakes, asOfDate);
  const revision = computeRevisionStability(state);
  const sessions = computeSessionStability(state.sessions, asOfDate);
  const signals = resolveDecisionSignals(decision, priorResults);
  const decisionLocked =
    signals.lockProgression ||
    signals.newHifzEnabled === false ||
    (decision?.recoveryRequired === true) ||
    (decision?.strengtheningRequired === true);

  return {
    strength,
    mistakeCount,
    revision,
    sessions,
    memorizedSurahCount: estimateMemorizedSurahCount(
      profile.memorizationSelection
    ),
    weakSurahCount: countWeakSurahs(profile.memorizationSelection),
    decisionLocked,
    revisionOnlyAlready: signals.revisionOnly === true,
  };
}

/**
 * R-001 — Does revision take priority over new hifz?
 */
export function assessRevisionPriority(input: RevisionSignals): {
  priority: boolean;
  level: RevisionPriorityLevel;
  reason: string;
} {
  if (input.decisionLocked || input.revisionOnlyAlready) {
    return {
      priority: true,
      level: "critical",
      reason: "Existing decision lock already prioritizes revision over new hifz.",
    };
  }
  if (input.strength <= STRENGTH_WEAK_MAX) {
    return {
      priority: true,
      level: "critical",
      reason: `Weak strength (${input.strength}) — revision takes priority.`,
    };
  }
  if (input.mistakeCount > HIGH_MISTAKE_THRESHOLD) {
    return {
      priority: true,
      level: "elevated",
      reason: `High recent mistake load (${input.mistakeCount}) elevates revision priority.`,
    };
  }
  if (input.revision.unstable) {
    return {
      priority: true,
      level: "elevated",
      reason: "Unstable revision queue — revision takes priority over new hifz.",
    };
  }
  if (input.weakSurahCount >= 3 && input.strength < STRENGTH_STRONG_MIN) {
    return {
      priority: true,
      level: "elevated",
      reason: `${input.weakSurahCount} weak areas need revision priority.`,
    };
  }
  if (
    input.strength >= STRENGTH_STRONG_MIN &&
    input.mistakeCount <= LOW_MISTAKE_THRESHOLD &&
    input.revision.stable
  ) {
    return {
      priority: false,
      level: "normal",
      reason: "Strong stable memorizer — balanced revision (not exclusive priority).",
    };
  }
  // Mid strength, stable enough: normal load, no exclusive priority
  return {
    priority: false,
    level: "normal",
    reason: "Revision is normal; new hifz may proceed if otherwise allowed.",
  };
}

/**
 * R-002 — Recommended revision load (soft).
 * Never exceeds daily minute capacity.
 */
export function computeRevisionLoad(input: {
  signals: RevisionSignals;
  dailyMinutes: number;
  pagesPerDay: number;
  priorityLevel: RevisionPriorityLevel;
}): {
  pages: number;
  minutes: number;
  reason: string;
} {
  const capMin = Math.max(0, Math.floor(input.dailyMinutes));
  const basePages = Math.max(0.25, input.pagesPerDay || 1);

  // Share of day for revision by level
  let share = 0.45;
  if (input.priorityLevel === "elevated") share = 0.7;
  if (input.priorityLevel === "critical") share = 0.9;
  if (input.signals.memorizedSurahCount === 0) {
    // Beginner: light revision only (if any corpus later)
    share = Math.min(share, 0.25);
  }

  // Weak areas push load up
  const weakBoost = Math.min(0.2, input.signals.weakSurahCount * 0.05);
  share = Math.min(0.95, share + weakBoost);

  let minutes = Math.round(capMin * share);
  if (capMin > 0 && minutes < 5 && share > 0) {
    minutes = Math.min(capMin, 5);
  }

  // Pages from minutes, clamped
  let pages =
    minutes <= 0
      ? 0
      : Math.round((minutes / MINUTES_PER_REVISION_PAGE) * 4) / 4; // quarter pages
  pages = Math.max(pages > 0 ? MIN_REVISION_PAGES : 0, pages);
  pages = Math.min(MAX_REVISION_PAGES_CAP, pages);

  // Corpus-aware: more memorized → slightly more revision pages (soft)
  if (input.signals.memorizedSurahCount >= 10 && pages > 0) {
    pages = Math.min(MAX_REVISION_PAGES_CAP, pages + 0.25);
  }
  // Never recommend more page-minutes than capacity
  const maxPagesByCap =
    capMin > 0 ? capMin / MINUTES_PER_REVISION_PAGE : 0;
  if (maxPagesByCap > 0) {
    pages = Math.min(pages, Math.round(maxPagesByCap * 4) / 4);
  }
  // Keep pages related to user target
  pages = Math.min(pages, Math.max(basePages * 2, 0.5));

  // Recompute minutes to align with pages if needed
  if (pages > 0) {
    minutes = Math.min(
      capMin,
      Math.max(minutes, Math.round(pages * MINUTES_PER_REVISION_PAGE))
    );
  }

  return {
    pages,
    minutes,
    reason: `Revision load level=${input.priorityLevel}: ~${pages} pages / ${minutes} min (share≈${Math.round(share * 100)}% of ${capMin}m).`,
  };
}

/**
 * R-003 — Forgotten / weak content recovery need.
 */
export function assessRecovery(input: {
  signals: RevisionSignals;
  hasMemorization: boolean;
}): {
  required: boolean;
  scope: RecoveryScope;
  reason: string;
} {
  if (!input.hasMemorization) {
    return {
      required: false,
      scope: "none",
      reason: "No memorized corpus declared — recovery not applicable.",
    };
  }

  const s = input.signals;

  if (s.weakSurahCount >= 2 && s.strength <= STRENGTH_READY_MIN) {
    return {
      required: true,
      scope: "weak_surahs",
      reason: `${s.weakSurahCount} weak/needs-review areas require recovery before progression.`,
    };
  }
  if (s.mistakeCount > HIGH_MISTAKE_THRESHOLD) {
    return {
      required: true,
      scope: "recent_mistakes",
      reason: `Mistake load ${s.mistakeCount} indicates forgotten material needing recovery.`,
    };
  }
  if (s.revision.unstable && s.revision.highPressureItems >= 2) {
    return {
      required: true,
      scope: "revision_queue",
      reason: "High-pressure revision queue items require recovery focus.",
    };
  }
  if (s.sessions.failedOrPartial >= 2 && s.strength <= STRENGTH_READY_MIN) {
    return {
      required: true,
      scope: "failed_sessions",
      reason: "Repeated failed/partial sessions on memorized material need recovery.",
    };
  }
  if (s.strength <= STRENGTH_WEAK_MAX && s.memorizedSurahCount > 0) {
    return {
      required: true,
      scope: "broad_corpus",
      reason: "Overall weak retention over existing corpus requires recovery.",
    };
  }

  return {
    required: false,
    scope: "none",
    reason: "No recovery threshold breached.",
  };
}

/**
 * R-004 — Can the user pass the revision stability gate for progression?
 */
export function assessStabilityGate(input: {
  signals: RevisionSignals;
  recoveryRequired: boolean;
}): {
  passed: boolean;
  reason: string;
} {
  if (input.recoveryRequired) {
    return {
      passed: false,
      reason: "Recovery required — stability gate closed.",
    };
  }
  const s = input.signals;
  if (s.revision.unstable) {
    return {
      passed: false,
      reason: "Revision queue unstable — stability gate failed.",
    };
  }
  if (s.mistakeCount > HIGH_MISTAKE_THRESHOLD) {
    return {
      passed: false,
      reason: "Mistake load too high for stability gate.",
    };
  }
  if (s.sessions.unstable) {
    return {
      passed: false,
      reason: "Recent session outcomes unstable — gate failed.",
    };
  }
  // Self-declared weak alone is not enough to hard-fail the gate when there is
  // no session/mistake/queue evidence — plan layer already boosts revision.
  // Hard-fail only when weakness combines with real instability signals.
  if (
    s.strength <= STRENGTH_WEAK_MAX &&
    (s.mistakeCount > LOW_MISTAKE_THRESHOLD ||
      s.sessions.unstable ||
      s.revision.unstable)
  ) {
    return {
      passed: false,
      reason:
        "Weak overall strength with instability evidence — stability gate failed.",
    };
  }
  return {
    passed: true,
    reason: "Revision stability sufficient for progression (gate passed).",
  };
}

export function hasMemorizedCorpus(profile: UserProfile): boolean {
  return hasAnyMemorization(profile.memorizationSelection);
}
