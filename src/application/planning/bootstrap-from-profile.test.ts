import { describe, expect, it } from "vitest";
import {
  collectMemorizedSurahsFromProfile,
  enrichProgressFromProfile,
  resolveBootstrapHifzPointer,
} from "./bootstrap-from-profile";
import type { HafizProfile } from "@/lib/user-profile";
import { getDefaultProfile } from "@/lib/user-profile";

function profile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    ...getDefaultProfile(),
    onboardingComplete: true,
    completedAt: "2026-07-26T00:00:00.000Z",
    ...over,
  };
}

describe("bootstrap-from-profile", () => {
  it("collects surahs from surahSelections", () => {
    const surahs = collectMemorizedSurahsFromProfile({
      mode: "SURAH",
      surahSelections: [
        { surah: 78, strength: "GOOD" },
        { surah: 79, strength: "GOOD" },
        { surah: 80, strength: "WEAK" },
      ],
      juzSelections: [],
    });
    expect(surahs).toEqual([78, 79, 80]);
  });

  it("expands juz 30 into Amma surahs", () => {
    const surahs = collectMemorizedSurahsFromProfile({
      mode: "JUZ",
      surahSelections: [],
      juzSelections: [{ juz: 30, strength: "GOOD" }],
    });
    expect(surahs).toContain(78);
    expect(surahs).toContain(114);
    expect(surahs[0]).toBeGreaterThanOrEqual(78);
  });

  it("continue_forward pointer starts after last memorized surah", () => {
    const p = profile({
      progressionMode: "continue_forward",
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 78, strength: "GOOD" },
          { surah: 79, strength: "GOOD" },
          { surah: 80, strength: "GOOD" },
        ],
        juzSelections: [],
      },
    });
    expect(resolveBootstrapHifzPointer(p)).toEqual({ surah: 81, ayah: 1 });
  });

  it("from_start still starts at Fatiha when user chose restart", () => {
    const p = profile({
      progressionMode: "from_start",
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [{ surah: 2, strength: "GOOD" }],
        juzSelections: [],
      },
    });
    expect(resolveBootstrapHifzPointer(p)).toEqual({ surah: 1, ayah: 1 });
  });

  it("enrich seeds far queue and pointer for existing memorizer", () => {
    const p = profile({
      progressionMode: "continue_forward",
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 1, strength: "GOOD" },
          { surah: 2, strength: "GOOD" },
        ],
        juzSelections: [],
      },
    });
    const enriched = enrichProgressFromProfile(p, {
      userId: "u1",
      farQueue: [],
    });
    expect(enriched.hifzPointer).toEqual({ surah: 3, ayah: 1 });
    // Long surahs are chunked (~20 ayahs) so Baqarah alone is many units
    expect(enriched.farQueue?.length).toBeGreaterThan(2);
    expect(enriched.farQueue?.[0].slice?.range?.surah).toBe(1);
    // Must not default to only Fatiha as NEW_HIFZ start
    expect(enriched.hifzPointer?.surah).not.toBe(1);
  });

  it("empty selection uses beginner bottom_up cursor (114:1) not Fatiha", () => {
    const p = profile({
      progressionMode: "continue_forward",
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [],
        juzSelections: [],
      },
    });
    // HifzCursor always returns a concrete start for beginners
    expect(resolveBootstrapHifzPointer(p)).toEqual({ surah: 114, ayah: 1 });
  });

  it("continues unfinished partial surah before next surah", () => {
    const p = profile({
      progressionMode: "continue_forward",
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 100 },
        ],
        juzSelections: [],
      },
    });
    expect(resolveBootstrapHifzPointer(p)).toEqual({ surah: 2, ayah: 101 });
  });

  it("far queue priority favors weak sections", () => {
    const p = profile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 1, strength: "STRONG" },
          { surah: 112, strength: "WEAK" },
        ],
        juzSelections: [],
      },
    });
    const enriched = enrichProgressFromProfile(p, { userId: "u", farQueue: [] });
    const weak = enriched.farQueue?.find((f) => f.slice?.range?.surah === 112);
    const strong = enriched.farQueue?.find((f) => f.slice?.range?.surah === 1);
    expect(weak && strong).toBeTruthy();
    expect((weak!.priority ?? 0) > (strong!.priority ?? 0)).toBe(true);
  });
});
