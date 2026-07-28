/**
 * Shared primitive domain types for the Quran Planning Engine.
 * No UI. No business-rule implementation.
 */

/** Mushaf surah number 1–114 */
export type SurahNumber = number;

/** Ayah number within a surah (1-based) */
export type AyahNumber = number;

/** Madani mushaf page number (typically 1–604) */
export type PageNumber = number;

/** Juz number 1–30 */
export type JuzNumber = number;

/** ISO calendar date YYYY-MM-DD */
export type ISODate = string;

/** Opaque user / profile identifier */
export type UserId = string;

/** Relative strength of memorized material */
export type MemorizationStrengthLevel =
  | "STRONG"
  | "GOOD"
  | "NEEDS_REVIEW"
  | "WEAK";

/**
 * How new memorization should route through the mushaf.
 * - continue_forward: after last continuous block (top-down)
 * - from_start: restart from Fatiha
 * - bottom_up: Juz Amma upward (An-Nas → …)
 * - complete_nearby: fill gaps / unfinished partial ranges first
 */
export type ProgressionMode =
  | "continue_forward"
  | "from_start"
  | "bottom_up"
  | "complete_nearby";

/** Intensity of the revision share of the day */
export type RevisionStyle = "intensive" | "balanced" | "light";

/** Preferred learning modality (informational for later rule phases) */
export type LearningStyle =
  | "LISTENING"
  | "READING"
  | "WRITING"
  | "LISTEN_AND_READ"
  | "WITH_TEACHER";

/** Absolute pointer into the mushaf (surah + ayah) */
export interface MushafPointer {
  surah: SurahNumber;
  ayah: AyahNumber;
}

/** Inclusive ayah range within one surah */
export interface AyahRange {
  surah: SurahNumber;
  fromAyah: AyahNumber;
  toAyah: AyahNumber;
}

/** Inclusive multi-surah span (e.g. short-surah bundle) */
export interface SurahSpan {
  fromSurah: SurahNumber;
  toSurah: SurahNumber;
}

/** A quantifiable slice of Quran content for one plan slot */
export interface QuranSlice {
  labelAr: string;
  range?: AyahRange;
  span?: SurahSpan;
  /** Approximate mushaf pages covered */
  pagesApprox: number;
  /** Optional Uthmani page bounds */
  startPage?: PageNumber;
  endPage?: PageNumber;
}

/** Kind of daily work unit */
export type PlanSlotKind =
  | "new_hifz"
  | "near_revision"
  | "far_revision"
  | "foundation_revision"
  | "weekly_anchor"
  | "listening"
  | "quiz"
  | "mutashabihat"
  | "reflection"
  | "rest";
