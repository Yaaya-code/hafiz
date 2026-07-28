/**
 * End-to-end learning pipeline tests (profile → decision → plan).
 * Guards production student scenarios — not unit-level rule isolation.
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
import {
  enrichProgressFromProfile,
  buildFarQueueFromMemorizedSurahs,
  resolveBootstrapHifzPointer,
  collectMemorizedSurahsFromProfile,
} from "./bootstrap-from-profile";
import { rankRevisionItems } from "@/core/revision";
import type { RevisionMemoryItem } from "@/core";

function profile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    ...getDefaultProfile(),
    onboardingComplete: true,
    completedAt: "2026-07-26T00:00:00.000Z",
    name: "طالب",
    pagesPerDay: 1,
    revisionPagesPerDay: 3,
    dailyMinutes: 60,
    memorizationStrength: 3,
    learningGoalId: "complete_quran",
    progressionMode: "continue_forward",
    goals: ["إتمام حفظ القرآن كاملاً"],
    ...over,
  };
}

function ammaSurahs(): number[] {
  return Array.from({ length: 37 }, (_, i) => 78 + i);
}

describe("pipeline: existing memorizer continues forward", () => {
  it("Baqarah partial + Juz Amma → Decision allows NEW_HIFZ and plan includes it", () => {
    const p = profile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 100 },
          ...ammaSurahs().map((s) => ({
            surah: s,
            strength: "GOOD" as const,
          })),
        ],
        juzSelections: [{ juz: 30, strength: "GOOD" }],
      },
    });

    const progress = enrichProgressFromProfile(p, { userId: "u1" });
    const ctx = buildPlanningContext({
      profile: { ...p, userId: "u1" },
      progress,
      asOfDate: "2026-07-26",
    });
    const validated = runDecisionPipeline(ctx);

    expect(validated.decision.newHifzEnabled).toBe(true);
    expect(validated.decision.revisionOnly).toBe(false);
    expect(validated.decision.track).not.toBe("fragmented_revision_only");

    const plan = generatePlan(validated, ctx.state, {
      horizonDays: 7,
      startDate: "2026-07-26",
      geometry: createDefaultQuranGeometry(),
      runId: "e2e-baqarah-amma",
    });

    const hifzDays = plan.days.filter((d) =>
      d.items.some((i) => i.type === "NEW_HIFZ")
    );
    expect(hifzDays.length).toBeGreaterThanOrEqual(3);

    // Partial Baqarah continues at ayah 101 — not Fatiha
    const firstHifz = plan.days
      .flatMap((d) => d.items)
      .find((i) => i.type === "NEW_HIFZ");
    expect(firstHifz).toBeTruthy();
    expect(firstHifz!.surah === 1).toBe(false);
    // Incomplete baqarah takes precedence
    expect(resolveBootstrapHifzPointer(p)).toEqual({ surah: 2, ayah: 101 });
  });

  it("partial memorization continues from next ayah", () => {
    const p = profile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "MEDIUM" as never, fromAyah: 1, toAyah: 50 },
        ],
        juzSelections: [],
      },
    });
    // GOOD strength if MEDIUM invalid
    p.memorizationSelection!.surahSelections[0].strength = "GOOD";
    expect(resolveBootstrapHifzPointer(p)).toEqual({ surah: 2, ayah: 51 });
  });
});

describe("pipeline: revision priority prefers weak forgotten over short order", () => {
  it("weak long unit ranks above strong short unit", () => {
    const queue = buildFarQueueFromMemorizedSurahs(
      [1, 2, 112],
      {
        mode: "SURAH",
        surahSelections: [
          { surah: 1, strength: "STRONG" },
          { surah: 2, strength: "WEAK" },
          { surah: 112, strength: "STRONG" },
        ],
        juzSelections: [],
      }
    );
    const baqarah = queue.find((q) => q.slice?.range?.surah === 2)!;
    const fatiha = queue.find((q) => q.slice?.range?.surah === 1)!;
    const ikhlas = queue.find((q) => q.slice?.range?.surah === 112)!;
    expect(baqarah.priority ?? 0).toBeGreaterThan(fatiha.priority ?? 0);
    expect(baqarah.priority ?? 0).toBeGreaterThan(ikhlas.priority ?? 0);
  });

  it("SRS rank prefers weak baqarah over strong short surahs", () => {
    const memory: RevisionMemoryItem[] = [
      {
        id: "fatiha",
        content: {
          surah: 1,
          fromAyah: 1,
          toAyah: 7,
          pagesApprox: 0.25,
          labelAr: "الفاتحة",
        },
        lastReviewedAt: null,
        reviewCount: 0,
        mistakesCount: 0,
        successRate: 0.9,
        strengthScore: 0.85,
        stabilityScore: 0.8,
        nextReviewDate: "2026-07-26",
        intervalDays: 7,
        easeFactor: 2.5,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        isNear: false,
        urgent: false,
        source: "far_corpus",
      },
      {
        id: "baqarah-weak",
        content: {
          surah: 2,
          fromAyah: 1,
          toAyah: 50,
          pagesApprox: 3,
          labelAr: "البقرة",
        },
        lastReviewedAt: null,
        reviewCount: 0,
        mistakesCount: 2,
        successRate: 0.4,
        strengthScore: 0.25,
        stabilityScore: 0.2,
        nextReviewDate: "2026-07-20",
        intervalDays: 1,
        easeFactor: 2.3,
        consecutiveSuccesses: 0,
        consecutiveFailures: 1,
        isNear: false,
        urgent: false,
        source: "far_corpus",
      },
      {
        id: "nas",
        content: {
          surah: 114,
          fromAyah: 1,
          toAyah: 6,
          pagesApprox: 0.2,
          labelAr: "الناس",
        },
        lastReviewedAt: null,
        reviewCount: 0,
        mistakesCount: 0,
        successRate: 0.9,
        strengthScore: 0.8,
        stabilityScore: 0.75,
        nextReviewDate: "2026-07-26",
        intervalDays: 7,
        easeFactor: 2.5,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        isNear: false,
        urgent: false,
        source: "far_corpus",
      },
    ];

    const ranked = rankRevisionItems(memory, {
      asOfDate: "2026-07-26",
      includeNear: false,
      dueOnly: false,
    });
    expect(ranked[0].item.id).toBe("baqarah-weak");
  });
});

describe("pipeline: monthly plan has progression", () => {
  it("30-day plan advances NEW_HIFZ content across days", () => {
    const p = profile({
      progressionMode: "continue_forward",
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [{ surah: 1, strength: "GOOD" }],
        juzSelections: [],
      },
    });
    // After Fatiha only → continue at Baqarah
    expect(resolveBootstrapHifzPointer(p)?.surah).toBe(2);

    const progress = enrichProgressFromProfile(p, { userId: "u2" });
    const ctx = buildPlanningContext({
      profile: { ...p, userId: "u2" },
      progress,
      asOfDate: "2026-07-26",
    });
    const validated = runDecisionPipeline(ctx);
    expect(validated.decision.newHifzEnabled).toBe(true);

    const plan = generatePlan(validated, ctx.state, {
      horizonDays: 30,
      startDate: "2026-07-26",
      geometry: createDefaultQuranGeometry(),
      runId: "e2e-month",
    });

    const hifzLabels = plan.days
      .map((d) => d.items.find((i) => i.type === "NEW_HIFZ"))
      .filter(Boolean)
      .map(
        (h) =>
          `${h!.surah}:${h!.sourceRange?.fromAyah ?? ""}-${h!.sourceRange?.toAyah ?? ""}`
      );

    expect(hifzLabels.length).toBeGreaterThanOrEqual(10);
    const unique = new Set(hifzLabels);
    // Must not repeat the same few chunks for a month
    expect(unique.size).toBeGreaterThanOrEqual(8);
  });
});

describe("pipeline: selection expansion", () => {
  it("collects amma surahs from juz selection", () => {
    const surahs = collectMemorizedSurahsFromProfile({
      mode: "JUZ",
      surahSelections: [],
      juzSelections: [{ juz: 30, strength: "GOOD" }],
    });
    expect(surahs).toContain(78);
    expect(surahs).toContain(114);
  });
});
