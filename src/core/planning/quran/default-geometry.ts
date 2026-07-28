/**
 * Default QuranGeometry backed by project mushaf helpers.
 * Pure reads only — no I/O beyond static corpus already loaded by lib.
 */

import { getPageOfAyah } from "@/lib/quran/page-boundaries";
import { getExactPageOfAyah } from "@/lib/quran/madani-page-map";
import { getSurah, SURAHS } from "@/lib/quran/surahs";
import type { QuranGeometry } from "./types";

/**
 * Production geometry: exact Madani 604-page map + surah metadata.
 */
export function createDefaultQuranGeometry(): QuranGeometry {
  return {
    firstSurah: 1,
    lastSurah: 114,
    getAyahCount(surahNumber: number): number {
      return getSurah(surahNumber)?.ayahCount ?? 0;
    },
    getPageOfAyah(surahNumber: number, ayahNumber: number): number {
      return getPageOfAyah(surahNumber, ayahNumber);
    },
    getSurahNameAr(surahNumber: number): string {
      return getSurah(surahNumber)?.nameAr ?? String(surahNumber);
    },
  };
}

/**
 * Same exact Madani page map as production (tests must match real mushaf).
 * Name kept for backward-compat with test imports.
 */
export function createMetadataQuranGeometry(): QuranGeometry {
  const byNum = new Map(SURAHS.map((s) => [s.number, s]));

  return {
    firstSurah: 1,
    lastSurah: 114,
    getAyahCount(surahNumber: number): number {
      return byNum.get(surahNumber)?.ayahCount ?? 0;
    },
    getPageOfAyah(surahNumber: number, ayahNumber: number): number {
      return getExactPageOfAyah(surahNumber, ayahNumber);
    },
    getSurahNameAr(surahNumber: number): string {
      return byNum.get(surahNumber)?.nameAr ?? String(surahNumber);
    },
  };
}
