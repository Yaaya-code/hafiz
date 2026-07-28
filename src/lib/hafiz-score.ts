/**
 * Hafiz Score (0–1000)
 * Weighted blend of consistency, accuracy, revision, mutashabihat, and streak.
 *
 * Local UI helpers below read client stores only — not the core engine.
 */

import { loadJourneyProgress } from "@/lib/journey-progress";
import { loadAyahProgress, loadMemStats } from "@/lib/memorization-store";
import { loadMistakes, loadStreak } from "@/lib/user-activity";

export interface ScoreInputs {
  consistency: number; // 0-1 daily review completion over 30 days
  mistakeRate: number; // 0-1 lower is better
  reviewFrequency: number; // 0-1 vs planned
  quizAccuracy: number; // 0-1
  revisionCompletion: number; // 0-1
  mutashabihatMastery: number; // 0-1
  streakDays: number;
  longestStreak: number;
}

/** Optional SRS memory rows from LearningSnapshot (application layer). */
export type LocalScoreMemoryHint = {
  strengthScore: number;
  stabilityScore?: number;
  mistakesCount?: number;
  /** Real practice only — engine-seeded units have reviewCount 0 */
  reviewCount?: number;
  lastReviewedAt?: string | null;
  consecutiveSuccesses?: number;
  consecutiveFailures?: number;
};

/**
 * Engine-seeded revision units after plan generation are NOT user activity.
 * Only count memory that has been practiced / reviewed / failed.
 */
export function hasRealUserMemoryActivity(
  revisionMemory?: LocalScoreMemoryHint[]
): boolean {
  if (!revisionMemory || revisionMemory.length === 0) return false;
  return revisionMemory.some(
    (m) =>
      (m.reviewCount ?? 0) > 0 ||
      Boolean(m.lastReviewedAt) ||
      (m.mistakesCount ?? 0) > 0 ||
      (m.consecutiveSuccesses ?? 0) > 0 ||
      (m.consecutiveFailures ?? 0) > 0
  );
}

export function calculateHafizScore(input: ScoreInputs): number {
  const streakScore = Math.min(1, input.streakDays / 90) * 0.6
    + Math.min(1, input.longestStreak / 180) * 0.4;

  const raw =
    input.consistency * 0.2 +
    (1 - input.mistakeRate) * 0.15 +
    input.reviewFrequency * 0.15 +
    input.quizAccuracy * 0.15 +
    input.revisionCompletion * 0.15 +
    input.mutashabihatMastery * 0.1 +
    streakScore * 0.1;

  return Math.round(Math.min(1000, Math.max(0, raw * 1000)));
}

/** True when the user has any real local activity (not first-run empty shell). */
export function hasLocalScoreActivity(
  revisionMemory?: LocalScoreMemoryHint[]
): boolean {
  const streak = loadStreak();
  const mistakes = loadMistakes();
  const progress = Object.values(loadAyahProgress());
  const mem = loadMemStats();
  const journey = loadJourneyProgress();
  return (
    streak.totalDays > 0 ||
    streak.current > 0 ||
    mistakes.length > 0 ||
    progress.length > 0 ||
    (mem.totalPracticeSessions || 0) > 0 ||
    (journey.completedStepIds?.length || 0) > 0 ||
    Boolean(journey.finished) ||
    hasRealUserMemoryActivity(revisionMemory)
  );
}

/**
 * Build score inputs from real localStorage activity (SSR-safe empty when offline browser).
 * First-run / empty users get all-zero inputs (never optimistic defaults).
 */
export function buildLocalScoreInputs(
  revisionMemory?: LocalScoreMemoryHint[]
): ScoreInputs {
  const streak = loadStreak();
  const mistakes = loadMistakes();
  const progress = Object.values(loadAyahProgress());
  const mem = loadMemStats();
  const journey = loadJourneyProgress();

  if (!hasLocalScoreActivity(revisionMemory)) {
    return {
      consistency: 0,
      mistakeRate: 1, // neutralizes (1 - mistakeRate) so empty score is 0
      reviewFrequency: 0,
      quizAccuracy: 0,
      revisionCompletion: 0,
      mutashabihatMastery: 0,
      streakDays: 0,
      longestStreak: 0,
    };
  }

  const totalTests = progress.reduce(
    (s, p) => s + (p.successTests || 0) + (p.failTests || 0),
    0
  );
  const successTests = progress.reduce((s, p) => s + (p.successTests || 0), 0);
  // No tests yet → 0 accuracy (not a fake mid-range default)
  const quizAccuracy = totalTests > 0 ? successTests / totalTests : 0;

  const totalMistakeHits = mistakes.reduce((s, m) => s + (m.frequency || 1), 0);
  const activityUnits = Math.max(
    1,
    mem.totalPracticeSessions + progress.length + streak.totalDays
  );
  const mistakeRate = Math.min(
    1,
    totalMistakeHits / (activityUnits + totalMistakeHits)
  );

  const consistency = Math.min(1, streak.totalDays / 30);
  const reviewFrequency = Math.min(
    1,
    streak.current / 14 * 0.55 +
      Math.min(1, mem.totalPracticeSessions / 40) * 0.45
  );

  let revisionCompletion = 0;
  if (journey.finished) revisionCompletion = 1;
  else if (journey.completedStepIds.length > 0) {
    // Scale by steps done today (cap ~0.9 until journey finished)
    revisionCompletion = Math.min(
      0.9,
      0.2 + journey.completedStepIds.length * 0.15
    );
  } else if (mem.totalPracticeSessions > 0) {
    revisionCompletion = Math.min(0.7, mem.totalPracticeSessions / 25);
  }

  let mutashabihatMastery = 0;
  if (revisionMemory && revisionMemory.length > 0) {
    const avg =
      revisionMemory.reduce((s, m) => s + (m.strengthScore || 0), 0) /
      revisionMemory.length;
    mutashabihatMastery = Math.min(1, Math.max(0, avg));
  } else if (progress.length > 0) {
    const avgConf =
      progress.reduce((s, p) => s + (p.confidence || 0), 0) / progress.length;
    mutashabihatMastery = Math.min(1, Math.max(0, avgConf));
  }

  return {
    consistency,
    mistakeRate,
    reviewFrequency,
    quizAccuracy,
    revisionCompletion,
    mutashabihatMastery,
    streakDays: streak.current,
    longestStreak: streak.longest,
  };
}

/** Live 0–1000 score from local activity (+ optional LearningSnapshot memory). */
export function computeLocalHafizScore(
  revisionMemory?: LocalScoreMemoryHint[]
): number {
  if (!hasLocalScoreActivity(revisionMemory)) return 0;
  return calculateHafizScore(buildLocalScoreInputs(revisionMemory));
}

/**
 * Sparkline points from mem timeline activity, anchored on current score.
 * Returns up to 12 values for the dashboard chart.
 * Empty users → flat zeros (no fake history bars).
 */
export function localScoreHistoryBars(
  currentScore: number,
  maxPoints = 12
): number[] {
  const timeline = loadMemStats().timeline || [];
  const last = timeline.slice(-maxPoints);
  if (last.length === 0) {
    // No activity timeline: flat line at current (0 for first-run)
    return Array.from({ length: maxPoints }, () =>
      currentScore > 0 ? currentScore : 0
    );
  }
  return last.map((row) => {
    const activity =
      (row.listened || 0) + (row.practiced || 0) * 2 + (row.mastered || 0) * 3;
    const delta = Math.min(80, activity * 8) - 20;
    return Math.round(
      Math.min(1000, Math.max(0, currentScore + delta))
    );
  });
}

export function scoreTier(score: number): {
  label: string;
  color: string;
} {
  if (score >= 900) return { label: "حافظ متقن", color: "text-[#D4AF37]" };
  if (score >= 750) return { label: "ممتاز", color: "text-[#D4AF37]" };
  if (score >= 600) return { label: "جيد جداً", color: "text-[#D4AF37]" };
  if (score >= 400) return { label: "جيد", color: "text-[#D4AF37]" };
  if (score >= 200) return { label: "مبتدئ", color: "text-violet-500" };
  return { label: "انطلق", color: "text-muted-foreground" };
}

export function scoreTrend(history: number[]): "up" | "down" | "stable" {
  if (history.length < 2) return "stable";
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const delta = last - prev;
  if (delta > 5) return "up";
  if (delta < -5) return "down";
  return "stable";
}
