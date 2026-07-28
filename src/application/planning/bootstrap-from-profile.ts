/**
 * Bootstrap planning inputs from onboarding memorization selection.
 * Prevents default Fatiha / empty-queue when the user declared a real corpus.
 *
 * NEW_HIFZ position comes only from resolveHifzCursor (hifz-cursor.ts).
 */

import type { HafizProfile } from "@/lib/user-profile";
import type {
  MemorizationSelection as AppMemSel,
  MemorizationStrength,
  MemorizedSurahSelection,
} from "@/lib/quran/types";
import { getJuz } from "@/lib/quran/juz";
import { getSurah } from "@/lib/quran/surahs";
import type {
  AppProgressSource,
  AppRevisionQueueItem,
} from "@/core/adapters/types";
import {
  collectMemorizedSurahs,
  findIncompletePartial,
  resolveHifzCursor,
  cursorToPointer,
} from "./hifz-cursor";

/** Map onboarding strength labels → SRS strengthScore (0–1). */
export function strengthToScore(strength: MemorizationStrength | string): number {
  switch (String(strength).toUpperCase()) {
    case "STRONG":
      return 0.85;
    case "GOOD":
      return 0.65;
    case "NEEDS_REVIEW":
      return 0.4;
    case "WEAK":
      return 0.25;
    default:
      return 0.55;
  }
}

/** @deprecated use collectMemorizedSurahs from hifz-cursor — kept as alias */
export function collectMemorizedSurahsFromProfile(
  sel: AppMemSel | HafizProfile["memorizationSelection"] | undefined | null
): number[] {
  return collectMemorizedSurahs(sel);
}

export function hasDeclaredMemorization(
  sel: AppMemSel | HafizProfile["memorizationSelection"] | undefined | null
): boolean {
  return collectMemorizedSurahs(sel).length > 0;
}

/** @deprecated use findIncompletePartial from hifz-cursor */
export function findIncompleteMemorizationPointer(
  sel: AppMemSel | HafizProfile["memorizationSelection"] | undefined | null
): { surah: number; ayah: number } | null {
  return findIncompletePartial(sel);
}

/**
 * Where NEW_HIFZ should start — delegates to resolveHifzCursor (single source).
 */
export function resolveBootstrapHifzPointer(
  profile: HafizProfile
): { surah: number; ayah: number } | undefined {
  const c = resolveHifzCursor(profile);
  // Beginner with empty selection still returns bottom_up default cursor
  return cursorToPointer(c);
}

function strengthOfSurah(
  sel: AppMemSel | undefined | null,
  surah: number
): MemorizationStrength {
  const hit = sel?.surahSelections?.find((s) => s.surah === surah);
  if (hit?.strength) return hit.strength;
  const juz = sel?.juzSelections?.find((j) => {
    const meta = getJuz(j.juz);
    return meta?.surahs.includes(surah);
  });
  if (juz?.strength) return juz.strength;
  return "GOOD";
}

function rangeForSurah(
  sel: AppMemSel | undefined | null,
  surah: number
): { fromAyah: number; toAyah: number } {
  const meta = getSurah(surah);
  const full = meta?.ayahCount ?? 7;
  const hit = sel?.surahSelections?.find((s) => s.surah === surah) as
    | MemorizedSurahSelection
    | undefined;
  return {
    fromAyah: hit?.fromAyah && hit.fromAyah > 0 ? hit.fromAyah : 1,
    toAyah: hit?.toAyah && hit.toAyah > 0 ? Math.min(full, hit.toAyah) : full,
  };
}

/** Max ayahs per far-queue seed unit (prevents Baqarah-size monopoly). */
const FAR_SEED_AYAH_CHUNK = 20;

/**
 * Far-queue seeds for declared memorized surahs (SRS corpus).
 * Priority = forgetting risk from strength + volume importance.
 * NEVER rank by surah order or short length alone (that favored Fatiha/Nas).
 * Long ranges are split into ~20-ayah units so weekly horizons stay diverse.
 */
export function buildFarQueueFromMemorizedSurahs(
  surahs: number[],
  sel?: AppMemSel | null
): AppRevisionQueueItem[] {
  const out: AppRevisionQueueItem[] = [];
  for (const surah of surahs) {
    const meta = getSurah(surah);
    const strength = strengthOfSurah(sel, surah);
    const score = strengthToScore(strength);
    const range = rangeForSurah(sel, surah);
    const from = range.fromAyah;
    const to = range.toAyah;
    let chunkFrom = from;
    let part = 0;
    while (chunkFrom <= to) {
      const chunkTo = Math.min(to, chunkFrom + FAR_SEED_AYAH_CHUNK - 1);
      const ayahSpan = Math.max(1, chunkTo - chunkFrom + 1);
      const pagesApprox = Math.max(0.25, ayahSpan / 15);
      const priority =
        Math.round((1 - score) * 200) +
        Math.round(Math.min(40, pagesApprox * 12));
      const multi = from !== to && (chunkFrom !== from || chunkTo !== to);
      out.push({
        id: multi
          ? `mem_seed_s${surah}_${chunkFrom}_${chunkTo}`
          : `mem_seed_s${surah}`,
        priority,
        timesServed: 0,
        source: "memorized_corpus" as const,
        slice: {
          labelAr: meta?.nameAr
            ? multi
              ? `سورة ${meta.nameAr} ${chunkFrom}–${chunkTo}`
              : `سورة ${meta.nameAr}`
            : `سورة ${surah}`,
          pagesApprox,
          range: {
            surah,
            fromAyah: chunkFrom,
            toAyah: chunkTo,
          },
          startPage: meta?.startPage,
          endPage: meta?.endPage,
        },
      });
      part++;
      chunkFrom = chunkTo + 1;
      // Safety: avoid infinite loop
      if (part > 200) break;
    }
  }
  return out;
}

/**
 * Enrich AppProgressSource with selection-aware pointer + far queue.
 * Does not invent activity scores — only structural planning inputs.
 */
export function enrichProgressFromProfile(
  profile: HafizProfile,
  base: AppProgressSource
): AppProgressSource {
  const sel = profile.memorizationSelection;
  const surahs = collectMemorizedSurahs(sel);
  const cursor = resolveHifzCursor(profile);
  const pointer = cursorToPointer(cursor);

  const farQueue =
    base.farQueue && base.farQueue.length > 0
      ? base.farQueue
      : surahs.length > 0
        ? buildFarQueueFromMemorizedSurahs(surahs, sel)
        : base.farQueue;

  // Real progress = sessions or lastAdvancedDate from a completed session only
  // (weekHifzLog alone may be forecast residue — prefer sessions)
  const hasRealSessionProgress = Boolean(
    base.lastAdvancedDate ||
      (base.sessions && base.sessions.length > 0)
  );

  const track =
    base.hifzTrack ??
    (profile.progressionMode === "from_start"
      ? "from_start"
      : profile.progressionMode === "bottom_up"
        ? "bottom_up"
        : surahs.length === 0
          ? "bottom_up"
          : "continue_forward");

  return {
    ...base,
    farQueue,
    hifzPointer:
      hasRealSessionProgress && base.hifzPointer
        ? base.hifzPointer
        : pointer,
    hifzTrack: track,
    dailyPageCapacity: profile.pagesPerDay,
    dailyMinuteCapacity: profile.dailyMinutes,
  };
}
