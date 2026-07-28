import type { AyahRecord } from "./types";
import { SURAHS } from "./surahs";
import uthmaniBySurah from "./data/uthmani-by-surah.json";
import { getExactPageOfAyah } from "./madani-page-map";

/**
 * Full Quran Uthmani text — all 114 surahs, 6236 ayahs.
 * Source: quran-json (Uthmani).
 * Page numbers: exact Madani 604-page map (not linear interpolation).
 */
type SurahTextMap = Record<string, string[]>;

const TEXT_MAP = uthmaniBySurah as SurahTextMap;

function approxJuz(surahNumber: number): number {
  return SURAHS.find((s) => s.number === surahNumber)?.startJuz ?? 1;
}

function approxHizb(juz: number, ayahNumber: number): number {
  return Math.min(60, Math.max(1, (juz - 1) * 2 + (ayahNumber > 40 ? 2 : 1)));
}

const GLOBAL_INDEX: Record<string, number> = {};
let globalReady = false;

function ensureGlobalIndex() {
  if (globalReady) return;
  let n = 0;
  for (let s = 1; s <= 114; s++) {
    const verses = TEXT_MAP[String(s)] || [];
    for (let a = 1; a <= verses.length; a++) {
      n += 1;
      GLOBAL_INDEX[s + ":" + a] = n;
    }
  }
  globalReady = true;
}

let corpusCache: AyahRecord[] | null = null;

export function getFullCorpus(): AyahRecord[] {
  if (corpusCache) return corpusCache;
  ensureGlobalIndex();
  const list: AyahRecord[] = [];
  for (const surah of SURAHS) {
    const verses = TEXT_MAP[String(surah.number)] || [];
    for (let i = 0; i < verses.length; i++) {
      const ayahNumber = i + 1;
      const juz = approxJuz(surah.number);
      list.push({
        surahNumber: surah.number,
        ayahNumber,
        text: verses[i],
        page: getExactPageOfAyah(surah.number, ayahNumber),
        juz,
        hizb: approxHizb(juz, ayahNumber),
        globalIndex: GLOBAL_INDEX[surah.number + ":" + ayahNumber],
      });
    }
  }
  corpusCache = list;
  return list;
}

/** Alias used across the app */
export function getAyahCorpus(): AyahRecord[] {
  return getFullCorpus();
}

export function getAyah(surahNumber: number, ayahNumber: number): AyahRecord {
  const verses = TEXT_MAP[String(surahNumber)];
  const surah = SURAHS.find((s) => s.number === surahNumber);
  if (!verses || !verses[ayahNumber - 1]) {
    return {
      surahNumber,
      ayahNumber,
      text: "…",
      page: surah?.startPage ?? 1,
      juz: surah?.startJuz ?? 1,
      hizb: 1,
    };
  }
  ensureGlobalIndex();
  const juz = approxJuz(surahNumber);
  return {
    surahNumber,
    ayahNumber,
    text: verses[ayahNumber - 1],
    page: getExactPageOfAyah(surahNumber, ayahNumber),
    juz,
    hizb: approxHizb(juz, ayahNumber),
    globalIndex: GLOBAL_INDEX[surahNumber + ":" + ayahNumber],
  };
}

export function getSurahAyahs(surahNumber: number): AyahRecord[] {
  const verses = TEXT_MAP[String(surahNumber)];
  if (!verses || !verses.length) return [];
  ensureGlobalIndex();
  const juz = approxJuz(surahNumber);
  return verses.map((text, i) => {
    const ayahNumber = i + 1;
    return {
      surahNumber,
      ayahNumber,
      text,
      page: getExactPageOfAyah(surahNumber, ayahNumber),
      juz,
      hizb: approxHizb(juz, ayahNumber),
      globalIndex: GLOBAL_INDEX[surahNumber + ":" + ayahNumber],
    };
  });
}

export function getVerseCount(surahNumber: number): number {
  return (TEXT_MAP[String(surahNumber)] || []).length;
}

/**
 * Default practice set with real text — full surahs commonly used for hifz.
 * Use getSurahAyahs(n) for any of the 114 surahs.
 */
export function getMemorizationPlaylist(): AyahRecord[] {
  const preferred = [
    1, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
    96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
    112, 113, 114, 67, 36, 55, 18, 2,
  ];
  const list: AyahRecord[] = [];
  for (const n of preferred) {
    list.push(...getSurahAyahs(n));
  }
  return list;
}

export function getAnySurahPlaylist(surahNumber: number): AyahRecord[] {
  return getSurahAyahs(surahNumber);
}

export function searchAyahs(query: string, limit = 50): AyahRecord[] {
  const q = query.trim();
  if (!q) return [];

  const m = q.match(/^(\d{1,3})\s*[:：]\s*(\d{1,3})$/);
  if (m) {
    return [getAyah(Number(m[1]), Number(m[2]))];
  }

  if (/^\d{1,3}$/.test(q)) {
    const page = Number(q);
    if (page >= 1 && page <= 604) {
      return getFullCorpus().filter((a) => a.page === page).slice(0, limit);
    }
  }

  // Surah name search -> first ayahs
  const surahHit = SURAHS.find(
    (s) =>
      s.nameAr.includes(q) ||
      s.nameEn.toLowerCase().includes(q.toLowerCase()) ||
      s.nameTransliteration.toLowerCase().includes(q.toLowerCase())
  );
  if (surahHit && q.length >= 2) {
    return getSurahAyahs(surahHit.number).slice(0, Math.min(limit, 15));
  }

  const results: AyahRecord[] = [];
  for (const surah of SURAHS) {
    const verses = TEXT_MAP[String(surah.number)] || [];
    for (let i = 0; i < verses.length; i++) {
      if (verses[i].includes(q)) {
        results.push(getAyah(surah.number, i + 1));
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

export const QURAN_STATS = {
  surahCount: 114,
  juzCount: 30,
  pageCount: 604,
  hizbCount: 60,
  ayahCountApprox: 6236,
  corpusAyahsLoaded: (() => {
    let n = 0;
    for (let s = 1; s <= 114; s++) n += (TEXT_MAP[String(s)] || []).length;
    return n;
  })(),
};
