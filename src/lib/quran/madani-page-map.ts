/**
 * Exact Madani Mushaf (King Fahd / 604 pages) mapping.
 * Source: api.quran.com v4 verses/by_page — imported offline JSON.
 *
 * Page = one face of the printed mushaf (1..604).
 * One paper leaf (ورقة) = 2 pages (وجهان).
 */

import madani from "./data/madani-pages.json";

export type MadaniPageSpan = {
  surah: number;
  from: number;
  to: number;
};

export type MadaniPageRecord = {
  page: number;
  spans: MadaniPageSpan[];
};

type MadaniFile = {
  version: number;
  source: string;
  pageCount: number;
  pages: MadaniPageRecord[];
  ayahPage: Record<string, number>;
};

const DATA = madani as MadaniFile;

const PAGE_BY_INDEX: MadaniPageRecord[] = DATA.pages;
const AYAH_PAGE = DATA.ayahPage;

export const MADANI_PAGE_COUNT = DATA.pageCount || 604;

export function ayahKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

/** Exact Madani page for an ayah (fallback 1 if unknown). */
export function getExactPageOfAyah(surah: number, ayah: number): number {
  const p = AYAH_PAGE[ayahKey(surah, ayah)];
  if (typeof p === "number" && p >= 1 && p <= MADANI_PAGE_COUNT) return p;
  return 1;
}

/** Spans on a single mushaf page (may cross surahs, e.g. page 50). */
export function getExactPageSpans(page: number): MadaniPageSpan[] {
  if (page < 1 || page > MADANI_PAGE_COUNT) return [];
  const rec = PAGE_BY_INDEX[page - 1];
  if (!rec || rec.page !== page) {
    // defensive: find by page field
    const hit = PAGE_BY_INDEX.find((r) => r.page === page);
    return hit?.spans ?? [];
  }
  return rec.spans ?? [];
}

/**
 * How many full Madani pages are covered by [fromAyah..toAyah] on one surah
 * (inclusive). Counts distinct page numbers.
 */
export function countExactPagesInRange(
  surah: number,
  fromAyah: number,
  toAyah: number
): number {
  if (toAyah < fromAyah) return 0;
  const pages = new Set<number>();
  for (let a = fromAyah; a <= toAyah; a++) {
    pages.add(getExactPageOfAyah(surah, a));
  }
  return Math.max(1, pages.size);
}

/**
 * Range starting at (surah, ayah) covering `pageCount` consecutive Madani pages.
 * Stays within one surah when possible; if the page ends mid-surah, ends there.
 * If remainder of surah is shorter than capacity, takes to end of surah only
 * (new-hifz product: one surah at a time for long material).
 */
export function rangeForMadaniPages(
  startSurah: number,
  startAyah: number,
  pageCount: number
): {
  surah: number;
  fromAyah: number;
  toAyah: number;
  startPage: number;
  endPage: number;
  pages: number;
} {
  const pages = Math.max(0.25, pageCount);
  const whole = Math.max(1, Math.round(pages));
  const startPage = getExactPageOfAyah(startSurah, startAyah);
  const targetEndPage = Math.min(MADANI_PAGE_COUNT, startPage + whole - 1);

  // Walk ayahs of this surah from start until page exceeds target
  // Need ayah count — use spans + scan
  let toAyah = startAyah;
  let endPage = startPage;

  // Find max ayah we can reach: last ayah on targetEndPage for this surah,
  // or last ayah still on a page <= targetEndPage
  // Scan forward using ayahPage until surah changes or page > target
  let a = startAyah;
  let guard = 0;
  while (guard++ < 400) {
    const key = ayahKey(startSurah, a);
    const p = AYAH_PAGE[key];
    if (p == null) break; // past end of surah
    if (p > targetEndPage) break;
    toAyah = a;
    endPage = p;
    a += 1;
  }

  // Fractional page (<1): take proportional ayahs on the start page only
  if (pages < 1 && toAyah > startAyah) {
    const span = toAyah - startAyah + 1;
    toAyah = startAyah + Math.max(1, Math.ceil(span * pages)) - 1;
    endPage = getExactPageOfAyah(startSurah, toAyah);
  }

  return {
    surah: startSurah,
    fromAyah: startAyah,
    toAyah: Math.max(startAyah, toAyah),
    startPage,
    endPage,
    pages: Math.max(1, endPage - startPage + 1),
  };
}

export function hasMadaniMap(): boolean {
  return Object.keys(AYAH_PAGE).length > 6000;
}
