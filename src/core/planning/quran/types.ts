/**
 * Quran chunk domain types — geometry only.
 * No pedagogy, no rules, no scheduling.
 */

/** Absolute position in the mushaf. */
export interface QuranPointer {
  surahNumber: number;
  ayahNumber: number;
  pageNumber?: number;
}

/** Inclusive surah span of a chunk (numeric min…max). */
export interface SurahRange {
  fromSurah: number;
  toSurah: number;
}

/**
 * A contiguous memorization slice produced by the chunk engine.
 */
export interface QuranChunk {
  startPointer: QuranPointer;
  endPointer: QuranPointer;
  surahRange: SurahRange;
  /** Approximate mushaf pages covered (page span) */
  pages: number;
  estimatedMinutes: number;
  /** Optional Arabic label for later UI (no UI logic here) */
  labelAr?: string;
}

/** Capacity for the next hifz chunk (pages is primary). */
export interface ChunkCapacity {
  /** Target pages for this chunk (e.g. Decision / profile pagesPerDay) */
  pages: number;
  /**
   * Optional total minute budget for the chunk.
   * If omitted, estimatedMinutes = pages * minutesPerPage.
   */
  minutes?: number;
}

/** Reading / track direction for consecutive surah collection. */
export type ChunkDirection = "forward" | "backward";

/**
 * Pure geometry surface injected into the chunk engine.
 * Implementations may wrap static metadata or full Uthmani maps.
 */
export interface QuranGeometry {
  /** Ayah count for surah 1–114 */
  getAyahCount(surahNumber: number): number;
  /** Madani mushaf page (1–604) of a specific ayah */
  getPageOfAyah(surahNumber: number, ayahNumber: number): number;
  /** Arabic surah name (for labels) */
  getSurahNameAr(surahNumber: number): string;
  firstSurah?: number;
  lastSurah?: number;
}

export interface CreateChunkOptions {
  /** forward = 1→114; backward = 114→78 (beginner bottom-up) */
  direction?: ChunkDirection;
  /** Default 12 minutes per page when capacity.minutes omitted */
  minutesPerPage?: number;
}

export interface AdvancePointerOptions {
  direction?: ChunkDirection;
}
