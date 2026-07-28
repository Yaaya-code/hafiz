/**
 * Phase 2: SRS init + adaptive load + Actual/Forecast separation
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
import {
  initializeSrsFromProfile,
  countDueOn,
} from "./srs-init";
import { computeLoadAdjustment } from "./load-adjustment";
import { PlanningService } from "./planning-service";
import { MemoryLearningStore } from "../persistence/learning-store";
import { LearningExecutionService } from "../learning/execution-service";
import type { UserState } from "@/core";

function amma(): number[] {
  return Array.from({ length: 37 }, (_, i) => 78 + i);
}

function profile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    ...getDefaultProfile(),
    onboardingComplete: true,
    completedAt: "2026-07-26T00:00:00.000Z",
    name: "طالب",
    pagesPerDay: 1,
    dailyMinutes: 60,
    memorizationStrength: 4,
    learningGoalId: "complete_quran",
    progressionMode: "continue_forward",
    goals: ["إتمام حفظ القرآن كاملاً"],
    memorizationSelection: {
      mode: "SURAH",
      surahSelections: [
        { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 100 },
        ...amma().map((s) => ({ surah: s, strength: "STRONG" as const })),
      ],
      juzSelections: [{ juz: 30, strength: "STRONG" }],
    },
    ...over,
  };
}

function emptyState(pointer = { surah: 2, ayah: 101 }): UserState {
  return {
    userId: "p2",
    streakDays: 0,
    hifz: {
      currentPointer: pointer,
      track: "continue_forward",
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
      strengthScore: 4,
      learningStyle: "LISTEN_AND_READ",
      revisionStyle: "balanced",
      newHifzEnabled: true,
      dailyPageCapacity: 1,
      dailyMinuteCapacity: 60,
    },
    planning: {
      scenarioId: "continue_forward",
      currentHifzPointer: pointer,
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
    updatedAt: "2026-07-26",
  };
}

describe("Phase 2 Case 1: partial + Amma strength 4 — sparse day-0 + NEW_HIFZ", () => {
  it("does not schedule entire Amma corpus on day 1; keeps NEW_HIFZ at 2:101", () => {
    const p = profile();
    const asOf = "2026-07-26";
    const memory = initializeSrsFromProfile(p, asOf);
    expect(memory.length).toBeGreaterThan(30);

    const due = countDueOn(memory, asOf);
    // Strength 4 / STRONG Amma → most first-due far in the future
    expect(due).toBeLessThan(memory.length * 0.35);
    expect(due).toBeLessThan(15);

    const progress = enrichProgressFromProfile(p, { userId: "p2" });
    const ctx = buildPlanningContext({
      profile: { ...p, userId: "p2" },
      progress,
      asOfDate: asOf,
    });
    const validated = runDecisionPipeline(ctx);
    expect(validated.decision.newHifzEnabled).toBe(true);

    const plan = generatePlan(validated, ctx.state, {
      horizonDays: 1,
      startDate: asOf,
      geometry: createDefaultQuranGeometry(),
      revisionMemory: memory,
      loadScale: { revisionScale: 1, hifzScale: 1 },
    });

    const hifz = plan.days[0]?.items.find((i) => i.type === "NEW_HIFZ");
    expect(hifz).toBeTruthy();
    expect(hifz!.surah).toBe(2);
    expect(hifz!.sourceRange?.fromAyah).toBe(101);

    const farToday =
      plan.days[0]?.items.filter((i) => i.type === "FAR_REVISION") ?? [];
    // Not the whole Amma corpus
    expect(farToday.length).toBeLessThan(12);
  });
});

describe("Phase 2 Case 2: consecutive failures decrease load; cursor unchanged", () => {
  it("computeLoadAdjustment decreases after 3 fails; cursor not moved by plan", () => {
    const state = emptyState({ surah: 2, ayah: 101 });
    state.sessions.records = [
      {
        id: "1",
        userId: "p2",
        date: "2026-07-26",
        kind: "new_hifz",
        outcome: "failed",
        createdAt: "2026-07-26T10:00:00.000Z",
      },
      {
        id: "2",
        userId: "p2",
        date: "2026-07-25",
        kind: "near_revision",
        outcome: "failed",
        createdAt: "2026-07-25T10:00:00.000Z",
      },
      {
        id: "3",
        userId: "p2",
        date: "2026-07-24",
        kind: "near_revision",
        outcome: "partial",
        createdAt: "2026-07-24T10:00:00.000Z",
      },
    ];

    const adj = computeLoadAdjustment(state);
    expect(adj.direction).toBe("decrease");
    expect(adj.hifzScale).toBeLessThan(1);
    expect(adj.revisionScale).toBeLessThan(1);

    // Cursor not part of load adjustment
    expect(state.hifz.currentPointer).toEqual({ surah: 2, ayah: 101 });
  });
});

describe("Phase 2 Case 3: strong week increases load", () => {
  it("computeLoadAdjustment increases after consecutive successes", () => {
    const state = emptyState();
    state.sessions.records = Array.from({ length: 6 }, (_, i) => ({
      id: `ok-${i}`,
      userId: "p2",
      date: `2026-07-${String(26 - i).padStart(2, "0")}`,
      kind: "new_hifz" as const,
      outcome: "completed" as const,
      createdAt: `2026-07-${String(26 - i).padStart(2, "0")}T10:00:00.000Z`,
    }));

    const adj = computeLoadAdjustment(state);
    expect(adj.direction).toBe("increase");
    expect(adj.hifzScale).toBeGreaterThan(1);
  });
});

describe("Phase 2 Case 4: open dashboard many times — actual progress fixed", () => {
  it("20 plan opens do not move cursor or invent lastAdvancedDate", () => {
    const store = new MemoryLearningStore();
    store.save({
      version: 1,
      updatedAt: new Date().toISOString(),
      userState: null,
      revisionMemory: [],
      planCache: {},
    });
    const p = profile();
    const planning = new PlanningService({
      store,
      loadProfile: () => p,
    });

    for (let i = 0; i < 20; i++) {
      planning.getTodayPlan({ force: true, asOfDate: "2026-07-26" });
    }

    const snap = planning.getLearningSnapshot();
    expect(snap.userState?.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 101,
    });
    expect(snap.userState?.hifz.lastAdvancedDate).toBeUndefined();
    // SRS bank seeded once (not emptied)
    expect(snap.revisionMemory.length).toBeGreaterThan(10);
    // Not all due today
    expect(countDueOn(snap.revisionMemory, "2026-07-26")).toBeLessThan(
      snap.revisionMemory.length * 0.4
    );
  });
});

describe("Phase 2 Case 5: forecast does not change actual cursor", () => {
  it("multi-day forecast ending pointer is hint only", () => {
    const store = new MemoryLearningStore();
    store.save({
      version: 1,
      updatedAt: new Date().toISOString(),
      userState: emptyState({ surah: 2, ayah: 101 }),
      revisionMemory: initializeSrsFromProfile(profile(), "2026-07-26"),
      planCache: {},
    });

    const p = profile();
    const planning = new PlanningService({
      store,
      loadProfile: () => p,
    });

    // Multi-day journey = forecast
    planning.generateJourneyPlan({
      days: 14,
      force: true,
      asOfDate: "2026-07-26",
    });

    const snap = planning.getLearningSnapshot();
    // Actual cursor unchanged
    expect(snap.userState?.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 101,
    });
    // Forecast may exist as hint
    if (snap.lastForecastHint?.projectedPointer) {
      // Forecast may project ahead — must not equal forced cursor rewrite only
      expect(snap.userState?.hifz.currentPointer).toEqual({
        surah: 2,
        ayah: 101,
      });
    }

    // Real session still advances actual
    const exec = new LearningExecutionService(planning);
    exec.completeSession({
      sessionKind: "new_hifz",
      outcome: "success",
      surahNumber: 2,
      fromAyah: 101,
      toAyah: 110,
      date: "2026-07-26",
      autoReplan: false,
    });
    const after = planning.getLearningSnapshot();
    expect(after.userState?.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 111,
    });
  });
});
