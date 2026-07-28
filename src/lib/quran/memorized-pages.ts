/**
 * Build exact Madani Page_ID sets from declared memorization selection.
 * Used for skip-if-memorized (NEW_HIFZ) and revision page queue.
 *
 * Important: a page is "fully memorized" only if every ayah on that page
 * is covered by declared ranges — partial pages are NOT skipped.
 */

import type { MemorizationSelection } from "@/lib/quran/types";
import { getJuz } from "@/lib/quran/juz";
import { getSurah } from "@/lib/quran/surahs";
import {
  getExactPageOfAyah,
  getExactPageSpans,
  MADANI_PAGE_COUNT,
} from "@/lib/quran/madani-page-map";

type AyahRange = { surah: number; from: number; to: number };

function collectDeclaredRanges(
  sel: MemorizationSelection | null | undefined
): AyahRange[] {
  if (!sel) return [];
  const ranges: AyahRange[] = [];

  for (const s of sel.surahSelections ?? []) {
    const surah = Number(s.surah);
    if (surah < 1 || surah > 114) continue;
    const full = getSurah(surah)?.ayahCount ?? 1;
    const from = s.fromAyah && s.fromAyah > 0 ? s.fromAyah : 1;
    const to = s.toAyah && s.toAyah > 0 ? Math.min(full, s.toAyah) : full;
    ranges.push({ surah, from, to });
  }

  for (const j of sel.juzSelections ?? []) {
    const meta = getJuz(Number(j.juz));
    if (!meta) continue;
    for (const surah of meta.surahs) {
      const full = getSurah(surah)?.ayahCount ?? 1;
      ranges.push({ surah, from: 1, to: full });
    }
  }

  if (sel.range) {
    const a0 = Math.min(sel.range.fromSurah, sel.range.toSurah);
    const a1 = Math.max(sel.range.fromSurah, sel.range.toSurah);
    for (let surah = a0; surah <= a1; surah++) {
      const full = getSurah(surah)?.ayahCount ?? 1;
      ranges.push({ surah, from: 1, to: full });
    }
  }

  return ranges;
}

function ayahCovered(ranges: AyahRange[], surah: number, ayah: number): boolean {
  return ranges.some(
    (r) => r.surah === surah && ayah >= r.from && ayah <= r.to
  );
}

/**
 * Pages where every ayah on the Madani face is declared memorized.
 * Partial faces (e.g. Baqarah 1–100 mid-page) are NOT included.
 */
export function buildMemorizedPageSet(
  sel: MemorizationSelection | null | undefined
): Set<number> {
  const ranges = collectDeclaredRanges(sel);
  const set = new Set<number>();
  if (!ranges.length) return set;

  // Candidate pages = any page touched by a declared ayah
  const candidates = new Set<number>();
  for (const r of ranges) {
    for (let a = r.from; a <= r.to; a++) {
      candidates.add(getExactPageOfAyah(r.surah, a));
    }
  }

  for (const page of candidates) {
    const spans = getExactPageSpans(page);
    if (!spans.length) continue;
    let full = true;
    for (const sp of spans) {
      for (let a = sp.from; a <= sp.to; a++) {
        if (!ayahCovered(ranges, sp.surah, a)) {
          full = false;
          break;
        }
      }
      if (!full) break;
    }
    if (full) set.add(page);
  }

  return set;
}

/**
 * Sorted unique fully-memorized Page_IDs for sequential revision loop.
 */
export function buildMemorizedPageQueue(
  sel: MemorizationSelection | null | undefined
): number[] {
  return [...buildMemorizedPageSet(sel)].sort((a, b) => a - b);
}

/**
 * All pages touched by memory (including partial) — for revision coverage.
 */
export function buildTouchedMemorizedPageQueue(
  sel: MemorizationSelection | null | undefined
): number[] {
  const ranges = collectDeclaredRanges(sel);
  const set = new Set<number>();
  for (const r of ranges) {
    for (let a = r.from; a <= r.to; a++) {
      set.add(getExactPageOfAyah(r.surah, a));
    }
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * First ayah pointer on a Madani page (for NEW_HIFZ landing after skip).
 */
export function firstAyahOnPage(page: number): {
  surah: number;
  ayah: number;
} | null {
  if (page < 1 || page > MADANI_PAGE_COUNT) return null;
  const spans = getExactPageSpans(page);
  if (!spans.length) return null;
  return { surah: spans[0].surah, ayah: spans[0].from };
}

/**
 * Skip forward from (surah, ayah) until landing on a page NOT fully memorized.
 */
export function skipMemorizedToNextHifzPointer(
  start: { surah: number; ayah: number },
  fullyMemorizedPages: Set<number>
): { surah: number; ayah: number; page: number; skippedPages: number[] } {
  let surah = Math.min(114, Math.max(1, start.surah));
  let ayah = Math.max(1, start.ayah);
  const skipped: number[] = [];
  let guard = 0;

  while (guard++ < MADANI_PAGE_COUNT + 5) {
    const page = getExactPageOfAyah(surah, ayah);
    if (!fullyMemorizedPages.has(page)) {
      return { surah, ayah, page, skippedPages: skipped };
    }
    skipped.push(page);
    const nextPage = page >= MADANI_PAGE_COUNT ? 1 : page + 1;
    if (nextPage === 1 && page === MADANI_PAGE_COUNT) {
      return { surah, ayah, page, skippedPages: skipped };
    }
    const land = firstAyahOnPage(nextPage);
    if (!land) {
      const full = getSurah(surah)?.ayahCount ?? 1;
      if (ayah < full) ayah += 1;
      else if (surah < 114) {
        surah += 1;
        ayah = 1;
      } else {
        return { surah: 1, ayah: 1, page: 1, skippedPages: skipped };
      }
      continue;
    }
    surah = land.surah;
    ayah = land.ayah;
  }

  return {
    surah,
    ayah,
    page: getExactPageOfAyah(surah, ayah),
    skippedPages: skipped,
  };
}

export function memorizedSurahList(
  sel: MemorizationSelection | null | undefined
): number[] {
  if (!sel) return [];
  const set = new Set<number>();
  for (const s of sel.surahSelections ?? []) {
    const n = Number(s.surah);
    if (n >= 1 && n <= 114) set.add(n);
  }
  for (const j of sel.juzSelections ?? []) {
    const meta = getJuz(Number(j.juz));
    if (meta) for (const s of meta.surahs) set.add(s);
  }
  if (sel.range) {
    const a = Math.min(sel.range.fromSurah, sel.range.toSurah);
    const b = Math.max(sel.range.fromSurah, sel.range.toSurah);
    for (let s = a; s <= b; s++) if (s >= 1 && s <= 114) set.add(s);
  }
  return [...set].sort((x, y) => x - y);
}
