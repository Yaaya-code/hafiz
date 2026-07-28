/**
 * Multi-track onboarding product modes (spec: Flexible Onboarding).
 *
 * AUTOMATIC_PLAN  — engine owns daily plan
 * EXTERNAL_TRACKER — sheikh / free tracker, manual wird, no auto schedule
 * FREE_EXPLORER   — no plan; tools only until user creates a plan
 */

import type { HafizProfile } from "@/lib/user-profile";
import { getSurah } from "@/lib/quran/surahs";

export type UsageTrack =
  | "AUTOMATIC_PLAN"
  | "EXTERNAL_TRACKER"
  | "FREE_EXPLORER";

export type ManualWird = NonNullable<HafizProfile["manualWird"]>;

/**
 * Where NEW_HIFZ starts when memorization is scattered (AUTOMATIC_PLAN).
 * Maps to existing progressionMode where possible.
 */
export type HifzStartPreference =
  | "START_FROM_BEGINNING" // from_start / mushaf_start
  | "START_FROM_REVERSE" // bottom_up / mushaf_end
  | "START_FROM_CUSTOM_SURAH" // custom surah
  | "CONTINUE_FORWARD"; // after frontier (default)

export function usageTrackLabelAr(track: UsageTrack): string {
  switch (track) {
    case "AUTOMATIC_PLAN":
      return "خطة تلقائية من حافظ";
    case "EXTERNAL_TRACKER":
      return "متابعة حرة / مع شيخ";
    case "FREE_EXPLORER":
      return "استخدام حر بدون خطة";
  }
}

/** Engine may generate daily NEW_HIFZ + scheduled revision */
export function isAutomaticPlan(track: UsageTrack | undefined | null): boolean {
  return !track || track === "AUTOMATIC_PLAN";
}

/** No automatic plan generation */
export function isPlanEngineDisabled(
  track: UsageTrack | undefined | null,
  hasActivePlan?: boolean
): boolean {
  if (track === "FREE_EXPLORER") return true;
  if (track === "EXTERNAL_TRACKER") return true;
  if (hasActivePlan === false && track !== "AUTOMATIC_PLAN") return true;
  return false;
}

export function startPrefToProgressionMode(
  pref: HifzStartPreference | undefined
): "continue_forward" | "from_start" | "bottom_up" | "complete_nearby" {
  switch (pref) {
    case "START_FROM_BEGINNING":
      return "from_start";
    case "START_FROM_REVERSE":
      return "bottom_up";
    case "CONTINUE_FORWARD":
    case "START_FROM_CUSTOM_SURAH":
    default:
      return "continue_forward";
  }
}

export function progressionModeToStartPref(
  mode: string | undefined
): HifzStartPreference {
  if (mode === "from_start") return "START_FROM_BEGINNING";
  if (mode === "bottom_up") return "START_FROM_REVERSE";
  return "CONTINUE_FORWARD";
}

/** Build a labeled manual wird for EXTERNAL_TRACKER. */
export function buildManualWird(input: {
  surah: number;
  fromAyah: number;
  toAyah: number;
}): ManualWird {
  const surah = Math.max(1, Math.min(114, Math.floor(input.surah) || 1));
  const meta = getSurah(surah);
  const maxAyah = meta?.ayahCount ?? 286;
  const fromAyah = Math.max(1, Math.min(maxAyah, Math.floor(input.fromAyah) || 1));
  const toAyah = Math.max(
    fromAyah,
    Math.min(maxAyah, Math.floor(input.toAyah) || fromAyah)
  );
  const name = meta?.nameAr || `سورة ${surah}`;
  return {
    surah,
    fromAyah,
    toAyah,
    labelAr: `الورد الحالي: ${name} · ${fromAyah}–${toAyah}`,
    updatedAt: new Date().toISOString(),
  };
}

/** Session URL for scoped revision on the manual wird. */
export function manualWirdSessionHref(w: ManualWird): string {
  return `/session/revision?step=manual_wird&mode=revision&surah=${w.surah}&from=${w.fromAyah}&to=${w.toAyah}`;
}

export function manualWirdQuizHref(w: ManualWird): string {
  return `/session/quiz?step=manual_wird_quiz&surah=${w.surah}&from=${w.fromAyah}&to=${w.toAyah}&after=dashboard`;
}

/**
 * Switch FREE_EXPLORER (or any track) → AUTOMATIC_PLAN so the engine owns the schedule.
 * Caller should invalidate plan cache and navigate to plan-reveal / journey.
 */
export function profileWithAutomaticPlan(p: HafizProfile): HafizProfile {
  return {
    ...p,
    usageTrack: "AUTOMATIC_PLAN",
    hasActivePlan: true,
    pagesPerDay: Math.max(1, p.pagesPerDay || 1),
    revisionPagesPerDay: Math.max(1, p.revisionPagesPerDay ?? 3),
    dailyMinutes: Math.max(20, p.dailyMinutes || 45),
    intentUpdatedAt: new Date().toISOString(),
  };
}

/** Ensure EXTERNAL_TRACKER flags are consistent when saving manual wird. */
export function profileWithManualWird(
  p: HafizProfile,
  wird: ManualWird
): HafizProfile {
  return {
    ...p,
    usageTrack: "EXTERNAL_TRACKER",
    hasActivePlan: false,
    manualWird: wird,
    intentUpdatedAt: new Date().toISOString(),
  };
}
