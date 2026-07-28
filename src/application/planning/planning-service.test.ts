/**
 * Application planning orchestration — vertical slice tests.
 * Uses in-memory store (no browser / localStorage).
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { HafizProfile } from "@/lib/user-profile";
import {
  PlanningService,
  MemoryLearningStore,
  resetPlanningService,
  setDefaultLearningStore,
} from "../index";

function testProfile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    version: 2,
    completedAt: "2026-07-23T00:00:00.000Z",
    name: "اختبار",
    pagesPerDay: 1,
    revisionSessionsPerDay: 2,
    dailyMinutes: 40,
    memorizationStrength: 4,
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
    ...over,
  };
}

describe("PlanningService orchestration", () => {
  beforeEach(() => {
    resetPlanningService();
    setDefaultLearningStore(null);
  });

  it("getTodayPlan runs Decision → Plan and persists snapshot", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile(),
    });

    const result = svc.getTodayPlan({ asOfDate: "2026-07-23" });

    expect(result.fromCache).toBe(false);
    expect(result.asOfDate).toBe("2026-07-23");
    expect(result.validation.valid).toBe(true);
    expect(result.appliedRules.length).toBeGreaterThan(0);
    expect(result.plan.days.length).toBe(1);
    expect(result.today).not.toBeNull();
    expect(result.decision).toBeDefined();

    const snap = store.load();
    expect(snap.userState).not.toBeNull();
    expect(snap.planCache["2026-07-23:1"]).toBeDefined();
    expect(snap.lastDecision?.decision).toBeDefined();
  });

  it("second getTodayPlan hits cache", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile(),
    });

    const a = svc.getTodayPlan({ asOfDate: "2026-07-23" });
    const b = svc.getTodayPlan({ asOfDate: "2026-07-23" });

    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(true);
    expect(JSON.stringify(a.plan.days)).toBe(JSON.stringify(b.plan.days));
  });

  it("force refresh recomputes plan", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile(),
    });

    svc.getTodayPlan({ asOfDate: "2026-07-23" });
    const forced = svc.refreshLearningState({ asOfDate: "2026-07-23" });
    expect(forced.today.fromCache).toBe(false);
    expect(forced.snapshot.userState).not.toBeNull();
  });

  it("generateJourneyPlan respects horizon days", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile(),
    });

    const journey = svc.generateJourneyPlan({
      days: 7,
      asOfDate: "2026-07-23",
    });

    expect(journey.horizonDays).toBe(7);
    expect(journey.plan.days.length).toBe(7);
    expect(journey.fromCache).toBe(false);
  });

  it("commitDayProgress invalidates cache and can update memory", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile(),
    });

    svc.getTodayPlan({ asOfDate: "2026-07-23" });
    const before = store.load();
    expect(Object.keys(before.planCache).length).toBeGreaterThan(0);

    // Seed a memory item then apply outcome
    const memId = "test-mem-1";
    store.save({
      ...before,
      revisionMemory: [
        {
          id: memId,
          content: { surah: 1, pagesApprox: 0.5 },
          lastReviewedAt: "2026-07-20",
          reviewCount: 1,
          mistakesCount: 0,
          successRate: 1,
          strengthScore: 0.6,
          stabilityScore: 0.5,
          nextReviewDate: "2026-07-23",
          intervalDays: 3,
          easeFactor: 2.5,
          consecutiveSuccesses: 1,
          consecutiveFailures: 0,
        },
      ],
    });

    const commit = svc.commitDayProgress([
      {
        type: "review_outcome",
        revisionMemoryId: memId,
        outcome: "fail",
        date: "2026-07-23",
      },
    ]);

    expect(commit.replanRecommended).toBe(true);
    expect(Object.keys(commit.snapshot.planCache).length).toBe(0);
    const updated = commit.snapshot.revisionMemory.find((m) => m.id === memId);
    expect(updated?.intervalDays).toBe(1);
    expect(updated?.consecutiveFailures).toBe(1);
  });

  it("beginner profile yields bottom_up track decision", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () =>
        testProfile({
          memorizationSelection: {
            mode: "JUZ",
            juzSelections: [],
            surahSelections: [],
          },
        }),
    });

    const result = svc.getTodayPlan({ asOfDate: "2026-07-23" });
    expect(result.decision.track).toBe("bottom_up");
    expect(result.appliedRules).toContain("S-002");
  });

  it("multi-day journey does not overwrite durable userState from 1-day plan", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile(),
    });

    svc.getTodayPlan({ asOfDate: "2026-07-23" });
    const afterToday = store.load();
    const pointerAfterToday = afterToday.userState?.hifz.currentPointer;
    const memoryLen = afterToday.revisionMemory.length;

    svc.generateJourneyPlan({ days: 30, asOfDate: "2026-07-23" });
    const afterMonth = store.load();

    expect(afterMonth.userState?.hifz.currentPointer).toEqual(
      pointerAfterToday
    );
    expect(afterMonth.revisionMemory.length).toBe(memoryLen);
    expect(afterMonth.planCache["2026-07-23:30"]).toBeDefined();
    expect(afterMonth.planCache["2026-07-23:1"]).toBeDefined();
  });

  it("profile capacity change invalidates fingerprint cache", () => {
    const store = new MemoryLearningStore();
    let pages = 1;
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile({ pagesPerDay: pages }),
    });

    const a = svc.getTodayPlan({ asOfDate: "2026-07-23" });
    expect(a.fromCache).toBe(false);

    const b = svc.getTodayPlan({ asOfDate: "2026-07-23" });
    expect(b.fromCache).toBe(true);

    pages = 3; // capacity change → fingerprint miss
    const c = svc.getTodayPlan({ asOfDate: "2026-07-23" });
    expect(c.fromCache).toBe(false);
    expect(store.load().cacheMeta?.fingerprint).toBeTruthy();
  });

  it("invalidatePlanCache clears cache but keeps memory", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => testProfile(),
    });
    svc.getTodayPlan({ asOfDate: "2026-07-23" });
    const before = store.load();
    expect(Object.keys(before.planCache).length).toBeGreaterThan(0);

    const after = svc.invalidatePlanCache();
    expect(Object.keys(after.planCache).length).toBe(0);
    expect(after.userState).toEqual(before.userState);
    expect(after.revisionMemory).toEqual(before.revisionMemory);
  });
});
