/**
 * Day-0 SRS initialization from memorization profile / far queue.
 *
 * Rules:
 * - Never mark the entire corpus "due today".
 * - Strength drives first interval (strong → later; weak → sooner).
 * - Stagger start offsets so short Amma units don't flood day 1.
 * - SRS only orders revision — does not decide NEW_HIFZ eligibility.
 */

import type { RevisionMemoryItem } from "@/core";
import type { AppRevisionQueueItem } from "@/core/adapters/types";
import type { HafizProfile } from "@/lib/user-profile";
import {
  buildFarQueueFromMemorizedSurahs,
  collectMemorizedSurahsFromProfile,
} from "./bootstrap-from-profile";

function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]) + Math.trunc(days)
  );
  const d = new Date(utc);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** First-review interval (days) from strength 0–1 */
export function initialIntervalDays(strengthScore: number): number {
  if (strengthScore >= 0.8) return 7;
  if (strengthScore >= 0.65) return 4;
  if (strengthScore >= 0.5) return 2;
  if (strengthScore >= 0.35) return 1;
  return 0; // very weak → due today (small set only)
}

/**
 * Stagger so not all units share the same first due date.
 * Index spreads within a 0–6 day band scaled by strength.
 */
export function staggerOffsetDays(
  index: number,
  strengthScore: number
): number {
  const band = strengthScore >= 0.65 ? 6 : strengthScore >= 0.45 ? 4 : 2;
  return index % (band + 1);
}

function strengthFromPriority(prio: number): number {
  if (prio >= 160) return 0.25;
  if (prio >= 120) return 0.4;
  if (prio >= 80) return 0.55;
  return 0.75;
}

/**
 * Build initial SRS bank from far-queue seeds (or profile selection).
 */
export function initializeSrsMemoryFromFarQueue(
  farQueue: AppRevisionQueueItem[],
  asOfDate: string
): RevisionMemoryItem[] {
  const out: RevisionMemoryItem[] = [];
  farQueue.forEach((f, index) => {
    const slice = f.slice;
    if (!slice) return;

    const strengthScore = strengthFromPriority(f.priority || 0);
    const stabilityScore = Math.max(0.2, strengthScore - 0.1);
    const pages = Math.max(0.25, slice.pagesApprox ?? 0.5);
    const baseInterval = initialIntervalDays(strengthScore);
    const offset = staggerOffsetDays(index, strengthScore);
    const firstDueIn = baseInterval + offset;
    const nextReviewDate = addDays(asOfDate, firstDueIn);
    const id =
      f.id ??
      `srs_seed_${slice.range?.surah ?? "x"}_${slice.range?.fromAyah ?? 0}_${index}`;

    out.push({
      id,
      content: {
        surah: slice.range?.surah,
        fromAyah: slice.range?.fromAyah,
        toAyah: slice.range?.toAyah,
        fromSurah: slice.span?.fromSurah,
        toSurah: slice.span?.toSurah,
        page: slice.startPage,
        pagesApprox: pages,
        labelAr: slice.labelAr,
      },
      lastReviewedAt: null,
      reviewCount: 0,
      mistakesCount: 0,
      successRate: Math.min(0.95, 0.5 + strengthScore * 0.4),
      strengthScore,
      stabilityScore,
      nextReviewDate,
      intervalDays: Math.max(1, baseInterval || 1),
      easeFactor: 2.5,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      isNear: false,
      // Only truly weak units are urgent on day 0
      urgent: strengthScore < 0.3,
      source: "far_corpus" as const,
    });
  });
  return out;
}

/**
 * Full day-0 init from HafizProfile when revisionMemory is empty.
 */
export function initializeSrsFromProfile(
  profile: HafizProfile,
  asOfDate: string
): RevisionMemoryItem[] {
  const surahs = collectMemorizedSurahsFromProfile(profile.memorizationSelection);
  if (surahs.length === 0) return [];

  const far = buildFarQueueFromMemorizedSurahs(
    surahs,
    profile.memorizationSelection
  );
  // Sort weak first for stagger so weak get earlier offsets intentionally
  const sorted = [...far].sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );
  return initializeSrsMemoryFromFarQueue(sorted, asOfDate);
}

/** Count how many units are due on asOfDate (for tests / diagnostics). */
export function countDueOn(
  memory: RevisionMemoryItem[],
  asOfDate: string
): number {
  return memory.filter((m) => {
    if (m.urgent) return true;
    if (!m.nextReviewDate) return true;
    return m.nextReviewDate <= asOfDate;
  }).length;
}
