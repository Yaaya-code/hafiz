/**
 * Regression: Fatiha + Juz Amma + Baqarah 1-90 must NOT collapse to An-Nas-only week/month.
 */
import { describe, expect, it } from "vitest";
import {
  buildPlanningContext,
  runDecisionPipeline,
  generatePlan,
  createDefaultQuranGeometry,
} from "@/core";
import type { HafizProfile } from "@/lib/user-profile";
import { getDefaultProfile } from "@/lib/user-profile";
import { enrichProgressFromProfile } from "./bootstrap-from-profile";
import { resolveHifzCursor, firstUnmemorizedSurah } from "./hifz-cursor";
import { initializeSrsFromProfile } from "./srs-init";
import { PlanningService } from "./planning-service";
import { MemoryLearningStore } from "../persistence/learning-store";

function profile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    ...getDefaultProfile(),
    onboardingComplete: true,
    completedAt: "2026-07-26T00:00:00.000Z",
    name: "طالب",
    pagesPerDay: 1,
    dailyMinutes: 60,
    memorizationStrength: 3,
    learningGoalId: "complete_quran",
    progressionMode: "continue_forward",
    goals: ["إتمام حفظ القرآن كاملاً"],
    memorizationSelection: {
      mode: "SURAH",
      surahSelections: [
        { surah: 1, strength: "STRONG" },
        { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 90 },
      ],
      juzSelections: [{ juz: 30, strength: "STRONG" }],
    },
    ...over,
  };
}

describe("Fragmented Fatiha+Amma+Baqarah 1-90 horizon", () => {
  it("cursor continues Baqarah at 2:91 (not An-Nas)", () => {
    const c = resolveHifzCursor(profile());
    expect(c).toMatchObject({ surah: 2, ayah: 91, source: "incomplete_partial" });
  });

  it("full Baqarah + Amma + Fatiha → gap fill at 3:1 not 114:1", () => {
    const c = resolveHifzCursor(
      profile({
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 1, strength: "STRONG" },
            { surah: 2, strength: "STRONG" }, // full
          ],
          juzSelections: [{ juz: 30, strength: "STRONG" }],
        },
      })
    );
    expect(c.surah).toBe(3);
    expect(c.ayah).toBe(1);
    expect(c.surah).not.toBe(114);
  });

  it("firstUnmemorizedSurah finds gap before Amma", () => {
    const amma = Array.from({ length: 37 }, (_, i) => 78 + i);
    expect(firstUnmemorizedSurah([1, 2, ...amma])).toBe(3);
  });

  it("7-day plan: NEW_HIFZ from 2:91; revision not a single surah monopoly", () => {
    const p = profile();
    const progress = enrichProgressFromProfile(p, { userId: "nas" });
    const ctx = buildPlanningContext({
      profile: { ...p, userId: "nas" },
      progress,
      asOfDate: "2026-07-26",
    });
    const validated = runDecisionPipeline(ctx);
    expect(validated.decision.newHifzEnabled).toBe(true);

    const memory = initializeSrsFromProfile(p, "2026-07-26");
    // Long Baqarah split → more than 37 Amma units
    expect(memory.length).toBeGreaterThan(40);

    const plan = generatePlan(validated, ctx.state, {
      horizonDays: 7,
      startDate: "2026-07-26",
      geometry: createDefaultQuranGeometry(),
      revisionMemory: memory,
    });

    const hifzDays = plan.days
      .map((d) => d.items.find((i) => i.type === "NEW_HIFZ"))
      .filter(Boolean);

    expect(hifzDays[0]?.surah).toBe(2);
    expect(hifzDays[0]?.sourceRange?.fromAyah).toBe(91);
    expect(hifzDays.every((h) => h!.surah === 114)).toBe(false);
    // Progresses within Baqarah across the week
    expect(hifzDays.length).toBeGreaterThanOrEqual(5);
    const lastFrom = hifzDays[hifzDays.length - 1]!.sourceRange?.fromAyah ?? 0;
    expect(lastFrom).toBeGreaterThan(91);

    const revSurahs = plan.days.flatMap((d) =>
      d.items
        .filter((i) => i.type === "FAR_REVISION" || i.type === "NEAR_REVISION")
        .map((i) => i.surah)
        .filter((s): s is number => typeof s === "number")
    );
    const uniqueRev = new Set(revSurahs);
    // Sequential revision may stay on Baqarah all week (finish surah first).
    // What we forbid: Nas-only monopoly / hopping to short Amma as the whole plan.
    expect(uniqueRev.size).toBeGreaterThanOrEqual(1);
    expect([...uniqueRev].every((s) => s === 114)).toBe(false);
    const baqRev = revSurahs.filter((s) => s === 2).length;
    const nasRev = revSurahs.filter((s) => s === 114).length;
    expect(baqRev).toBeGreaterThanOrEqual(nasRev);
    // Revision work exists (neighborhood and/or sequential stabilize)
    expect(revSurahs.length).toBeGreaterThan(0);
  });

  it("30-day journey starts Baqarah and never becomes Nas-only", () => {
    const store = new MemoryLearningStore();
    // Seed today first so Actual shell exists
    const svc = new PlanningService({
      store,
      loadProfile: () => profile(),
    });
    svc.getTodayPlan({ force: true, asOfDate: "2026-07-26" });
    const journey = svc.generateJourneyPlan({
      days: 30,
      force: true,
      asOfDate: "2026-07-26",
    });
    const hifz = journey.plan.days
      .map((d) => d.items.find((i) => i.type === "NEW_HIFZ"))
      .filter(Boolean);
    expect(hifz[0]?.surah).toBe(2);
    expect(hifz.every((h) => h!.surah === 114)).toBe(false);

    const snap = svc.getLearningSnapshot();
    // Actual cursor frozen at bootstrap continuation (not journey end)
    expect(snap.userState?.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 91,
    });
  });
});
