/**
 * Revision Intelligence domain models.
 * Pure core — no Prisma, no localStorage, no UI.
 *
 * These describe memorized units under spaced-repetition tracking.
 * They do not decide what the learner should newly memorize.
 */

import type { ISODate, PageNumber, SurahNumber } from "./primitives";

/**
 * Content reference for a revision unit (geometry only).
 */
export interface RevisionContentRef {
  surah?: SurahNumber;
  page?: PageNumber;
  fromAyah?: number;
  toAyah?: number;
  fromSurah?: SurahNumber;
  toSurah?: SurahNumber;
  pagesApprox?: number;
  labelAr?: string;
}

/**
 * One unit of memorized content tracked by the SRS engine.
 */
export interface RevisionMemoryItem {
  id: string;
  /** What to review (range / page / surah) */
  content: RevisionContentRef;

  /** Last review day (YYYY-MM-DD) or null if never reviewed */
  lastReviewedAt: ISODate | null;
  /** Total reviews completed */
  reviewCount: number;
  /** Accumulated mistake signal (weighted count) */
  mistakesCount: number;
  /** 0–1 success fraction across reviews */
  successRate: number;
  /**
   * 0–1 perceived strength of this unit.
   * Higher = stronger retention.
   */
  strengthScore: number;
  /**
   * 0–1 stability (how well the interval has “settled”).
   * Higher = longer intervals tolerated.
   */
  stabilityScore: number;
  /** Next scheduled review day (YYYY-MM-DD) */
  nextReviewDate: ISODate | null;
  /** Current SM-2-style interval in days */
  intervalDays: number;
  /** Ease factor (≥ 1.3) */
  easeFactor: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;

  /** Yesterday’s new hifz / near-carry unit */
  isNear?: boolean;
  /**
   * Failed near revision or critical overdue —
   * stays in urgent near queue until success.
   */
  urgent?: boolean;

  source?:
    | "new_hifz"
    | "near_carry"
    | "far_corpus"
    | "foundation"
    | "manual";
}

/** Review quality for interval updates (no pedagogy beyond pass/fail). */
export type ReviewOutcome = "success" | "fail";

/**
 * Ranked row produced by the revision intelligence engine.
 */
export interface RankedRevisionItem {
  item: RevisionMemoryItem;
  /** Higher = schedule sooner */
  priorityScore: number;
  /** Deterministic human-readable scoring reasons */
  reasons: readonly string[];
}

/**
 * Capacity constraints for selecting daily revision load.
 */
export interface RevisionCapacity {
  /** Max items to select (default unlimited if omitted) */
  maxItems?: number;
  /** Soft minute budget */
  maxMinutes?: number;
  /** Soft page budget */
  maxPages?: number;
}
