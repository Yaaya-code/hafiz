/**
 * Deterministic revision priority scoring.
 * Higher score = earlier in the queue.
 */

import type {
  RankedRevisionItem,
  RevisionMemoryItem,
} from "../models/revision-memory";
import { clamp01, dayDiff } from "./dates";

export interface ScoreOptions {
  /** Calendar day for overdue calculations (YYYY-MM-DD) */
  asOfDate: string;
}

/**
 * Score a single memory item. Pure and deterministic.
 */
export function scoreRevisionItem(
  item: RevisionMemoryItem,
  options: ScoreOptions
): RankedRevisionItem {
  const asOf = options.asOfDate;
  const reasons: string[] = [];
  let score = 0;

  const stability = clamp01(item.stabilityScore);
  const strength = clamp01(item.strengthScore);
  const success = clamp01(item.successRate);
  const mistakes = Math.max(0, item.mistakesCount);

  // Overdue signal
  let overdueDays = 0;
  if (item.nextReviewDate) {
    overdueDays = Math.max(0, dayDiff(item.nextReviewDate, asOf));
  } else if (!item.lastReviewedAt) {
    // Never reviewed — treat as due today with mild boost
    overdueDays = 0;
    score += 15;
    reasons.push("first review pending");
  }

  if (overdueDays > 0) {
    score += overdueDays * 10;
    reasons.push(
      overdueDays === 1
        ? "overdue by 1 day"
        : `overdue by ${overdueDays} days`
    );
  } else if (item.nextReviewDate && dayDiff(asOf, item.nextReviewDate) === 0) {
    score += 12;
    reasons.push("due today");
  } else if (
    item.nextReviewDate &&
    dayDiff(asOf, item.nextReviewDate) > 0
  ) {
    // Not yet due — mild negative so due items win
    const early = dayDiff(asOf, item.nextReviewDate);
    score -= Math.min(20, early * 2);
  }

  // Mistakes
  if (mistakes > 0) {
    score += mistakes * 8;
    reasons.push(
      mistakes === 1 ? "1 recorded mistake" : `${mistakes} recorded mistakes`
    );
  }

  // Low stability / strength
  if (stability < 0.45) {
    score += (0.45 - stability) * 50;
    reasons.push("low stability");
  }
  if (strength < 0.45) {
    score += (0.45 - strength) * 40;
    reasons.push("low strength");
  }

  // Failed recent reviews
  if (item.consecutiveFailures > 0) {
    score += item.consecutiveFailures * 18;
    reasons.push(
      item.consecutiveFailures === 1
        ? "failed previous review"
        : `${item.consecutiveFailures} consecutive failures`
    );
  }

  if (success < 0.6 && item.reviewCount >= 2) {
    score += (0.6 - success) * 30;
    reasons.push("low success rate");
  }

  // Near / urgent
  if (item.urgent) {
    score += 80;
    reasons.push("urgent near-revision hold");
  } else if (item.isNear) {
    score += 50;
    reasons.push("near revision (recent hifz)");
  }

  // Never reviewed after creation
  if (item.reviewCount === 0 && item.lastReviewedAt == null) {
    score += 20;
    if (!reasons.includes("first review pending")) {
      reasons.push("new memorized unit — first review scheduled");
    }
  }

  // Strong stable → lower priority (less frequent)
  if (stability >= 0.75 && strength >= 0.75 && mistakes === 0 && overdueDays === 0) {
    score -= 15;
    reasons.push("strong stable unit — lower frequency");
  }

  // Weak overall
  if (stability < 0.35 && strength < 0.4) {
    score += 25;
    reasons.push("weak retention profile");
  }

  // Volume importance: longer units matter more when risk is equal
  // (prevents short Amma surahs from dominating equal-strength queues)
  const pages = Math.max(0, item.content?.pagesApprox ?? 0);
  if (pages > 0) {
    score += Math.min(35, pages * 10);
    if (pages >= 1.5) reasons.push("substantial unit volume");
  }

  // Composite reason for high-mistake overdue
  if (mistakes >= 3 && overdueDays > 0) {
    reasons.push("high mistakes + overdue review");
  }

  // Round for stable floats
  const priorityScore = Math.round(score * 1000) / 1000;

  if (reasons.length === 0) {
    reasons.push("baseline priority");
  }

  return {
    item,
    priorityScore,
    reasons: Object.freeze([...reasons]),
  };
}

/**
 * Stable compare: higher score first, then id ascending for ties.
 * Named distinctly from resolution's compareRanked.
 */
export function compareRankedRevision(
  a: RankedRevisionItem,
  b: RankedRevisionItem
): number {
  if (b.priorityScore !== a.priorityScore) {
    return b.priorityScore - a.priorityScore;
  }
  return a.item.id.localeCompare(b.item.id);
}
