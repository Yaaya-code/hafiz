/**
 * Learning execution loop tests.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { HafizProfile } from "@/lib/user-profile";
import {
  PlanningService,
  MemoryLearningStore,
  LearningExecutionService,
  resetPlanningService,
  resetLearningExecutionService,
  setDefaultLearningStore,
} from "../index";

function testProfile(): HafizProfile {
  return {
    version: 2,
    completedAt: "2026-07-23T00:00:00.000Z",
    name: "تنفيذ",
    pagesPerDay: 1,
    revisionSessionsPerDay: 2,
    dailyMinutes: 40,
    memorizationStrength: 3,
    revisionStyle: "balanced",
    goals: [],
    onboardingComplete: true,
    preferredQariId: "alafasy",
    learningStyle: "READING",
    progressionMode: "continue_forward",
    memorizationSelection: {
      mode: "JUZ",
      juzSelections: [],
      surahSelections: [],
    },
  };
}

describe("LearningExecutionService", () => {
  beforeEach(() => {
    resetPlanningService();
    resetLearningExecutionService();
    setDefaultLearningStore(null);
  });

  it("completeSession updates memory and replans", () => {
    const store = new MemoryLearningStore();
    const planning = new PlanningService({
      store,
      loadProfile: testProfile,
    });
    planning.getTodayPlan({ asOfDate: "2026-07-23" });

    // Seed revision memory
    const snap = store.load();
    store.save({
      ...snap,
      revisionMemory: [
        {
          id: "mem-1",
          content: { surah: 114, pagesApprox: 0.2, labelAr: "الناس" },
          lastReviewedAt: null,
          reviewCount: 0,
          mistakesCount: 0,
          successRate: 1,
          strengthScore: 0.5,
          stabilityScore: 0.4,
          nextReviewDate: "2026-07-24",
          intervalDays: 1,
          easeFactor: 2.5,
          consecutiveSuccesses: 0,
          consecutiveFailures: 0,
          isNear: true,
        },
      ],
    });

    const exec = new LearningExecutionService(planning);
    const result = exec.completeSession({
      sessionKind: "revision",
      planItemId: "step-rev",
      revisionMemoryId: "mem-1",
      outcome: "fail",
      quality: 1,
      date: "2026-07-23",
      autoReplan: true,
    });

    expect(result.replanRecommended).toBe(true);
    const mem = result.snapshot.revisionMemory.find((m) => m.id === "mem-1");
    expect(mem?.urgent).toBe(true);
    expect(mem?.intervalDays).toBe(1);
    expect(result.today).toBeDefined();
  });

  it("recordReviewOutcome success increases interval", () => {
    const store = new MemoryLearningStore();
    const planning = new PlanningService({
      store,
      loadProfile: testProfile,
    });
    store.save({
      version: 1,
      updatedAt: new Date().toISOString(),
      userState: null,
      planCache: {},
      revisionMemory: [
        {
          id: "m2",
          content: { surah: 2, pagesApprox: 1 },
          lastReviewedAt: "2026-07-20",
          reviewCount: 2,
          mistakesCount: 0,
          successRate: 1,
          strengthScore: 0.7,
          stabilityScore: 0.6,
          nextReviewDate: "2026-07-23",
          intervalDays: 3,
          easeFactor: 2.5,
          consecutiveSuccesses: 1,
          consecutiveFailures: 0,
        },
      ],
    });

    const exec = new LearningExecutionService(planning);
    const result = exec.recordReviewOutcome({
      revisionMemoryId: "m2",
      outcome: "success",
      quality: 5,
      date: "2026-07-23",
      autoReplan: false,
    });

    const mem = result.snapshot.revisionMemory.find((m) => m.id === "m2");
    expect(mem?.intervalDays).toBeGreaterThan(3);
    expect(result.snapshot.planCache).toEqual({});
  });

  it("recordMistake bumps matching memory mistakesCount", () => {
    const store = new MemoryLearningStore();
    const planning = new PlanningService({
      store,
      loadProfile: testProfile,
    });
    store.save({
      version: 1,
      updatedAt: new Date().toISOString(),
      userState: null,
      planCache: { "2026-07-23:1": {} as never },
      revisionMemory: [
        {
          id: "m3",
          content: { surah: 36, pagesApprox: 0.5 },
          lastReviewedAt: "2026-07-20",
          reviewCount: 1,
          mistakesCount: 1,
          successRate: 0.5,
          strengthScore: 0.5,
          stabilityScore: 0.5,
          nextReviewDate: "2026-07-23",
          intervalDays: 2,
          easeFactor: 2.5,
          consecutiveSuccesses: 0,
          consecutiveFailures: 0,
        },
      ],
    });

    const exec = new LearningExecutionService(planning);
    const result = exec.recordMistake({
      surahNumber: 36,
      ayahNumber: 1,
      type: "WRONG_WORD",
      autoReplan: false,
    });

    const mem = result.snapshot.revisionMemory.find((m) => m.id === "m3");
    expect(mem?.mistakesCount).toBe(2);
  });
});
