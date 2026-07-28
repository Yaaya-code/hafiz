/**
 * Client-safe Arabic memorization range summaries.
 * Kept outside "use server" modules (server actions may only export async functions).
 */

import type { MemorizationSelection } from "@/lib/quran/types";
import { getSurah } from "@/lib/quran/surahs";

/** Clean Arabic summary — no English leaks like "by surah: 1 surahs" */
export function memSummaryAr(sel: MemorizationSelection): string {
  const surahs = (sel.surahSelections || [])
    .map((s) => s.surah)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);

  if (surahs.length === 0) {
    return "لم يُحدَّد محفوظ بعد — نبدأ معك من الصفر";
  }
  if (surahs.length === 114) {
    return "القرآن كاملاً (١١٤ سورة)";
  }

  const fullJuz = (sel.juzSelections || [])
    .map((j) => j.juz)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);

  if (fullJuz.length > 0 && surahs.length >= 30) {
    const juzPart =
      fullJuz.length === 1
        ? "الجزء " + fullJuz[0]
        : fullJuz.length <= 4
          ? "الأجزاء " + fullJuz.join(" · ")
          : fullJuz.length + " أجزاء كاملة";
    return (
      juzPart +
      " · " +
      surahs.length +
      (surahs.length === 1 ? " سورة" : " سورة")
    );
  }

  if (surahs.length === 1) {
    const name = getSurah(surahs[0])?.nameAr || "سورة";
    return "سورة " + name;
  }
  if (surahs.length <= 6) {
    const names = surahs
      .map((n) => getSurah(n)?.nameAr)
      .filter(Boolean)
      .join(" · ");
    return names + " (" + surahs.length + " سور)";
  }
  return surahs.length + " سورة محفوظة";
}
