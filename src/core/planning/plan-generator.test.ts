/**
 * Plan Generator — multi-day + chunk integration tests.
 */

import { describe, expect, it } from "vitest";
import type { Decision } from "../rules";
import type { UserState } from "../models";
import { generatePlan } from "./plan-generator";
import type { ValidatedDecisionResult } from "../engine/decision-runner";
import { createMetadataQuranGeometry } from "./quran/default-geometry";
import type { QuranGeometry } from "./quran/types";

function baseDecision(over: Partial<Decision> = {}): Decision {
  return {
    track: "unspecified",
    newHifzEnabled: true,
    revisionOnly: false,
    dailyCapacity: { minutes: 40, pages: 1 },
    additionalListeningPractice: false,
    additionalMistakeReview: false,
    revisionScheduleEnabled: true,
    allowNewHifz: true,
    lockProgression: false,
    strengtheningRequired: false,
    strengtheningArea: null,
    suggestedCapacityChange: null,
    revisionPriority: false,
    recommendedRevision: null,
    recoveryRequired: false,
    recoveryScope: null,
    stabilityGatePassed: true,
    appliedRules: ["S-004"],
    reasons: [],
    effects: [],
    conflicts: [],
    warnings: [],
    trackMeta: {},
    ...over,
  };
}

function emptyState(over: Partial<UserState> = {}): UserState {
  return {
    userId: "plan-user",
    streakDays: 0,
    hifz: {
      currentPointer: { surah: 114, ayah: 1 },
      track: "bottom_up",
      paused: false,
      weekHifzLog: [],
    },
    revision: {
      nearStack: [],
      farQueue: [],
      farIndex: 0,
      weekLog: [],
      nearStackMax: 7,
    },
    learning: {
      effectiveStrength: "GOOD",
      strengthScore: 3,
      learningStyle: "READING",
      revisionStyle: "balanced",
      newHifzEnabled: true,
      dailyPageCapacity: 1,
      dailyMinuteCapacity: 40,
    },
    planning: {
      scenarioId: "unknown",
      currentHifzPointer: { surah: 114, ayah: 1 },
      nearStack: [],
      farQueue: [],
      farIndex: 0,
      weekHifzLog: [],
      generatedDayCount: 0,
      hifzEnabled: true,
      dailyPageCapacity: 1,
    },
    sessions: { records: [], maxRecords: 200 },
    mistakes: { records: [], maxRecords: 200 },
    stateVersion: 1,
    updatedAt: "2026-07-23",
    ...over,
  };
}

function asValidated(
  decision: Decision,
  asOfDate = "2026-07-23"
): ValidatedDecisionResult {
  return {
    decision,
    validation: { valid: true, errors: [], warnings: [] },
    conflicts: [],
    rankedOrder: [...decision.appliedRules],
    appliedRules: decision.appliedRules,
    asOfDate,
  };
}

/** Deterministic geometry for multi-day bottom-up tests */
function testGeometry(): QuranGeometry {
  const ayahCounts: Record<number, number> = {};
  for (let s = 1; s <= 114; s++) ayahCounts[s] = s === 2 ? 286 : 7;
  // Short tail surahs
  ayahCounts[114] = 6;
  ayahCounts[113] = 5;
  ayahCounts[112] = 4;
  ayahCounts[111] = 5;
  ayahCounts[110] = 3;
  ayahCounts[109] = 6;
  ayahCounts[108] = 3;
  ayahCounts[107] = 7;
  ayahCounts[106] = 4;
  ayahCounts[105] = 5;
  ayahCounts[104] = 9;
  ayahCounts[103] = 3;
  ayahCounts[102] = 8;
  ayahCounts[101] = 11;
  ayahCounts[100] = 11;
  ayahCounts[99] = 8;
  ayahCounts[98] = 8;
  ayahCounts[97] = 5;
  ayahCounts[96] = 19;
  ayahCounts[78] = 40;

  const pageOf = (s: number, a: number): number => {
    if (s >= 112) return 604;
    if (s >= 109) return 603;
    if (s >= 106) return 602;
    if (s >= 103) return 601;
    if (s >= 100) return 600;
    if (s >= 97) return 598;
    if (s >= 94) return 596;
    if (s >= 90) return 594;
    if (s >= 86) return 591;
    if (s >= 82) return 587;
    if (s >= 78) return 582;
    if (s === 2) return 2 + Math.floor((a - 1) / 10);
    return Math.max(1, Math.min(604, s));
  };

  return {
    firstSurah: 1,
    lastSurah: 114,
    getAyahCount: (s) => ayahCounts[s] ?? 7,
    getPageOfAyah: pageOf,
    getSurahNameAr: (s) => `S${s}`,
  };
}

describe("generatePlan foundation regression", () => {
  it("Empty horizon generates valid empty plan", () => {
    const state = emptyState();
    const plan = generatePlan(asValidated(baseDecision()), state, {
      horizonDays: 0,
    });
    expect(plan.days).toEqual([]);
    expect(plan.meta.horizonDays).toBe(0);
    expect(plan.meta.decisionValid).toBe(true);
  });

  it("Beginner decision generates plan with NEW_HIFZ chunk", () => {
    const state = emptyState();
    const decision = baseDecision({
      track: "bottom_up",
      newHifzEnabled: true,
      revisionOnly: false,
      appliedRules: ["S-002", "S-004"],
      dailyCapacity: { minutes: 30, pages: 1 },
    });
    const plan = generatePlan(asValidated(decision), state, {
      horizonDays: 1,
      startDate: "2026-07-23",
      runId: "beginner",
      geometry: testGeometry(),
    });
    expect(plan.days.length).toBe(1);
    const hifz = plan.days[0].items.find((i) => i.type === "NEW_HIFZ");
    expect(hifz).toBeDefined();
    expect(hifz!.sourceRange).toBeDefined();
    expect(hifz!.sourceRange!.fromSurah ?? hifz!.surah).toBeDefined();
  });
});

describe("multi-day generation", () => {
  it("1. 7-day beginner plan creates different hifz chunks", () => {
    const state = emptyState({
      hifz: {
        currentPointer: { surah: 114, ayah: 1 },
        track: "bottom_up",
        paused: false,
        weekHifzLog: [],
      },
    });
    const decision = baseDecision({
      track: "bottom_up",
      newHifzEnabled: true,
      revisionOnly: false,
      dailyCapacity: { minutes: 40, pages: 1 },
    });

    const plan = generatePlan(asValidated(decision), state, {
      horizonDays: 7,
      startDate: "2026-07-23",
      runId: "week",
      geometry: testGeometry(),
    });

    expect(plan.days.length).toBe(7);
    const hifzItems = plan.days
      .map((d) => d.items.find((i) => i.type === "NEW_HIFZ"))
      .filter(Boolean);

    expect(hifzItems.length).toBeGreaterThanOrEqual(3);

    // Chunk signatures must not all be identical (no repeated same range)
    const signatures = hifzItems.map(
      (h) =>
        `${h!.sourceRange?.fromSurah ?? h!.surah}:${h!.sourceRange?.toSurah ?? h!.surah}:${h!.sourceRange?.fromAyah ?? ""}:${h!.sourceRange?.toAyah ?? ""}`
    );
    const unique = new Set(signatures);
    expect(unique.size).toBeGreaterThan(1);

    // Day 2+ should include neighborhood revision of prior hifz (internal near tier)
    // or stabilize revision — both appear as revision items
    const day2Rev = plan.days[1].items.filter(
      (i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION"
    );
    expect(day2Rev.length).toBeGreaterThan(0);
    // If NEW_HIFZ ran day1, neighborhood should expand (not empty revision)
    const hasNear = day2Rev.some((i) => i.type === "NEAR_REVISION");
    const hasFar = day2Rev.some((i) => i.type === "FAR_REVISION");
    expect(hasNear || hasFar).toBe(true);
  });

  it("2. Pointer advances between days", () => {
    const state = emptyState({
      hifz: {
        currentPointer: { surah: 114, ayah: 1 },
        track: "bottom_up",
        paused: false,
        weekHifzLog: [],
      },
    });
    const decision = baseDecision({
      track: "bottom_up",
      newHifzEnabled: true,
      dailyCapacity: { minutes: 40, pages: 1 },
    });

    const plan = generatePlan(asValidated(decision), state, {
      horizonDays: 5,
      geometry: testGeometry(),
      startDate: "2026-07-23",
    });

    expect(plan.startingState.hifz.currentPointer).toEqual({
      surah: 114,
      ayah: 1,
    });
    // Ending pointer must have moved (bottom-up → lower surah numbers)
    expect(plan.endingState.hifz.currentPointer.surah).toBeLessThan(114);
    expect(plan.endingState.planning.currentHifzPointer.surah).toBe(
      plan.endingState.hifz.currentPointer.surah
    );
    expect(plan.endingState.planning.generatedDayCount).toBe(5);
  });

  it("3. Revision-only decision creates no NEW_HIFZ", () => {
    const state = emptyState({
      revision: {
        nearStack: [
          {
            id: "n1",
            slice: {
              labelAr: "سابق",
              pagesApprox: 0.5,
              range: { surah: 78, fromAyah: 1, toAyah: 10 },
            },
            priority: 1,
            timesServed: 0,
            source: "near_carry",
          },
        ],
        farQueue: [
          {
            id: "f1",
            slice: {
              labelAr: "بعيد",
              pagesApprox: 1,
              range: { surah: 67, fromAyah: 1, toAyah: 20 },
            },
            priority: 1,
            timesServed: 0,
            source: "memorized_corpus",
          },
        ],
        farIndex: 0,
        weekLog: [],
        nearStackMax: 7,
      },
    });
    const decision = baseDecision({
      track: "fragmented_revision_only",
      newHifzEnabled: false,
      revisionOnly: true,
      allowNewHifz: false,
      dailyCapacity: { minutes: 40, pages: 0 },
    });

    const plan = generatePlan(asValidated(decision), state, {
      horizonDays: 3,
      startDate: "2026-07-23",
      geometry: testGeometry(),
    });

    expect(plan.days.length).toBe(3);
    for (const day of plan.days) {
      expect(day.items.every((i) => i.type !== "NEW_HIFZ")).toBe(true);
    }
    // Uses far queue
    expect(
      plan.days.some((d) => d.items.some((i) => i.type === "FAR_REVISION"))
    ).toBe(true);
    expect(plan.meta.revisionOnly).toBe(true);
  });

  it("4. Same input produces deterministic plan", () => {
    const state = emptyState();
    const decision = baseDecision({
      track: "bottom_up",
      dailyCapacity: { minutes: 40, pages: 1 },
    });
    const opts = {
      horizonDays: 5,
      startDate: "2026-07-23" as const,
      runId: "det",
      geometry: testGeometry(),
    };
    const a = generatePlan(asValidated(decision), state, opts);
    const b = generatePlan(asValidated(decision), state, opts);
    expect(JSON.stringify(a.days)).toBe(JSON.stringify(b.days));
    expect(a.endingState.hifz.currentPointer).toEqual(
      b.endingState.hifz.currentPointer
    );
  });

  it("5. Input state remains unchanged", () => {
    const state = emptyState({
      hifz: {
        currentPointer: { surah: 114, ayah: 1 },
        track: "bottom_up",
        paused: false,
        weekHifzLog: [],
      },
      streakDays: 4,
    });
    const before = JSON.stringify(state);

    const plan = generatePlan(
      asValidated(
        baseDecision({
          track: "bottom_up",
          dailyCapacity: { minutes: 40, pages: 1 },
        })
      ),
      state,
      { horizonDays: 7, geometry: testGeometry(), startDate: "2026-07-23" }
    );

    expect(JSON.stringify(state)).toBe(before);
    expect(state.hifz.currentPointer).toEqual({ surah: 114, ayah: 1 });
    expect(plan.startingState).not.toBe(state);
    expect(plan.endingState).not.toBe(state);
    expect(plan.endingState.hifz.currentPointer.surah).not.toBe(114);

    plan.endingState.hifz.currentPointer.surah = 1;
    expect(state.hifz.currentPointer.surah).toBe(114);
  });

  it("existing memorizer does not start NEW_HIFZ at Al-Fatiha", () => {
    // Application HifzCursor already resolved after last full surah (80) → 81:1
    // Generator must not relocate via continueAfterSurah metadata
    const state = emptyState({
      hifz: {
        currentPointer: { surah: 81, ayah: 1 },
        track: "continue_forward",
        paused: false,
        weekHifzLog: [],
      },
      planning: {
        scenarioId: "continue_forward",
        currentHifzPointer: { surah: 81, ayah: 1 },
        nearStack: [],
        farQueue: [],
        farIndex: 0,
        weekHifzLog: [],
        generatedDayCount: 0,
        hifzEnabled: true,
        dailyPageCapacity: 1,
      },
    });
    const decision = baseDecision({
      track: "continue_from_last_surah",
      newHifzEnabled: true,
      appliedRules: ["S-003", "S-004"],
      dailyCapacity: { minutes: 45, pages: 1 },
      trackMeta: {
        lastMemorizedSurah: 80,
        continueAfterSurah: 80, // observability only
        continuationMode: "from_cursor",
      },
    });

    const plan = generatePlan(asValidated(decision), state, {
      horizonDays: 5,
      geometry: testGeometry(),
      startDate: "2026-07-23",
    });

    const hifzDays = plan.days
      .map((d) => d.items.find((i) => i.type === "NEW_HIFZ"))
      .filter(Boolean);
    expect(hifzDays.length).toBeGreaterThan(0);
    for (const h of hifzDays) {
      expect(h!.surah === 1 || h!.labelAr?.includes("الفاتحة")).toBe(false);
      expect((h!.surah ?? 0) >= 81 || (h!.sourceRange?.surah ?? 0) >= 81).toBe(
        true
      );
    }
  });

  it("6. Horizon days respected", () => {
    const state = emptyState();
    const decision = baseDecision({ track: "bottom_up" });
    const g = testGeometry();

    expect(
      generatePlan(asValidated(decision), state, {
        horizonDays: 0,
        geometry: g,
      }).days.length
    ).toBe(0);

    expect(
      generatePlan(asValidated(decision), state, {
        horizonDays: 1,
        geometry: g,
      }).days.length
    ).toBe(1);

    expect(
      generatePlan(asValidated(decision), state, {
        horizonDays: 7,
        geometry: g,
      }).days.length
    ).toBe(7);

    expect(
      generatePlan(asValidated(decision), state, {
        horizonDays: 14,
        geometry: g,
      }).days.length
    ).toBe(14);

    const p7 = generatePlan(asValidated(decision), state, {
      horizonDays: 7,
      startDate: "2026-07-01",
      geometry: g,
    });
    expect(p7.days[0].date).toBe("2026-07-01");
    expect(p7.days[6].date).toBe("2026-07-07");
    expect(p7.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("forward long-surah multi-day", () => {
  it("continues through Baqarah without repeating the same ayah window", () => {
    const state = emptyState({
      hifz: {
        currentPointer: { surah: 2, ayah: 1 },
        track: "continue_forward",
        paused: false,
        weekHifzLog: [],
      },
      planning: {
        ...emptyState().planning,
        currentHifzPointer: { surah: 2, ayah: 1 },
      },
    });
    const plan = generatePlan(
      asValidated(
        baseDecision({
          track: "continue_from_last_surah",
          dailyCapacity: { minutes: 40, pages: 1 },
        })
      ),
      state,
      {
        horizonDays: 3,
        geometry: createMetadataQuranGeometry(),
        startDate: "2026-07-23",
      }
    );

    const windows = plan.days.map((d) => {
      const h = d.items.find((i) => i.type === "NEW_HIFZ");
      return `${h?.sourceRange?.fromAyah}-${h?.sourceRange?.toAyah}`;
    });
    expect(new Set(windows).size).toBe(3);
  });
});
