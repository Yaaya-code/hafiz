/**
 * Precise Uthmani / Madani mushaf page ↔ ayah boundaries.
 * Uses exact 604-page Madani map (imported offline), not linear approximation.
 *
 * Convention:
 *   - page = one face (وجه) of the printed mushaf, 1..604
 *   - one paper leaf (ورقة) = 2 pages
 */

import type { AyahRecord } from "./types";
import { getFullCorpus, getAyah } from "./ayahs";
import { getSurah } from "./surahs";
import {
  getExactPageOfAyah,
  getExactPageSpans,
  MADANI_PAGE_COUNT,
  rangeForMadaniPages,
} from "./madani-page-map";

let pageIndex: Map<number, AyahRecord[]> | null = null;

function ensurePageIndex() {
  if (pageIndex) return pageIndex;
  pageIndex = new Map();
  for (const a of getFullCorpus()) {
    const list = pageIndex.get(a.page) || [];
    list.push(a);
    pageIndex.set(a.page, list);
  }
  return pageIndex;
}

/** All ayahs that fall on a given mushaf page (1–604). */
export function getAyahsOnPage(page: number): AyahRecord[] {
  const idx = ensurePageIndex();
  const list = idx.get(page);
  if (list && list.length) return list;
  // Fallback from exact spans
  const spans = getExactPageSpans(page);
  const out: AyahRecord[] = [];
  for (const sp of spans) {
    for (let a = sp.from; a <= sp.to; a++) {
      out.push(getAyah(sp.surah, a));
    }
  }
  return out;
}

/** Exact Madani page of a surah/ayah position. */
export function getPageOfAyah(surahNumber: number, ayahNumber: number): number {
  return getExactPageOfAyah(surahNumber, ayahNumber);
}

export type MemorizationChunk = {
  surahNumber: number;
  surahName: string;
  fromAyah: number;
  toAyah: number;
  pages: number;
  startPage: number;
  endPage: number;
  labelAr: string;
};

/**
 * Exact new-hifz chunk for N mushaf pages starting at (surah, ayah).
 * Uses Madani page IDs: 1 page = all ayahs on that face of the mushaf.
 */
export function getMemorizationChunkByPages(
  startSurah: number,
  startAyah: number,
  pagesPerDay: number
): MemorizationChunk {
  if (pagesPerDay === 0) {
    const meta = getSurah(startSurah);
    const startPage = getPageOfAyah(startSurah, Math.max(1, startAyah));
    return {
      surahNumber: startSurah,
      surahName: meta?.nameAr ?? String(startSurah),
      fromAyah: 0,
      toAyah: 0,
      pages: 0,
      startPage,
      endPage: startPage,
      labelAr: "مراجعة فقط — لا حفظ جديد",
    };
  }

  let surahNumber = Math.min(114, Math.max(1, startSurah));
  let ayahNumber = Math.max(1, startAyah);
  const meta0 = getSurah(surahNumber);
  if (!meta0) {
    return {
      surahNumber: 1,
      surahName: "الفاتحة",
      fromAyah: 1,
      toAyah: 7,
      pages: 1,
      startPage: 1,
      endPage: 1,
      labelAr: "الفاتحة 1–7 · ص 1",
    };
  }
  if (ayahNumber > meta0.ayahCount) {
    surahNumber = Math.min(114, surahNumber + 1);
    ayahNumber = 1;
  }

  const ranged = rangeForMadaniPages(surahNumber, ayahNumber, pagesPerDay);
  const surahMeta = getSurah(ranged.surah)!;
  const pagesActual = Math.max(
    1,
    Math.min(MADANI_PAGE_COUNT, ranged.endPage - ranged.startPage + 1)
  );

  return {
    surahNumber: ranged.surah,
    surahName: surahMeta.nameAr,
    fromAyah: ranged.fromAyah,
    toAyah: ranged.toAyah,
    pages: pagesActual,
    startPage: ranged.startPage,
    endPage: ranged.endPage,
    labelAr:
      surahMeta.nameAr +
      " " +
      ranged.fromAyah +
      "–" +
      ranged.toAyah +
      (ranged.startPage !== ranged.endPage
        ? " · ص " + ranged.startPage + "–" + ranged.endPage
        : " · ص " + ranged.startPage),
  };
}

/**
 * Next memorization start after completing a chunk (same surah or next).
 */
export function nextStartAfterChunk(chunk: MemorizationChunk): {
  surahNumber: number;
  ayahNumber: number;
} {
  const meta = getSurah(chunk.surahNumber);
  if (!meta) return { surahNumber: 1, ayahNumber: 1 };
  if (chunk.toAyah >= meta.ayahCount) {
    return {
      surahNumber: Math.min(114, chunk.surahNumber + 1),
      ayahNumber: 1,
    };
  }
  return { surahNumber: chunk.surahNumber, ayahNumber: chunk.toAyah + 1 };
}

/** Total Madani pages in corpus. */
export function getMushafPageCount(): number {
  return MADANI_PAGE_COUNT;
}
