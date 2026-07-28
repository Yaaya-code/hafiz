/**
 * Pure builders for product APIs from cloud/local learning snapshots.
 * No React, no localStorage — safe for Route Handlers.
 */

import { calculateHafizScore, scoreTier, scoreTrend } from "@/lib/hafiz-score";

export type MemoryRow = {
  id?: string;
  content?: {
    surah?: number;
    page?: number;
    fromAyah?: number;
    toAyah?: number;
    labelAr?: string;
    pagesApprox?: number;
  };
  lastReviewedAt?: string | null;
  nextReviewDate?: string | null;
  reviewCount?: number;
  mistakesCount?: number;
  strengthScore?: number;
  stabilityScore?: number;
  successRate?: number;
  intervalDays?: number;
  urgent?: boolean;
  isNear?: boolean;
  priorityScore?: number;
};

export type RevisionQueueItem = {
  id: string;
  pageNumber: number | null;
  surah: number | null;
  fromAyah: number | null;
  toAyah: number | null;
  label: string;
  priority: number;
  reason: string;
  status: "URGENT" | "NEAR" | "DUE" | "WEAK" | "SCHEDULED";
  estimatedMinutes: number;
  nextReviewDate: string | null;
  strengthScore: number;
};

function todayIso(asOf?: string): string {
  if (asOf && /^\d{4}-\d{2}-\d{2}/.test(asOf)) return asOf.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((ta - tb) / 86400000);
}

function labelOf(m: MemoryRow): string {
  if (m.content?.labelAr) return m.content.labelAr;
  if (m.content?.surah) {
    const from = m.content.fromAyah;
    const to = m.content.toAyah;
    if (from && to && from !== to) {
      return `سورة ${m.content.surah} · ${from}–${to}`;
    }
    if (from) return `سورة ${m.content.surah} · آية ${from}`;
    return `سورة ${m.content.surah}`;
  }
  if (m.content?.page) return `صفحة ${m.content.page}`;
  return "وحدة مراجعة";
}

function priorityOf(m: MemoryRow, asOf: string): {
  priority: number;
  reason: string;
  status: RevisionQueueItem["status"];
} {
  const strength = m.strengthScore ?? 0.5;
  const mistakes = m.mistakesCount ?? 0;
  const next = m.nextReviewDate;
  let priority = (1 - strength) * 40 + mistakes * 8;
  let reason = "مراجعة دورية";
  let status: RevisionQueueItem["status"] = "SCHEDULED";

  if (m.urgent) {
    priority += 50;
    reason = "عاجل — يحتاج تثبيتاً";
    status = "URGENT";
  } else if (m.isNear) {
    priority += 25;
    reason = "مراجعة قريبة (ورد حديث)";
    status = "NEAR";
  }

  if (next) {
    const d = dayDiff(asOf, next);
    if (d >= 0) {
      priority += 20 + Math.min(30, d * 5);
      reason = d === 0 ? "مستحق اليوم" : `متأخر ${d} يوماً`;
      status = status === "URGENT" ? "URGENT" : "DUE";
    } else if (d >= -1) {
      priority += 10;
      reason = "قريب الاستحقاق";
    }
  }

  if (strength < 0.45) {
    priority += 15;
    if (status === "SCHEDULED") status = "WEAK";
    reason = reason === "مراجعة دورية" ? "ضعف في القوة" : reason;
  }

  return { priority: Math.round(priority), reason, status };
}

/**
 * Rank revision memory into today's SRS queue + predictive (due soon).
 */
export function buildRevisionQueueFromMemory(
  memory: MemoryRow[],
  opts?: { asOfDate?: string; limit?: number }
): {
  queue: RevisionQueueItem[];
  predictive: RevisionQueueItem[];
  asOfDate: string;
  totalMemory: number;
} {
  const asOf = todayIso(opts?.asOfDate);
  const limit = opts?.limit ?? 20;

  // Deduplicate by memory id + content signature (engine can seed near + far twins)
  const seen = new Set<string>();
  const deduped: MemoryRow[] = [];
  for (const m of memory || []) {
    const contentKey = [
      m.id || "",
      m.content?.surah ?? "",
      m.content?.fromAyah ?? "",
      m.content?.toAyah ?? "",
      m.content?.labelAr ?? "",
    ].join(":");
    if (seen.has(contentKey)) continue;
    // Also collapse same surah range with different ids
    const rangeKey = [
      m.content?.surah ?? "",
      m.content?.fromAyah ?? "",
      m.content?.toAyah ?? "",
    ].join(":");
    if (rangeKey !== "::" && seen.has(`range:${rangeKey}`)) continue;
    seen.add(contentKey);
    if (rangeKey !== "::") seen.add(`range:${rangeKey}`);
    deduped.push(m);
  }

  const rows: RevisionQueueItem[] = deduped.map((m, i) => {
    const { priority, reason, status } = priorityOf(m, asOf);
    const pages = m.content?.pagesApprox ?? 0.5;
    return {
      id: m.id || `mem_${i}`,
      pageNumber: m.content?.page ?? null,
      surah: m.content?.surah ?? null,
      fromAyah: m.content?.fromAyah ?? null,
      toAyah: m.content?.toAyah ?? null,
      label: labelOf(m),
      priority,
      reason,
      status,
      estimatedMinutes: Math.max(2, Math.round(pages * 4)),
      nextReviewDate: m.nextReviewDate ?? null,
      strengthScore: m.strengthScore ?? 0.5,
    };
  });

  rows.sort((a, b) => b.priority - a.priority);

  const dueOrUrgent = rows.filter(
    (r) =>
      r.status === "URGENT" ||
      r.status === "DUE" ||
      r.status === "NEAR" ||
      r.status === "WEAK"
  );
  const queue = (dueOrUrgent.length ? dueOrUrgent : rows).slice(0, limit);

  const predictive = rows
    .filter((r) => {
      if (!r.nextReviewDate) return false;
      const d = dayDiff(r.nextReviewDate, asOf);
      return d > 0 && d <= 3;
    })
    .slice(0, 6);

  return {
    queue,
    predictive: predictive.length ? predictive : rows.slice(0, 6),
    asOfDate: asOf,
    totalMemory: deduped.length,
  };
}

export type ScoreSnapshotInput = {
  revisionMemory?: MemoryRow[];
  streak?: { current?: number; longest?: number; totalDays?: number };
  mistakesCount?: number;
  mistakeHits?: number;
  practiceSessions?: number;
  ayahsMastered?: number;
  journeyCompletedSteps?: number;
  journeyFinished?: boolean;
  quizSuccess?: number;
  quizTotal?: number;
  mutashabihatAccuracy?: number; // 0-100
};

/**
 * Compute Hafiz score from aggregated real signals (server-safe).
 */
export function buildHafizScoreFromSignals(input: ScoreSnapshotInput): {
  score: number;
  tier: string;
  tierColor: string;
  history: number[];
  streak: number;
  longestStreak: number;
  trend: "up" | "down" | "stable";
} {
  const streakDays = input.streak?.current ?? 0;
  const longest = input.streak?.longest ?? streakDays;
  const totalDays = input.streak?.totalDays ?? streakDays;

  const memory = input.revisionMemory || [];
  const mistakeHits = input.mistakeHits ?? input.mistakesCount ?? 0;
  const practiceSessions = input.practiceSessions ?? 0;
  const journeySteps = input.journeyCompletedSteps ?? 0;
  const quizTotal = input.quizTotal ?? 0;

  const hasActivity =
    streakDays > 0 ||
    totalDays > 0 ||
    mistakeHits > 0 ||
    practiceSessions > 0 ||
    memory.length > 0 ||
    journeySteps > 0 ||
    Boolean(input.journeyFinished) ||
    quizTotal > 0 ||
    typeof input.mutashabihatAccuracy === "number";

  // First-run / empty account: never invent a mid-range score or fake history
  if (!hasActivity) {
    const tier = scoreTier(0);
    return {
      score: 0,
      tier: tier.label,
      tierColor: tier.color,
      history: Array.from({ length: 12 }, () => 0),
      streak: 0,
      longestStreak: longest,
      trend: "stable",
    };
  }

  const avgStrength =
    memory.length > 0
      ? memory.reduce((s, m) => s + (m.strengthScore ?? 0), 0) / memory.length
      : 0;

  const activityUnits = Math.max(
    1,
    practiceSessions + memory.length + totalDays
  );
  const mistakeRate = Math.min(1, mistakeHits / (activityUnits + mistakeHits));

  const quizAccuracy =
    quizTotal > 0 ? (input.quizSuccess ?? 0) / quizTotal : 0;

  const consistency = Math.min(1, totalDays / 30);
  const reviewFrequency = Math.min(
    1,
    streakDays / 14 * 0.55 +
      Math.min(1, practiceSessions / 40) * 0.45
  );

  let revisionCompletion = 0;
  if (input.journeyFinished) revisionCompletion = 1;
  else if (journeySteps > 0) {
    revisionCompletion = Math.min(0.9, 0.2 + journeySteps * 0.15);
  }

  const muta =
    typeof input.mutashabihatAccuracy === "number"
      ? Math.min(1, Math.max(0, input.mutashabihatAccuracy / 100))
      : avgStrength;

  const score = calculateHafizScore({
    consistency,
    mistakeRate,
    reviewFrequency,
    quizAccuracy,
    revisionCompletion,
    mutashabihatMastery: muta,
    streakDays,
    longestStreak: longest,
  });

  const tier = scoreTier(score);

  // History: flat current score until real daily history is persisted
  const history = Array.from({ length: 12 }, () => score);

  return {
    score,
    tier: tier.label,
    tierColor: tier.color,
    history,
    streak: streakDays,
    longestStreak: longest,
    trend: scoreTrend(history),
  };
}
