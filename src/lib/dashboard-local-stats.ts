/**
 * Dashboard-only chrome stats from local stores + LearningSnapshot shape.
 * Presentation helpers — no core engine, no Prisma, no application runtime.
 */

import { loadJourneyProgress } from "@/lib/journey-progress";
import { loadAyahProgress, loadMemStats } from "@/lib/memorization-store";

/** Minimal snapshot shape (compatible with LearningSnapshot). */
export type DashboardSnapshotInput = {
  userState?: {
    sessions?: {
      records?: Array<{
        date?: string;
        kind?: string;
        outcome?: string;
      }>;
    };
  } | null;
  revisionMemory?: Array<{
    lastReviewedAt?: string | null;
    reviewCount?: number;
    strengthScore?: number;
    stabilityScore?: number;
    mistakesCount?: number;
    nextReviewDate?: string | null;
    urgent?: boolean;
  }>;
};

export type MushafStatusCounts = {
  mastered: number;
  good: number;
  needsReview: number;
  weak: number;
  notMemorized: number;
};

export type DailyGoalProgress = {
  /** Completed units toward today's target */
  current: number;
  /** Target units for today */
  target: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Daily goal: journey steps completed vs planned non-finish steps.
 * Falls back to profile revision pages / plan item counts.
 */
export function computeDailyGoalProgress(input: {
  plannedStepCount: number;
  plannedRevisionItems: number;
  profileDailyRevisionPages?: number;
}): DailyGoalProgress {
  const journey = loadJourneyProgress();
  const completed = journey.completedStepIds.filter((id) => id !== "finish")
    .length;

  const target = Math.max(
    1,
    input.plannedStepCount ||
      input.plannedRevisionItems ||
      input.profileDailyRevisionPages ||
      1
  );

  let current = completed;
  if (journey.finished) current = target;
  current = Math.min(current, target);

  return { current, target };
}

/**
 * Weekly review units completed (last 7 days).
 * Prefers session history; falls back to revision memory reviews + mem timeline.
 */
export function computeWeeklyReviewCount(
  snapshot: DashboardSnapshotInput | null
): number {
  const since = daysAgoIso(6); // inclusive window ~7 days
  let fromSessions = 0;
  let fromMemory = 0;

  const records = snapshot?.userState?.sessions?.records ?? [];
  for (const r of records) {
    if (!r.date || r.date < since) continue;
    if (r.outcome === "skipped") continue;
    fromSessions += 1;
  }

  for (const m of snapshot?.revisionMemory ?? []) {
    if (
      m.lastReviewedAt &&
      m.lastReviewedAt >= since &&
      (m.reviewCount || 0) > 0
    ) {
      fromMemory += 1;
    }
  }

  const timeline = loadMemStats().timeline || [];
  const fromTimeline = timeline
    .filter((t) => t.date >= since)
    .reduce((s, t) => s + (t.practiced || 0) + (t.mastered || 0), 0);

  if (fromSessions > 0) return fromSessions;
  if (fromMemory > 0) return fromMemory;
  return fromTimeline;
}

/**
 * Mushaf / retention status counts for dashboard chrome.
 * Primary: ayah progress. Fallback: revision memory strength buckets.
 */
export function computeMushafStatusCounts(
  snapshot: DashboardSnapshotInput | null
): MushafStatusCounts {
  const progress = Object.values(loadAyahProgress());
  const empty: MushafStatusCounts = {
    mastered: 0,
    good: 0,
    needsReview: 0,
    weak: 0,
    notMemorized: 0,
  };

  if (progress.length > 0) {
    const counts = { ...empty };
    for (const p of progress) {
      const st = p.status;
      if (st === "MASTERED" || st === "STRONG") counts.mastered += 1;
      else if (st === "GOOD") counts.good += 1;
      else if (st === "NEEDS_REVIEW") counts.needsReview += 1;
      else if (st === "WEAK") counts.weak += 1;
      else counts.notMemorized += 1; // NOT_STARTED
    }
    return counts;
  }

  const memory = snapshot?.revisionMemory ?? [];
  if (memory.length === 0) return empty;

  const today = todayIso();
  const counts = { ...empty };
  for (const m of memory) {
    const s = m.strengthScore ?? 0;
    const overdue =
      !!m.nextReviewDate &&
      m.nextReviewDate <= today &&
      (m.reviewCount || 0) > 0;
    if (m.urgent || (m.mistakesCount || 0) >= 3 || s < 0.35) {
      counts.weak += 1;
    } else if (overdue || s < 0.55) {
      counts.needsReview += 1;
    } else if (s >= 0.85 && (m.stabilityScore ?? 0) >= 0.55) {
      counts.mastered += 1;
    } else {
      counts.good += 1;
    }
  }
  return counts;
}
