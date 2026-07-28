/**
 * RevisionUnits — pedagogically sized content units.
 *
 * Rules (approved):
 * - Minimum unit: max(5 ayahs, ~¼ page) unless urgent single-ayah recovery
 * - Never emit default 52→52 style units for routine review
 * - Sequential chunks for stabilize / corpus; expanded neighborhood for carry
 */

import type { QuranGeometry } from "./quran/types";
import type { RevisionBucketKind } from "./revision-policy";

/** Minimum ayahs in a routine revision unit */
export const MIN_REVISION_AYAHS = 5;
/** Minimum approximate pages for a routine revision unit */
export const MIN_REVISION_PAGES = 0.25;
/** Target size for sequential stabilize chunks (ayahs) */
export const STABILIZE_CHUNK_AYAHS = 15;

export type RevisionUnit = {
  surah: number;
  fromAyah: number;
  toAyah: number;
  pagesApprox: number;
  minutes: number;
  role: RevisionBucketKind;
  reasonAr: string;
  labelAr: string;
  /** Internal only — maps to legacy PlanItem type */
  internalTier: "near" | "far";
  /** Allow from===to only when true */
  urgentSingleAyah?: boolean;
};

export type RangeRef = {
  surah: number;
  fromAyah: number;
  toAyah: number;
};

function ayahCount(from: number, to: number): number {
  return Math.max(0, to - from + 1);
}

/** Raw page span (no floor) — used for min-size checks. */
function rawPagesApprox(
  geometry: QuranGeometry | null | undefined,
  surah: number,
  fromAyah: number,
  toAyah: number
): number {
  if (geometry) {
    try {
      const p0 = geometry.getPageOfAyah(surah, fromAyah);
      const p1 = geometry.getPageOfAyah(surah, toAyah);
      return Math.max(0.05, Math.abs(p1 - p0) + 0.15);
    } catch {
      /* fall through */
    }
  }
  return Math.max(0.05, ayahCount(fromAyah, toAyah) / 15);
}

function pagesApproxFor(
  geometry: QuranGeometry | null | undefined,
  surah: number,
  fromAyah: number,
  toAyah: number
): number {
  return Math.max(
    MIN_REVISION_PAGES,
    rawPagesApprox(geometry, surah, fromAyah, toAyah)
  );
}

function minutesForPages(pages: number): number {
  return Math.max(5, Math.round(pages * 12));
}

function surahName(geometry: QuranGeometry | null | undefined, surah: number): string {
  if (geometry?.getSurahNameAr) {
    const n = geometry.getSurahNameAr(surah);
    if (n) return n;
  }
  return String(surah);
}

function labelFor(
  geometry: QuranGeometry | null | undefined,
  surah: number,
  fromAyah: number,
  toAyah: number
): string {
  const name = surahName(geometry, surah);
  if (fromAyah === toAyah) return `سورة ${name} · آية ${fromAyah}`;
  return `سورة ${name} · ${fromAyah}–${toAyah}`;
}

/**
 * Expand a tiny range to meet min unit size within [floor, ceil] bounds.
 */
export function expandToMinUnit(
  range: RangeRef,
  bounds: { minAyah: number; maxAyah: number },
  geometry?: QuranGeometry | null,
  opts?: { urgentSingleAyah?: boolean }
): RangeRef {
  let from = Math.max(bounds.minAyah, range.fromAyah);
  let to = Math.min(bounds.maxAyah, range.toAyah);
  if (to < from) {
    from = bounds.minAyah;
    to = Math.min(bounds.maxAyah, from);
  }

  if (opts?.urgentSingleAyah) {
    return { surah: range.surah, fromAyah: from, toAyah: Math.max(from, to) };
  }

  // Min unit = max(5 ayahs, ~¼ page). Prefer the stricter bound:
  // always aim for ≥5 ayahs; allow stop earlier only if real geometry span ≥¼ page
  // AND at least 3 ayahs (dense pages). Never stop at 1–2 ayahs for routine review.
  let guard = 0;
  while (guard++ < 400) {
    const span = ayahCount(from, to);
    const pages = rawPagesApprox(geometry, range.surah, from, to);
    if (span >= MIN_REVISION_AYAHS) break;
    if (pages >= MIN_REVISION_PAGES && span >= 3 && geometry) break;
    if (to < bounds.maxAyah) {
      to += 1;
      continue;
    }
    if (from > bounds.minAyah) {
      from -= 1;
      continue;
    }
    break;
  }

  return { surah: range.surah, fromAyah: from, toAyah: to };
}

/**
 * Build sequential stabilize chunks from fromAyah..toAyah starting at cursor.
 * Returns one chunk and the next cursor ayah (to+1).
 */
export function nextStabilizeChunk(
  surah: number,
  windowFrom: number,
  windowTo: number,
  cursorAyah: number,
  geometry?: QuranGeometry | null
): { unit: RevisionUnit | null; nextCursor: number } {
  if (windowTo < windowFrom) {
    return { unit: null, nextCursor: cursorAyah };
  }
  let start = Math.max(windowFrom, cursorAyah);
  if (start > windowTo) {
    // wrap to start of window for multi-day horizon
    start = windowFrom;
  }
  const idealEnd = Math.min(windowTo, start + STABILIZE_CHUNK_AYAHS - 1);
  const expanded = expandToMinUnit(
    { surah, fromAyah: start, toAyah: idealEnd },
    { minAyah: windowFrom, maxAyah: windowTo },
    geometry
  );
  const pages = pagesApproxFor(
    geometry,
    surah,
    expanded.fromAyah,
    expanded.toAyah
  );
  const unit: RevisionUnit = {
    surah,
    fromAyah: expanded.fromAyah,
    toAyah: expanded.toAyah,
    pagesApprox: pages,
    minutes: minutesForPages(pages),
    role: "stabilize_primary",
    reasonAr: "تثبيت ما تحفظينه من هذه السورة (ليس حفظاً جديداً)",
    labelAr: labelFor(geometry, surah, expanded.fromAyah, expanded.toAyah),
    internalTier: "far",
  };
  const nextCursor =
    expanded.toAyah >= windowTo ? windowFrom : expanded.toAyah + 1;
  return { unit, nextCursor };
}

/**
 * Neighborhood around last NEW_HIFZ or pointer — always min-expanded.
 */
export function buildNeighborhoodUnit(
  center: RangeRef,
  bounds: { minAyah: number; maxAyah: number },
  geometry?: QuranGeometry | null,
  opts?: { urgentSingleAyah?: boolean }
): RevisionUnit {
  // Prefer expanding around the center midpoint
  const mid = Math.floor((center.fromAyah + center.toAyah) / 2);
  const raw: RangeRef = {
    surah: center.surah,
    fromAyah: Math.max(bounds.minAyah, mid - 4),
    toAyah: Math.min(bounds.maxAyah, mid + 4),
  };
  // If center already large enough, use it
  if (
    !opts?.urgentSingleAyah &&
    ayahCount(center.fromAyah, center.toAyah) >= MIN_REVISION_AYAHS
  ) {
    raw.fromAyah = center.fromAyah;
    raw.toAyah = center.toAyah;
  }
  const expanded = expandToMinUnit(raw, bounds, geometry, opts);
  const pages = pagesApproxFor(
    geometry,
    expanded.surah,
    expanded.fromAyah,
    expanded.toAyah
  );
  return {
    surah: expanded.surah,
    fromAyah: expanded.fromAyah,
    toAyah: expanded.toAyah,
    pagesApprox: pages,
    minutes: minutesForPages(pages),
    role: "neighborhood",
    reasonAr: opts?.urgentSingleAyah
      ? "استرداد آية محددة بعد فشل"
      : "تثبيت ما قبل الحفظ الجديد مباشرة",
    labelAr: labelFor(
      geometry,
      expanded.surah,
      expanded.fromAyah,
      expanded.toAyah
    ),
    internalTier: "near",
    urgentSingleAyah: opts?.urgentSingleAyah,
  };
}

/**
 * Next sequential unit from a flat list of memorized ranges (excluding primary).
 */
export function nextCorpusChunk(
  ranges: readonly RangeRef[],
  index: { rangeIdx: number; ayah: number },
  geometry?: QuranGeometry | null
): { unit: RevisionUnit | null; nextIndex: { rangeIdx: number; ayah: number } } {
  if (ranges.length === 0) {
    return { unit: null, nextIndex: index };
  }

  let rIdx = index.rangeIdx % ranges.length;
  let guard = 0;
  while (guard++ < ranges.length + 2) {
    const r = ranges[rIdx];
    const start = Math.max(r.fromAyah, index.rangeIdx === rIdx ? index.ayah : r.fromAyah);
    if (start > r.toAyah) {
      rIdx = (rIdx + 1) % ranges.length;
      index = { rangeIdx: rIdx, ayah: ranges[rIdx].fromAyah };
      continue;
    }
    const idealEnd = Math.min(r.toAyah, start + STABILIZE_CHUNK_AYAHS - 1);
    const expanded = expandToMinUnit(
      { surah: r.surah, fromAyah: start, toAyah: idealEnd },
      { minAyah: r.fromAyah, maxAyah: r.toAyah },
      geometry
    );
    const pages = pagesApproxFor(
      geometry,
      expanded.surah,
      expanded.fromAyah,
      expanded.toAyah
    );
    const unit: RevisionUnit = {
      surah: expanded.surah,
      fromAyah: expanded.fromAyah,
      toAyah: expanded.toAyah,
      pagesApprox: pages,
      minutes: minutesForPages(pages),
      role: "corpus_rest",
      reasonAr: "صيانة باقي ما تحفظينه بالتسلسل",
      labelAr: labelFor(
        geometry,
        expanded.surah,
        expanded.fromAyah,
        expanded.toAyah
      ),
      internalTier: "far",
    };
    let nextAyah = expanded.toAyah + 1;
    let nextR = rIdx;
    if (nextAyah > r.toAyah) {
      nextR = (rIdx + 1) % ranges.length;
      nextAyah = ranges[nextR].fromAyah;
    }
    return { unit, nextIndex: { rangeIdx: nextR, ayah: nextAyah } };
  }

  return { unit: null, nextIndex: index };
}

export function unitKey(u: Pick<RevisionUnit, "surah" | "fromAyah" | "toAyah">): string {
  return `${u.surah}:${u.fromAyah}-${u.toAyah}`;
}
