/**
 * Sequential revision stream by Madani pages (N faces).
 *
 * Critical invariants:
 * 1) Pointer advances ONLY by pages that were actually packed (no gaps).
 * 2) N = distinct Madani Page_IDs, not sum of partial multi-surah slices on same page.
 * 3) Cross range boundaries seamlessly; wrap to first memorized range after last.
 * 4) No out-of-range; clamp cursor always.
 */

import type { QuranGeometry } from "./quran/types";
import {
  expandToMinUnit,
  STABILIZE_CHUNK_AYAHS,
  type RangeRef,
  type RevisionUnit,
} from "./revision-units";

export type SequentialCursor = {
  rangeIdx: number;
  ayah: number;
};

export type SequentialRange = RangeRef & { strengthScore?: number };

export type PackSequentialResult = {
  units: RevisionUnit[];
  nextCursor: SequentialCursor;
  /** Distinct Madani Page_IDs packed */
  pagesPacked: number;
  pageFrom?: number;
  pageTo?: number;
  wrapped: boolean;
  /** Page IDs in order for UI */
  pageIds: number[];
};

/**
 * Merge consecutive units of the same type + same surah into one span.
 * Display: StartAyah of first page → EndAyah of last page, with ص From–To.
 * Does not change nextCursor (still after the original last micro-unit).
 */
export function mergeConsecutiveSameSurahUnits(
  units: readonly RevisionUnit[],
  geometry?: QuranGeometry | null
): RevisionUnit[] {
  if (units.length <= 1) return [...units];

  const out: RevisionUnit[] = [];
  let cur: RevisionUnit = { ...units[0] };

  const pageOfUnit = (u: RevisionUnit) => {
    const p0 = pageOf(geometry, u.surah, u.fromAyah);
    const p1 = pageOf(geometry, u.surah, u.toAyah);
    return { p0: p0 ?? 0, p1: p1 ?? p0 ?? 0 };
  };

  const relabel = (u: RevisionUnit) => {
    const name = geometry?.getSurahNameAr?.(u.surah) ?? String(u.surah);
    const { p0, p1 } = pageOfUnit(u);
    const ayahPart =
      u.fromAyah === u.toAyah
        ? `آية ${u.fromAyah}`
        : `${u.fromAyah}–${u.toAyah}`;
    const pagePart =
      p0 > 0
        ? p0 === p1
          ? `ص ${p0}`
          : `ص ${p0}–${p1}`
        : "";
    return pagePart
      ? `${name} · ${ayahPart} · ${pagePart}`
      : `${name} · ${ayahPart}`;
  };

  for (let i = 1; i < units.length; i++) {
    const n = units[i];
    const adjacent =
      n.surah === cur.surah &&
      n.role === cur.role &&
      n.internalTier === cur.internalTier &&
      n.fromAyah <= cur.toAyah + 1;

    if (adjacent) {
      cur = {
        ...cur,
        toAyah: Math.max(cur.toAyah, n.toAyah),
        fromAyah: Math.min(cur.fromAyah, n.fromAyah),
        pagesApprox: (cur.pagesApprox || 0) + (n.pagesApprox || 0),
        minutes: (cur.minutes || 0) + (n.minutes || 0),
      };
      cur.labelAr = relabel(cur);
    } else {
      cur.labelAr = relabel(cur);
      out.push(cur);
      cur = { ...n };
    }
  }
  cur.labelAr = relabel(cur);
  out.push(cur);
  return out;
}

function pageOf(
  geometry: QuranGeometry | null | undefined,
  surah: number,
  ayah: number
): number | null {
  if (!geometry) return null;
  try {
    return geometry.getPageOfAyah(surah, ayah);
  } catch {
    return null;
  }
}

function pagesInUnit(
  geometry: QuranGeometry | null | undefined,
  surah: number,
  fromAyah: number,
  toAyah: number
): number {
  const p0 = pageOf(geometry, surah, fromAyah);
  const p1 = pageOf(geometry, surah, toAyah);
  if (p0 != null && p1 != null) return Math.max(1, Math.abs(p1 - p0) + 1);
  return Math.max(0.25, (toAyah - fromAyah + 1) / 15);
}

function minutesForPages(pages: number): number {
  // Soft estimate only — N-pages is the hard budget, not minutes
  return Math.max(4, Math.round(pages * 10));
}

function labelAr(
  geometry: QuranGeometry | null | undefined,
  surah: number,
  from: number,
  to: number
): string {
  const name = geometry?.getSurahNameAr?.(surah) ?? String(surah);
  let base = from === to ? `${name} · آية ${from}` : `${name} · ${from}–${to}`;
  const p0 = pageOf(geometry, surah, from);
  const p1 = pageOf(geometry, surah, to);
  if (p0 != null && p1 != null) {
    base += p0 === p1 ? ` · ص ${p0}` : ` · ص ${p0}–${p1}`;
  }
  return base;
}

export function sortRangesSequential(
  ranges: readonly SequentialRange[]
): SequentialRange[] {
  return [...ranges].sort(
    (a, b) => a.surah - b.surah || a.fromAyah - b.fromAyah
  );
}

/**
 * Merge adjacent/overlapping same-surah ranges so sequential walk never
 * invents gaps inside a declared memorized surah.
 */
export function mergeSequentialRanges(
  ranges: readonly SequentialRange[]
): SequentialRange[] {
  const sorted = sortRangesSequential(ranges);
  if (!sorted.length) return [];
  const out: SequentialRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    const cur = out[out.length - 1];
    if (n.surah === cur.surah && n.fromAyah <= cur.toAyah + 1) {
      cur.toAyah = Math.max(cur.toAyah, n.toAyah);
      cur.strengthScore = Math.min(
        cur.strengthScore ?? 1,
        n.strengthScore ?? 1
      );
    } else {
      out.push({ ...n });
    }
  }
  return out;
}

/** Start at first range (mushaf order) so Fatiha is never skipped. */
export function defaultSequentialCursor(
  ranges: readonly SequentialRange[],
  // preferredSurah kept for call-site compat; order is always mushaf-first
  preferredSurah?: number | null
): SequentialCursor {
  void preferredSurah;
  const sorted = mergeSequentialRanges(ranges);
  if (!sorted.length) return { rangeIdx: 0, ayah: 1 };
  // Always mushaf order from the earliest memorized material
  return { rangeIdx: 0, ayah: sorted[0].fromAyah };
}

export function clampSequentialCursor(
  ranges: readonly SequentialRange[],
  cursor: SequentialCursor
): SequentialCursor {
  const sorted = mergeSequentialRanges(ranges);
  if (!sorted.length) return { rangeIdx: 0, ayah: 1 };
  let rangeIdx =
    ((cursor.rangeIdx % sorted.length) + sorted.length) % sorted.length;
  let ayah = Math.floor(cursor.ayah || 1);
  const r = sorted[rangeIdx];
  if (ayah < r.fromAyah) ayah = r.fromAyah;
  if (ayah > r.toAyah) {
    rangeIdx = (rangeIdx + 1) % sorted.length;
    ayah = sorted[rangeIdx].fromAyah;
  }
  return { rangeIdx, ayah };
}

/**
 * One unit = remainder of current Madani page within current range.
 * Multi-surah pages produce multiple units on the SAME Page_ID (counted once).
 */
export function nextSequentialChunk(
  ranges: readonly SequentialRange[],
  cursor: SequentialCursor,
  geometry?: QuranGeometry | null
): {
  unit: RevisionUnit | null;
  nextCursor: SequentialCursor;
  wrapped: boolean;
  pageId: number | null;
} {
  const sorted = mergeSequentialRanges(ranges);
  if (sorted.length === 0) {
    return { unit: null, nextCursor: cursor, wrapped: false, pageId: null };
  }

  let rangeIdx =
    ((cursor.rangeIdx % sorted.length) + sorted.length) % sorted.length;
  let ayah = cursor.ayah;
  let guard = 0;
  let wrapped = false;
  const originIdx = rangeIdx;

  while (guard++ < sorted.length + 3) {
    const r = sorted[rangeIdx];
    const start = Math.max(r.fromAyah, ayah);
    if (start > r.toAyah) {
      const prev = rangeIdx;
      rangeIdx = (rangeIdx + 1) % sorted.length;
      ayah = sorted[rangeIdx].fromAyah;
      if (rangeIdx === 0 && prev === sorted.length - 1) wrapped = true;
      if (rangeIdx === originIdx && guard > sorted.length) break;
      continue;
    }

    let toAyah: number;
    let fromAyah = start;
    let pageId: number | null = null;

    if (geometry) {
      const startPage = geometry.getPageOfAyah(r.surah, start);
      pageId = startPage;
      let end = start;
      for (let a = start; a <= r.toAyah; a++) {
        const p = geometry.getPageOfAyah(r.surah, a);
        if (p > startPage) break;
        end = a;
      }
      toAyah = end;
    } else {
      const idealEnd = Math.min(r.toAyah, start + STABILIZE_CHUNK_AYAHS - 1);
      const expanded = expandToMinUnit(
        { surah: r.surah, fromAyah: start, toAyah: idealEnd },
        { minAyah: r.fromAyah, maxAyah: r.toAyah },
        geometry
      );
      toAyah = Math.min(r.toAyah, expanded.toAyah);
      fromAyah = Math.max(r.fromAyah, expanded.fromAyah);
    }

    toAyah = Math.min(r.toAyah, toAyah);
    fromAyah = Math.max(r.fromAyah, fromAyah);
    const pages = pagesInUnit(geometry, r.surah, fromAyah, toAyah);

    const unit: RevisionUnit = {
      surah: r.surah,
      fromAyah,
      toAyah,
      pagesApprox: pages,
      minutes: minutesForPages(pages),
      role: "corpus_rest",
      reasonAr: "مراجعة متسلسلة — صفحات المصحف بالترتيب",
      labelAr: labelAr(geometry, r.surah, fromAyah, toAyah),
      internalTier: "far",
    };

    let nextAyah = toAyah + 1;
    let nextIdx = rangeIdx;
    if (nextAyah > r.toAyah) {
      const prev = rangeIdx;
      nextIdx = (rangeIdx + 1) % sorted.length;
      nextAyah = sorted[nextIdx].fromAyah;
      if (nextIdx === 0 && prev === sorted.length - 1) wrapped = true;
    }

    return {
      unit,
      nextCursor: { rangeIdx: nextIdx, ayah: nextAyah },
      wrapped,
      pageId,
    };
  }

  return { unit: null, nextCursor: cursor, wrapped: false, pageId: null };
}

/**
 * Pack exactly N distinct Madani pages (when possible), no gaps.
 * Cursor = position AFTER the last packed unit only.
 */
export function packSequentialRevision(input: {
  ranges: readonly SequentialRange[];
  cursor: SequentialCursor;
  targetPages?: number;
  maxMinutes?: number;
  maxItems?: number;
  geometry?: QuranGeometry | null;
}): PackSequentialResult {
  const sorted = mergeSequentialRanges(input.ranges);
  const targetPages = Math.max(1, Math.round(input.targetPages ?? 3));
  // Allow many units per page (multi-surah pages)
  const maxItems = input.maxItems ?? Math.max(targetPages * 4, 12);

  let cursor = clampSequentialCursor(sorted, input.cursor);
  const units: RevisionUnit[] = [];
  const pageIdsOrdered: number[] = [];
  const pageSet = new Set<number>();
  let wrapped = false;
  let loops = 0;
  const maxLoops = Math.max(40, targetPages * 8);
  const startKey = `${cursor.rangeIdx}:${cursor.ayah}`;
  let fullCycles = 0;

  while (pageSet.size < targetPages && units.length < maxItems && loops++ < maxLoops) {
    const beforeKey = `${cursor.rangeIdx}:${cursor.ayah}`;
    const {
      unit,
      nextCursor,
      wrapped: didWrap,
      pageId,
    } = nextSequentialChunk(sorted, cursor, input.geometry);

    if (!unit) break;
    if (didWrap) wrapped = true;

    // Duplicate unit guard
    if (
      units.some(
        (u) =>
          u.surah === unit.surah &&
          u.fromAyah === unit.fromAyah &&
          u.toAyah === unit.toAyah
      )
    ) {
      cursor = nextCursor;
      if (`${cursor.rangeIdx}:${cursor.ayah}` === beforeKey) break;
      continue;
    }

    // Would this unit introduce a new page when we already have N?
    // Allow more units on the SAME last page (multi-surah same face).
    const newPage =
      pageId != null && !pageSet.has(pageId) ? pageId : null;
    if (newPage != null && pageSet.size >= targetPages) {
      // Already filled N distinct pages — stop WITHOUT advancing past this page
      break;
    }

    units.push(unit);
    cursor = nextCursor;

    if (pageId != null) {
      if (!pageSet.has(pageId)) {
        pageSet.add(pageId);
        pageIdsOrdered.push(pageId);
      }
    } else {
      // No geometry: count each unit as one "page" proxy
      pageSet.add(100000 + units.length);
      pageIdsOrdered.push(100000 + units.length);
    }

    const afterKey = `${cursor.rangeIdx}:${cursor.ayah}`;
    if (afterKey === startKey) {
      fullCycles++;
      if (fullCycles >= 1 && pageSet.size >= 1) {
        // Full pass of memorized map — stop (don't infinite-loop when map < N)
        break;
      }
    }
  }

  return {
    units,
    nextCursor: cursor,
    pagesPacked: pageSet.size,
    pageFrom: pageIdsOrdered[0],
    pageTo: pageIdsOrdered[pageIdsOrdered.length - 1],
    wrapped,
    pageIds: pageIdsOrdered,
  };
}
