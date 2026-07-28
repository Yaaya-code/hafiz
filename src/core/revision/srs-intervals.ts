/**
 * Spaced-repetition interval logic (SM-2 inspired).
 * Deterministic pure functions — no I/O.
 */

import type {
  RevisionMemoryItem,
  ReviewOutcome,
  RevisionContentRef,
} from "../models/revision-memory";
import { addDays, clamp01 } from "./dates";

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

export interface IntervalUpdate {
  intervalDays: number;
  easeFactor: number;
  stabilityScore: number;
  strengthScore: number;
  nextReviewDate: string;
}

/**
 * Create a new memory item after first memorization.
 * First review scheduled for the next day (near-review default).
 */
export function createMemoryItem(
  id: string,
  content: RevisionContentRef,
  asOfDate: string,
  opts?: {
    isNear?: boolean;
    source?: RevisionMemoryItem["source"];
    strengthScore?: number;
  }
): RevisionMemoryItem {
  const strength = clamp01(opts?.strengthScore ?? 0.55);
  const stability = clamp01(strength * 0.5);
  const intervalDays = 1;
  return {
    id,
    content: { ...content },
    lastReviewedAt: null,
    reviewCount: 0,
    mistakesCount: 0,
    successRate: 1,
    strengthScore: strength,
    stabilityScore: stability,
    nextReviewDate: addDays(asOfDate, intervalDays),
    intervalDays,
    easeFactor: DEFAULT_EASE,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    isNear: opts?.isNear ?? true,
    urgent: false,
    source: opts?.source ?? "new_hifz",
  };
}

/**
 * Compute next interval after a review outcome.
 * Does not mutate the input item.
 */
export function computeNextInterval(
  item: RevisionMemoryItem,
  outcome: ReviewOutcome,
  asOfDate: string
): IntervalUpdate {
  let ease = item.easeFactor || DEFAULT_EASE;
  let interval = Math.max(0, item.intervalDays || 0);
  let stability = clamp01(item.stabilityScore);
  let strength = clamp01(item.strengthScore);

  if (outcome === "fail") {
    // Fail: reset toward short interval, lower ease/stability
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 1;
    stability = clamp01(stability * 0.5 - 0.1);
    strength = clamp01(strength - 0.15);
  } else {
    // Success: SM-2-ish growth
    ease = ease + 0.1;
    if (ease < MIN_EASE) ease = MIN_EASE;
    if (interval <= 0) {
      interval = 1;
    } else if (interval === 1) {
      interval = 3;
    } else {
      interval = Math.max(1, Math.round(interval * ease));
    }
    // Cap very long intervals for Quran practicality
    interval = Math.min(interval, 60);
    stability = clamp01(stability + 0.08 + Math.min(0.1, interval / 200));
    strength = clamp01(strength + 0.06);
  }

  return {
    intervalDays: interval,
    easeFactor: Number(ease.toFixed(3)),
    stabilityScore: Number(stability.toFixed(4)),
    strengthScore: Number(strength.toFixed(4)),
    nextReviewDate: addDays(asOfDate, interval),
  };
}

/**
 * Apply a review outcome → new RevisionMemoryItem (immutable).
 */
export function applyReviewOutcome(
  item: RevisionMemoryItem,
  outcome: ReviewOutcome,
  asOfDate: string,
  extraMistakes = 0
): RevisionMemoryItem {
  const next = computeNextInterval(item, outcome, asOfDate);
  const reviewCount = item.reviewCount + 1;
  const successesApprox = Math.round(item.successRate * item.reviewCount);
  const newSuccesses =
    outcome === "success" ? successesApprox + 1 : successesApprox;
  const successRate =
    reviewCount <= 0 ? 1 : clamp01(newSuccesses / reviewCount);

  const isNear = item.isNear === true;
  let urgent = item.urgent === true;
  let stillNear = isNear;

  if (isNear) {
    if (outcome === "fail") {
      urgent = true;
      stillNear = true;
    } else {
      // Success on near → leave urgent near queue; graduate to far path
      urgent = false;
      stillNear = false;
    }
  }

  return {
    ...item,
    content: { ...item.content },
    lastReviewedAt: asOfDate,
    reviewCount,
    mistakesCount:
      outcome === "fail"
        ? item.mistakesCount + Math.max(1, extraMistakes || 1)
        : Math.max(0, item.mistakesCount - 1),
    successRate: Number(successRate.toFixed(4)),
    strengthScore: next.strengthScore,
    stabilityScore: next.stabilityScore,
    nextReviewDate: next.nextReviewDate,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
    consecutiveSuccesses:
      outcome === "success" ? item.consecutiveSuccesses + 1 : 0,
    consecutiveFailures:
      outcome === "fail" ? item.consecutiveFailures + 1 : 0,
    isNear: stillNear,
    urgent,
    source:
      stillNear
        ? item.source ?? "near_carry"
        : item.source === "new_hifz"
          ? "far_corpus"
          : item.source,
  };
}
