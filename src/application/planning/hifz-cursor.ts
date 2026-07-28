/**
 * HifzCursor — single source of truth for where NEW_HIFZ begins.
 *
 * Lives in the application layer:
 * - resolve/build from HafizProfile (onboarding / bootstrap)
 * - advance only after a real completed NEW_HIFZ session
 *
 * Core never imports this module; it only reads UserState.hifz.currentPointer.
 */

import type { HafizProfile } from "@/lib/user-profile";
import type { MemorizationSelection as AppMemSel } from "@/lib/quran/types";
import { getJuz } from "@/lib/quran/juz";
import { getSurah } from "@/lib/quran/surahs";
import {
  buildMemorizedPageSet,
  skipMemorizedToNextHifzPointer,
} from "@/lib/quran/memorized-pages";
import { startPrefToProgressionMode } from "@/lib/usage-track";

export type HifzCursorSource =
  | "incomplete_partial"
  | "after_completed_block"
  | "from_start"
  | "bottom_up"
  | "session_progress"
  | "bootstrap_default";

export type HifzCursor = {
  surah: number;
  ayah: number;
  source: HifzCursorSource;
  reason?: string;
};

/** Expand selection → sorted unique surah numbers (includes juz). */
export function collectMemorizedSurahs(
  sel: AppMemSel | HafizProfile["memorizationSelection"] | undefined | null
): number[] {
  if (!sel) return [];
  const set = new Set<number>();

  for (const s of sel.surahSelections ?? []) {
    const n = Number(s.surah);
    if (n >= 1 && n <= 114) set.add(n);
  }

  if (sel.range) {
    const a = Math.min(sel.range.fromSurah, sel.range.toSurah);
    const b = Math.max(sel.range.fromSurah, sel.range.toSurah);
    for (let i = a; i <= b; i++) {
      if (i >= 1 && i <= 114) set.add(i);
    }
  }

  for (const j of sel.juzSelections ?? []) {
    const meta = getJuz(Number(j.juz));
    if (!meta) continue;
    for (const s of meta.surahs) set.add(s);
  }

  return [...set].sort((a, b) => a - b);
}

/**
 * First incomplete partial surah in selection (toAyah < full).
 * NEW_HIFZ continues at toAyah + 1.
 */
export function findIncompletePartial(
  sel: AppMemSel | HafizProfile["memorizationSelection"] | undefined | null
): { surah: number; ayah: number } | null {
  if (!sel?.surahSelections?.length) return null;
  const sorted = [...sel.surahSelections].sort((a, b) => a.surah - b.surah);
  for (const s of sorted) {
    const meta = getSurah(s.surah);
    if (!meta) continue;
    const full = meta.ayahCount;
    const toA = s.toAyah != null ? Math.min(full, s.toAyah) : full;
    if (toA < full) {
      return { surah: s.surah, ayah: toA + 1 };
    }
  }
  return null;
}

/**
 * Resolve NEW_HIFZ start from profile only.
 * Single calculator — Decision/Generator must not recompute this independently.
 */
export function resolveHifzCursor(profile: HafizProfile): HifzCursor {
  const sel = profile.memorizationSelection;
  const incomplete = findIncompletePartial(sel);

  // Spec start preference → progression mode when present
  const mode =
    profile.progressionMode ??
    (profile.hifzStartPreference
      ? startPrefToProgressionMode(profile.hifzStartPreference)
      : "continue_forward");

  const memPages = buildMemorizedPageSet(sel);

  const applySkip = (raw: HifzCursor): HifzCursor => {
    if (memPages.size === 0) return raw;
    const landed = skipMemorizedToNextHifzPointer(
      { surah: raw.surah, ayah: raw.ayah },
      memPages
    );
    if (landed.surah === raw.surah && landed.ayah === raw.ayah) return raw;
    return {
      surah: landed.surah,
      ayah: landed.ayah,
      source: raw.source,
      reason: `${raw.reason ?? ""} → skip memorized pages → ${landed.surah}:${landed.ayah}`,
    };
  };

  // Custom surah start (scattered map)
  if (
    profile.hifzStartPreference === "START_FROM_CUSTOM_SURAH" &&
    profile.customStartSurah &&
    profile.customStartSurah >= 1 &&
    profile.customStartSurah <= 114
  ) {
    return applySkip({
      surah: profile.customStartSurah,
      ayah: 1,
      source: "bootstrap_default",
      reason: `Custom start surah ${profile.customStartSurah}`,
    });
  }

  // Incomplete partial wins (unless user forced from_start / bottom_up)
  if (
    incomplete &&
    mode !== "from_start" &&
    mode !== "bottom_up"
  ) {
    return applySkip({
      surah: incomplete.surah,
      ayah: incomplete.ayah,
      source: "incomplete_partial",
      reason: `Continue unfinished range at ${incomplete.surah}:${incomplete.ayah}`,
    });
  }

  if (mode === "from_start") {
    // Explicit restart: Fatiha first; skip still removes fully memorized faces
    return applySkip({
      surah: 1,
      ayah: 1,
      source: "from_start",
      reason: "from_start / START_FROM_BEGINNING",
    });
  }

  if (mode === "bottom_up") {
    return applySkip({
      surah: 114,
      ayah: 1,
      source: "bottom_up",
      reason: "START_FROM_REVERSE / bottom_up",
    });
  }

  const surahs = collectMemorizedSurahs(sel);
  if (surahs.length === 0) {
    return {
      surah: 114,
      ayah: 1,
      source: "bootstrap_default",
      reason: "No memorization declared — beginner bottom_up default",
    };
  }

  /**
   * Align with Path Resolver / MemorizationMap product rules:
   * Prefer main mushaf journey (1–77). Amma is revision, not NEW_HIFZ park.
   */
  const EARLY_MAX = 77;
  const early = surahs.filter((s) => s <= EARLY_MAX);
  if (early.length > 0) {
    const frontier = Math.max(...early);
    if (frontier < EARLY_MAX) {
      return applySkip({
        surah: frontier + 1,
        ayah: 1,
        source: "after_completed_block",
        reason: `Continue after early frontier surah ${frontier} (not Amma)`,
      });
    }
  }

  // Contiguous block only Amma / end
  if (isConsecutiveSurahBlock(surahs)) {
    const last = surahs[surahs.length - 1];
    if (last >= 114) {
      return applySkip({
        surah: 2,
        ayah: 1,
        source: "after_completed_block",
        reason: "Amma complete — open Baqarah",
      });
    }
    return applySkip({
      surah: last + 1,
      ayah: 1,
      source: "after_completed_block",
      reason: `After contiguous block ending at surah ${last}`,
    });
  }

  // Fragmented without early journey → Baqarah long-term build
  if (early.length === 0) {
    return applySkip({
      surah: 2,
      ayah: 1,
      source: "after_completed_block",
      reason: "Fragmented / Amma-only islands — start Baqarah continuum",
    });
  }

  const gap = firstUnmemorizedSurah(early);
  if (gap != null && gap <= EARLY_MAX) {
    const frontier = Math.max(...early);
    return applySkip({
      surah: Math.min(114, frontier + 1),
      ayah: 1,
      source: "after_completed_block",
      reason: `After frontier ${frontier}`,
    });
  }

  return applySkip({
    surah: 2,
    ayah: 1,
    source: "after_completed_block",
    reason: "Default continuum at Baqarah",
  });
}

/** Sorted unique surahs form one gap-free block [min…max]. */
export function isConsecutiveSurahBlock(surahs: readonly number[]): boolean {
  if (surahs.length === 0) return false;
  if (surahs.length === 1) return true;
  const sorted = [...surahs].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max - min + 1 !== sorted.length) return false;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== min + i) return false;
  }
  return true;
}

/**
 * First surah in mushaf order not present in the memorized set.
 * Returns null only when 1..114 are all present.
 */
export function firstUnmemorizedSurah(surahs: readonly number[]): number | null {
  const set = new Set(surahs);
  for (let s = 1; s <= 114; s++) {
    if (!set.has(s)) return s;
  }
  return null;
}

/**
 * Advance cursor after a real completed NEW_HIFZ range (inclusive toAyah).
 * Case 5: 2:101–110 completed → cursor 2:111
 */
export function advanceHifzCursorAfterSession(input: {
  surah: number;
  /** Inclusive last ayah completed in the session */
  toAyah: number;
  /** Optional: skip pages already in memorization map */
  memorizationSelection?: AppMemSel | HafizProfile["memorizationSelection"] | null;
}): HifzCursor {
  const surah = Math.min(114, Math.max(1, Math.floor(input.surah)));
  const toAyah = Math.max(1, Math.floor(input.toAyah));
  const meta = getSurah(surah);
  const full = meta?.ayahCount ?? toAyah;

  let raw: HifzCursor;
  if (toAyah >= full) {
    if (surah >= 114) {
      raw = {
        surah: 114,
        ayah: full,
        source: "session_progress",
        reason: "Completed Nas — cursor at end",
      };
    } else {
      raw = {
        surah: surah + 1,
        ayah: 1,
        source: "session_progress",
        reason: `Completed surah ${surah} through ${toAyah}`,
      };
    }
  } else {
    raw = {
      surah,
      ayah: toAyah + 1,
      source: "session_progress",
      reason: `Advanced to ${surah}:${toAyah + 1}`,
    };
  }

  const memPages = buildMemorizedPageSet(input.memorizationSelection ?? null);
  if (memPages.size === 0) return raw;
  const landed = skipMemorizedToNextHifzPointer(
    { surah: raw.surah, ayah: raw.ayah },
    memPages
  );
  if (landed.surah === raw.surah && landed.ayah === raw.ayah) return raw;
  return {
    surah: landed.surah,
    ayah: landed.ayah,
    source: "session_progress",
    reason: `${raw.reason} → skip memorized → ${landed.surah}:${landed.ayah}`,
  };
}

/** Map cursor → plain pointer for UserState / AppProgressSource */
export function cursorToPointer(c: HifzCursor): { surah: number; ayah: number } {
  return { surah: c.surah, ayah: c.ayah };
}
