/**
 * Explicit predicates for Logic Bible scenario rules.
 * Only encode criteria stated in the Bible — no inferred pedagogy.
 */

import type { MemorizationSelection, UserProfile } from "../../models";

/** Retention score 1–2 maps to onboarding "Weak" retention. */
export function isWeakRetention(profile: UserProfile): boolean {
  return profile.memorizationStrength <= 2;
}

/**
 * Primary goal is strengthen-existing / revision-only.
 * Explicit allow-list — must NOT match "complete Quran" or "selected surahs"
 * goals that merely mention تثبّت / حفظ.
 */
export function isStrengthenExistingGoal(profile: UserProfile): boolean {
  // Structured goal id when present (app flags or future profile field)
  const flagGoal = profile.flags?.learningGoalId;
  if (flagGoal === "revision_only" || flagGoal === "retain") return true;
  if (
    flagGoal === "complete_quran" ||
    flagGoal === "selected_surahs" ||
    flagGoal === "expand"
  ) {
    return false;
  }

  const goals = profile.goals ?? [];
  const exactOrStrongNeedles = [
    "strengthen existing memorization",
    "strengthen existing",
    "revision_only",
    "revision only",
    "تثبيت المحفوظ الحالي وعدم النسيان",
    "التركيز على مراجعة المحفوظ وتثبيته",
    "مراجعة فقط",
  ];
  return goals.some((g) => {
    const lower = g.trim().toLowerCase();
    // Exact / full-phrase match preferred
    if (exactOrStrongNeedles.some((n) => lower === n.toLowerCase() || lower.includes(n.toLowerCase()))) {
      // Exclude complete-quran style goals that mention حفظ broadly
      if (lower.includes("إتمام") || lower.includes("كاملا") || lower.includes("مختارة")) {
        return false;
      }
      return true;
    }
    return false;
  });
}

/** User has declared no memorized Quran. */
export function hasNoMemorizedQuran(sel: MemorizationSelection): boolean {
  if (sel.mode === "NONE") return true;
  if (sel.surahSelections?.length) return false;
  if (sel.juzSelections?.length) return false;
  if (sel.range) return false;
  return true;
}

/** All surah numbers present in a selection (mushaf order). */
export function collectMemorizedSurahNumbers(
  sel: MemorizationSelection
): number[] {
  const set = new Set<number>();
  if (sel.range) {
    const a = Math.min(sel.range.fromSurah, sel.range.toSurah);
    const b = Math.max(sel.range.fromSurah, sel.range.toSurah);
    for (let s = a; s <= b; s++) set.add(s);
  }
  for (const s of sel.surahSelections ?? []) set.add(s.surah);
  // Juz expansion is deferred to the engine adapter; rules only see explicit
  // surah lists unless range/surah selections exist. Juz-only selections are
  // treated as non-empty but contiguity is judged after expansion by caller.
  return [...set].sort((a, b) => a - b);
}

/**
 * Consecutive memorization: sorted surah numbers form a single contiguous block
 * [min, min+1, …, max] with no gaps.
 *
 * Fragmented: at least one surah declared, but gaps exist in the set.
 *
 * Empty selection is neither consecutive nor fragmented (beginner).
 */
export function isConsecutiveMemorization(surahs: readonly number[]): boolean {
  if (surahs.length === 0) return false;
  if (surahs.length === 1) return true;
  const min = surahs[0];
  const max = surahs[surahs.length - 1];
  if (max - min + 1 !== surahs.length) return false;
  for (let i = 0; i < surahs.length; i++) {
    if (surahs[i] !== min + i) return false;
  }
  return true;
}

export function isFragmentedMemorization(surahs: readonly number[]): boolean {
  return surahs.length > 0 && !isConsecutiveMemorization(surahs);
}

/** Highest mushaf-order surah in a non-empty list. */
export function lastMemorizedSurah(surahs: readonly number[]): number | null {
  if (surahs.length === 0) return null;
  return surahs[surahs.length - 1];
}

/**
 * Expand juz selections into surah numbers using a provided map.
 * Scenario rules that only have juz ids without expansion treat juz-only
 * as "has memorization" but cannot assert contiguity without the map.
 *
 * For S-003, if only juzSelections exist and no surah/range:
 * - single juz → consecutive
 * - multiple non-adjacent juz → fragmented
 * - multiple adjacent juz (e.g. 29+30) → consecutive if juz numbers form contiguity
 */
export function isJuzSelectionConsecutive(
  juzNumbers: readonly number[]
): boolean {
  if (juzNumbers.length === 0) return false;
  const sorted = [...juzNumbers].sort((a, b) => a - b);
  if (sorted.length === 1) return true;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max - min + 1 !== sorted.length) return false;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== min + i) return false;
  }
  return true;
}

export function hasAnyMemorization(sel: MemorizationSelection): boolean {
  return !hasNoMemorizedQuran(sel);
}
