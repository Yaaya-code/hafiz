/**
 * Product reproduction: Fatiha + Baqarah 1–30 + Juz Amma,
 * 1 page new hifz, 3 pages revision, 45 minutes.
 */
import { describe, expect, it } from "vitest";
import { getDefaultProfile, type HafizProfile } from "@/lib/user-profile";
import { MemoryLearningStore } from "../persistence/learning-store";
import { PlanningService } from "./planning-service";
import { createDefaultQuranGeometry } from "@/core";
import { createNextHifzChunk } from "@/core/planning/quran/chunk-engine";
import { getPageOfAyah } from "@/lib/quran/page-boundaries";

function profile(): HafizProfile {
  return {
    ...getDefaultProfile(),
    onboardingComplete: true,
    completedAt: "2026-07-28T00:00:00.000Z",
    pagesPerDay: 1,
    revisionPagesPerDay: 3,
    dailyMinutes: 45,
    memorizationStrength: 2,
    learningStyle: "LISTEN_AND_READ",
    revisionStyle: "balanced",
    learningGoalId: "complete_quran",
    progressionMode: "continue_forward",
    goals: ["complete_quran"],
    memorizationSelection: {
      mode: "SURAH",
      surahSelections: [
        { surah: 1, strength: "GOOD" },
        { surah: 2, strength: "NEEDS_REVIEW", fromAyah: 1, toAyah: 30 },
      ],
      juzSelections: [{ juz: 30, strength: "GOOD" }],
    },
  };
}

describe("User plan quality: Baqarah 1-30 + Fatiha + Amma", () => {
  it("NEW_HIFZ at Baqarah 31 covers exact Madani page remainder (not arbitrary ayah count)", () => {
    const geo = createDefaultQuranGeometry();
    const page31 = getPageOfAyah(2, 31);
    const chunk = createNextHifzChunk(
      { surahNumber: 2, ayahNumber: 31 },
      { pages: 1, minutes: 12 },
      geo,
      { direction: "forward" }
    );
    expect(chunk).toBeTruthy();
    expect(chunk!.startPointer.surahNumber).toBe(2);
    expect(chunk!.startPointer.ayahNumber).toBe(31);
    // End must stay on the same Madani page as 2:31
    const endPage = getPageOfAyah(2, chunk!.endPointer.ayahNumber);
    expect(endPage).toBe(page31);
    // Next ayah after chunk (if any) is on a later page or end of surah
    const nextAyah = chunk!.endPointer.ayahNumber + 1;
    if (nextAyah <= 286) {
      expect(getPageOfAyah(2, nextAyah)).toBeGreaterThan(page31);
    }
    expect(chunk!.pages).toBeGreaterThanOrEqual(0.75);
  });

  it("week plan: NEW_HIFZ continues Baqarah ~1 page/day; revision starts on Baqarah not Naba", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => profile(),
    });
    const today = svc.getTodayPlan({ force: true, asOfDate: "2026-07-28" });
    const week = svc.generateJourneyPlan({
      days: 7,
      force: true,
      asOfDate: "2026-07-28",
    });

    const day0 = today.today ?? week.plan.days[0];
    expect(day0).toBeTruthy();

    expect(today.decision.newHifzEnabled).toBe(true);
    expect(today.decision.revisionOnly).toBe(false);
    expect((today.decision.dailyCapacity.pages ?? 0) > 0).toBe(true);

    const hifz = day0!.items.find((i) => i.type === "NEW_HIFZ");
    expect(hifz?.surah).toBe(2);
    expect(hifz?.sourceRange?.fromAyah).toBe(31);
    const hifzSpan =
      (hifz?.sourceRange?.toAyah ?? 0) - (hifz?.sourceRange?.fromAyah ?? 0) + 1;
    // Exact Madani: may be few ayahs on a dense page — but must be page-bound
    expect(hifzSpan).toBeGreaterThanOrEqual(1);
    const pFrom = getPageOfAyah(2, hifz!.sourceRange!.fromAyah!);
    const pTo = getPageOfAyah(2, hifz!.sourceRange!.toAyah!);
    expect(pTo - pFrom + 1).toBeLessThanOrEqual(2); // ~1 page capacity

    const rev = day0!.items.filter(
      (i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION"
    );
    expect(rev.length).toBeGreaterThan(0);
    // Mushaf order: Fatiha first when declared, then Baqarah — never Nas-only
    expect([1, 2]).toContain(rev[0]?.surah);
    expect(rev.some((r) => r.surah === 1 || r.surah === 2)).toBe(true);
    expect(rev.every((r) => r.surah === 78)).toBe(false);
    // N=3 revision pages: at least 2–3 distinct Madani faces
    const pages = [
      ...new Set(
        rev.map((r) =>
          getPageOfAyah(r.surah!, r.sourceRange!.fromAyah!)
        )
      ),
    ];
    expect(pages.length).toBeGreaterThanOrEqual(2);

    // Across week: NEW_HIFZ stays on Baqarah (or advances within), not 1-ayah spam
    const hifzDays = week.plan.days
      .map((d) => d.items.find((i) => i.type === "NEW_HIFZ"))
      .filter(Boolean);
    expect(hifzDays.length).toBeGreaterThanOrEqual(5);
    for (const h of hifzDays.slice(0, 5)) {
      expect(h!.surah).toBe(2);
      const from = h!.sourceRange!.fromAyah!;
      const to = h!.sourceRange!.toAyah!;
      expect(to).toBeGreaterThanOrEqual(from);
      // Each day ≈ 1 Madani page of content
      const pageSpan =
        getPageOfAyah(2, to) - getPageOfAyah(2, from) + 1;
      expect(pageSpan).toBeLessThanOrEqual(2);
    }
  });
});
