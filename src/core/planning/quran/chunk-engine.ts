/**
 * Quran Chunk Engine — assigns ranges only.
 *
 * Does NOT decide:
 * - whether the user should memorize
 * - revision priority
 * - learning policy
 *
 * Pure + deterministic given (pointer, capacity, geometry, options).
 */

import type {
  AdvancePointerOptions,
  ChunkCapacity,
  ChunkDirection,
  CreateChunkOptions,
  QuranChunk,
  QuranGeometry,
  QuranPointer,
} from "./types";

const DEFAULT_MINUTES_PER_PAGE = 12;
const DEFAULT_FIRST = 1;
const DEFAULT_LAST = 114;

function firstSurah(g: QuranGeometry): number {
  return g.firstSurah ?? DEFAULT_FIRST;
}

function lastSurah(g: QuranGeometry): number {
  return g.lastSurah ?? DEFAULT_LAST;
}

function clampSurah(n: number, g: QuranGeometry): number {
  return Math.min(lastSurah(g), Math.max(firstSurah(g), Math.round(n)));
}

/**
 * Normalize pointer into a valid (surah, ayah) on the geometry.
 * Does not mutate input.
 */
export function normalizePointer(
  pointer: QuranPointer,
  geometry: QuranGeometry
): QuranPointer {
  let surah = clampSurah(pointer.surahNumber, geometry);
  let ayah = Math.max(1, Math.floor(pointer.ayahNumber || 1));
  let guard = 0;

  while (guard++ < 200) {
    const count = geometry.getAyahCount(surah);
    if (count <= 0) {
      surah = clampSurah(surah + 1, geometry);
      ayah = 1;
      continue;
    }
    if (ayah <= count) break;
    // Spill into next surah (always forward spill for overflow)
    if (surah >= lastSurah(geometry)) {
      ayah = count;
      break;
    }
    surah += 1;
    ayah = 1;
  }

  const pageNumber = geometry.getPageOfAyah(surah, ayah);
  return {
    surahNumber: surah,
    ayahNumber: ayah,
    pageNumber,
  };
}

/** Pages spanned between two pointers (inclusive page endpoints). */
export function pagesBetween(
  geometry: QuranGeometry,
  a: QuranPointer,
  b: QuranPointer
): number {
  const p0 = geometry.getPageOfAyah(a.surahNumber, a.ayahNumber);
  const p1 = geometry.getPageOfAyah(b.surahNumber, b.ayahNumber);
  return Math.max(0.25, Math.abs(p1 - p0) + 1);
}

/** Remaining pages from pointer through end of its surah. */
export function remainingSurahPages(
  geometry: QuranGeometry,
  pointer: QuranPointer
): number {
  const p = normalizePointer(pointer, geometry);
  const count = geometry.getAyahCount(p.surahNumber);
  if (count <= 0) return 0;
  const end: QuranPointer = {
    surahNumber: p.surahNumber,
    ayahNumber: count,
  };
  return pagesBetween(geometry, p, end);
}

function endOfSurah(
  geometry: QuranGeometry,
  surahNumber: number
): QuranPointer {
  const count = Math.max(1, geometry.getAyahCount(surahNumber));
  return normalizePointer(
    { surahNumber, ayahNumber: count },
    geometry
  );
}

function startOfSurah(
  geometry: QuranGeometry,
  surahNumber: number
): QuranPointer {
  return normalizePointer({ surahNumber, ayahNumber: 1 }, geometry);
}

function stepSurah(
  surah: number,
  direction: ChunkDirection,
  geometry: QuranGeometry
): number | null {
  if (direction === "forward") {
    const next = surah + 1;
    return next > lastSurah(geometry) ? null : next;
  }
  const prev = surah - 1;
  return prev < firstSurah(geometry) ? null : prev;
}

function estimateMinutes(
  pages: number,
  capacity: ChunkCapacity,
  minutesPerPage: number
): number {
  if (typeof capacity.minutes === "number" && capacity.minutes >= 0) {
    // Scale soft budget by filled fraction of capacity
    const cap = Math.max(0.25, capacity.pages || 0.25);
    const frac = Math.min(1, pages / cap);
    return Math.max(1, Math.round(capacity.minutes * frac));
  }
  return Math.max(1, Math.round(pages * minutesPerPage));
}

function buildLabel(
  geometry: QuranGeometry,
  start: QuranPointer,
  end: QuranPointer
): string {
  if (start.surahNumber === end.surahNumber) {
    const name = geometry.getSurahNameAr(start.surahNumber);
    return `${name} ${start.ayahNumber}–${end.ayahNumber}`;
  }
  const a = geometry.getSurahNameAr(start.surahNumber);
  const b = geometry.getSurahNameAr(end.surahNumber);
  return `${a} … ${b}`;
}

function makeChunk(
  geometry: QuranGeometry,
  start: QuranPointer,
  end: QuranPointer,
  capacity: ChunkCapacity,
  minutesPerPage: number
): QuranChunk {
  const pages = pagesBetween(geometry, start, end);
  const fromSurah = Math.min(start.surahNumber, end.surahNumber);
  const toSurah = Math.max(start.surahNumber, end.surahNumber);
  return {
    startPointer: {
      ...start,
      pageNumber: geometry.getPageOfAyah(start.surahNumber, start.ayahNumber),
    },
    endPointer: {
      ...end,
      pageNumber: geometry.getPageOfAyah(end.surahNumber, end.ayahNumber),
    },
    surahRange: { fromSurah, toSurah },
    pages,
    estimatedMinutes: estimateMinutes(pages, capacity, minutesPerPage),
    labelAr: buildLabel(geometry, start, end),
  };
}

/**
 * Long surah: take ayahs from pointer within the same surah up to capacity
 * pages, stopping at mushaf page boundaries (never past target end page).
 */
function splitLongSurah(
  geometry: QuranGeometry,
  start: QuranPointer,
  capacityPages: number,
  capacity: ChunkCapacity,
  minutesPerPage: number
): QuranChunk {
  const wholePages = Math.max(1, Math.ceil(capacityPages - 1e-9));
  const startPage = geometry.getPageOfAyah(start.surahNumber, start.ayahNumber);
  const targetEndPage = Math.min(604, startPage + wholePages - 1);
  const count = geometry.getAyahCount(start.surahNumber);

  let endAyah = start.ayahNumber;
  let endPage = startPage;

  for (let a = start.ayahNumber; a <= count; a++) {
    const p = geometry.getPageOfAyah(start.surahNumber, a);
    if (p > targetEndPage) break;
    // Valid page boundary: include ayah
    endAyah = a;
    endPage = p;
  }

  // Ensure at least one ayah
  if (endAyah < start.ayahNumber) endAyah = start.ayahNumber;

  // Fractional capacity < 1 page: trim ayah span proportionally on that page
  if (capacityPages < 1 && endAyah > start.ayahNumber) {
    const span = endAyah - start.ayahNumber + 1;
    endAyah =
      start.ayahNumber + Math.max(1, Math.ceil(span * capacityPages)) - 1;
    endPage = geometry.getPageOfAyah(start.surahNumber, endAyah);
  }

  // Exact Madani pages: one page may be a single long ayah (e.g. آية الدين).
  // Do NOT invent extra ayahs — page boundaries are the source of truth.

  const end: QuranPointer = {
    surahNumber: start.surahNumber,
    ayahNumber: endAyah,
    pageNumber: endPage,
  };

  return makeChunk(geometry, start, end, capacity, minutesPerPage);
}

/**
 * Short surah bundling: remaining current surah fits in capacity →
 * collect consecutive surahs until capacity is reasonably filled.
 */
function bundleShortSurahs(
  geometry: QuranGeometry,
  start: QuranPointer,
  capacityPages: number,
  capacity: ChunkCapacity,
  direction: ChunkDirection,
  minutesPerPage: number
): QuranChunk {
  // Always include remainder of current surah from start
  let end = endOfSurah(geometry, start.surahNumber);
  let cursorSurah = start.surahNumber;

  // Keep adding consecutive full surahs while they still fit within capacity.
  // Important: even when pages already equal capacity (e.g. An-Nas alone = 1 page),
  // continue bundling other short surahs that share the same page(s).
  while (true) {
    const nextS = stepSurah(cursorSurah, direction, geometry);
    if (nextS == null) break;

    const nextEnd = endOfSurah(geometry, nextS);
    const trialPages = pagesBetween(geometry, start, nextEnd);

    if (trialPages > capacityPages + 1e-9) {
      // Adding this surah would exceed capacity — stop (keep previous)
      break;
    }

    end = nextEnd;
    cursorSurah = nextS;
  }

  return makeChunk(geometry, start, end, capacity, minutesPerPage);
}

/**
 * Create the next new-hifz chunk from a pointer and capacity.
 * Returns null when capacity is zero/negative or pointer is exhausted.
 */
export function createNextHifzChunk(
  pointer: QuranPointer,
  capacity: ChunkCapacity,
  geometry: QuranGeometry,
  options: CreateChunkOptions = {}
): QuranChunk | null {
  const capacityPages =
    typeof capacity.pages === "number" && Number.isFinite(capacity.pages)
      ? capacity.pages
      : 0;

  if (capacityPages <= 0) {
    return null;
  }

  const direction: ChunkDirection = options.direction ?? "forward";
  const minutesPerPage = options.minutesPerPage ?? DEFAULT_MINUTES_PER_PAGE;
  const start = normalizePointer(pointer, geometry);

  // Exhausted at end of mushaf for this direction — do NOT re-emit An-Nas forever
  if (direction === "forward" && start.surahNumber >= lastSurah(geometry)) {
    const count = geometry.getAyahCount(start.surahNumber);
    // Already on (or past) last ayah of last surah → no further NEW_HIFZ
    if (start.ayahNumber >= count) return null;
  }
  if (direction === "backward" && start.surahNumber <= firstSurah(geometry)) {
    const count = geometry.getAyahCount(start.surahNumber);
    if (start.ayahNumber > count) return null;
  }

  const remaining = remainingSurahPages(geometry, start);

  // Entire remaining surah fits within capacity → short bundling
  if (remaining <= capacityPages + 1e-9) {
    return bundleShortSurahs(
      geometry,
      start,
      capacityPages,
      capacity,
      direction,
      minutesPerPage
    );
  }

  // Long surah: page-boundary split within the surah
  return splitLongSurah(
    geometry,
    start,
    capacityPages,
    capacity,
    minutesPerPage
  );
}

/**
 * Advance pointer to the first position after a generated chunk.
 * Does not mutate inputs.
 */
export function advancePointer(
  currentPointer: QuranPointer,
  generatedChunk: QuranChunk,
  geometry: QuranGeometry,
  options: AdvancePointerOptions = {}
): QuranPointer {
  const direction: ChunkDirection = options.direction ?? "forward";
  // Advancement is based on chunk end (currentPointer only used if needed for validation)
  void currentPointer;

  const end = generatedChunk.endPointer;
  const endSurah = clampSurah(end.surahNumber, geometry);
  const endAyah = end.ayahNumber;
  const count = geometry.getAyahCount(endSurah);

  if (direction === "forward") {
    if (endAyah < count) {
      return normalizePointer(
        { surahNumber: endSurah, ayahNumber: endAyah + 1 },
        geometry
      );
    }
    const next = stepSurah(endSurah, "forward", geometry);
    if (next == null) {
      // Stay at end of mushaf
      return normalizePointer(
        { surahNumber: endSurah, ayahNumber: count },
        geometry
      );
    }
    return startOfSurah(geometry, next);
  }

  // Backward (bottom-up): after finishing a chunk ending at endSurah,
  // continue at the previous surah from ayah 1 (or mid-ayah if partial).
  // If we only partially finished endSurah going... we always finish full short surahs in bundle.
  // If long split in backward mode (rare), end is last included ayah toward end of surah.
  // Next for bottom-up after completing end of surah N is surah N-1 ayah 1.
  // If partial within surah: next is endAyah+1 still going forward within that surah for long splits.
  // For consistency with long split always forward within surah:
  if (endAyah < count && generatedChunk.startPointer.surahNumber === endSurah) {
    // Partial long split inside one surah — continue same surah
    return normalizePointer(
      { surahNumber: endSurah, ayahNumber: endAyah + 1 },
      geometry
    );
  }

  const prev = stepSurah(endSurah, "backward", geometry);
  if (prev == null) {
    return normalizePointer(
      { surahNumber: endSurah, ayahNumber: 1 },
      geometry
    );
  }
  return startOfSurah(geometry, prev);
}
