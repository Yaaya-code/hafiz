import type { MushafPage, PageStatus, Mistake } from "./types";

/**
 * Spaced Repetition Engine for Hafiz
 * Adapts SM-2 style intervals with Quran-specific signals:
 * mistakes, confidence, quiz accuracy, and recency.
 */

export function classifyPage(page: Pick<
  MushafPage,
  "easeFactor" | "intervalDays" | "mistakeCount" | "confidence" | "lastReviewedAt" | "status"
>): PageStatus {
  if (page.status === "NOT_MEMORIZED") return "NOT_MEMORIZED";

  const daysSince = page.lastReviewedAt
    ? daysBetween(new Date(page.lastReviewedAt), new Date())
    : 999;

  if (page.mistakeCount >= 5 || page.confidence < 0.35) return "FORGOTTEN";
  if (page.mistakeCount >= 3 || page.confidence < 0.5) return "WEAK";
  if (daysSince > page.intervalDays * 1.5 || page.confidence < 0.7) return "NEEDS_REVIEW";
  if (page.easeFactor >= 2.3 && page.confidence >= 0.85 && page.mistakeCount === 0) {
    return "MASTERED";
  }
  return "GOOD";
}

export function nextInterval(
  currentInterval: number,
  easeFactor: number,
  quality: number // 0-5 (SM-2 style)
): { intervalDays: number; easeFactor: number } {
  let ef = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;

  let interval: number;
  if (quality < 3) {
    interval = 1;
  } else if (currentInterval <= 0) {
    interval = 1;
  } else if (currentInterval === 1) {
    interval = 3;
  } else {
    interval = Math.round(currentInterval * ef);
  }

  return { intervalDays: interval, easeFactor: Number(ef.toFixed(2)) };
}

export function scheduleReview(
  page: MushafPage,
  quality: number,
  now = new Date()
): MushafPage {
  const { intervalDays, easeFactor } = nextInterval(
    page.intervalDays,
    page.easeFactor,
    quality
  );

  const next = new Date(now);
  next.setDate(next.getDate() + intervalDays);

  const updated: MushafPage = {
    ...page,
    intervalDays,
    easeFactor,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: next.toISOString(),
    confidence: Math.min(1, Math.max(0, page.confidence + (quality - 3) * 0.08)),
    mistakeCount: quality < 3 ? page.mistakeCount + 1 : Math.max(0, page.mistakeCount - 1),
  };

  updated.status = classifyPage(updated);
  return updated;
}

export function prioritizeRevisionQueue(
  pages: MushafPage[],
  mistakes: Mistake[],
  limit = 20
): MushafPage[] {
  const mistakeWeight = new Map<number, number>();
  for (const m of mistakes) {
    mistakeWeight.set(m.pageNumber, (mistakeWeight.get(m.pageNumber) ?? 0) + m.frequency);
  }

  const score = (p: MushafPage) => {
    const statusScore: Record<PageStatus, number> = {
      FORGOTTEN: 100,
      WEAK: 80,
      NEEDS_REVIEW: 60,
      GOOD: 30,
      MASTERED: 10,
      NOT_MEMORIZED: 0,
    };
    const overdue = p.nextReviewAt
      ? Math.max(0, daysBetween(new Date(p.nextReviewAt), new Date()))
      : 5;
    const mistakes = (mistakeWeight.get(p.number) ?? 0) * 5;
    return statusScore[p.status] + overdue * 8 + mistakes + (1 - p.confidence) * 20;
  };

  return [...pages]
    .filter((p) => p.status !== "NOT_MEMORIZED")
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export function predictForgetting(pages: MushafPage[], withinDays = 2): MushafPage[] {
  const now = new Date();
  return pages
    .filter((p) => {
      if (!p.nextReviewAt || p.status === "NOT_MEMORIZED") return false;
      const next = new Date(p.nextReviewAt);
      const days = daysBetween(now, next);
      return days >= 0 && days <= withinDays && p.confidence < 0.8;
    })
    .sort((a, b) => a.confidence - b.confidence);
}

export function statusColor(status: PageStatus): string {
  switch (status) {
    case "MASTERED":
      return "bg-[#D4AF37]";
    case "GOOD":
      return "bg-[#D4AF37]/80";
    case "NEEDS_REVIEW":
      return "bg-[#D4AF37]/80";
    case "WEAK":
      return "bg-[#D4AF37]";
    case "FORGOTTEN":
      return "bg-[#D4AF37]";
    default:
      return "bg-muted";
  }
}

export function statusLabel(status: PageStatus): string {
  switch (status) {
    case "MASTERED":
      return "متقن";
    case "GOOD":
      return "جيد";
    case "NEEDS_REVIEW":
      return "يحتاج مراجعة";
    case "WEAK":
      return "ضعيف";
    case "FORGOTTEN":
      return "منسي";
    default:
      return "غير محفوظ";
  }
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
