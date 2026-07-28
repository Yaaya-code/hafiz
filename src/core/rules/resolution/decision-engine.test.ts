/**
 * Logic Bible — Rule Resolution & Decision Engine tests
 *
 * Covers:
 * - S-001 + S-004 conflict / composition
 * - S-002 + S-004 combination
 * - S-003 fragmented memorizer
 * - Multiple rules applying together
 */

import { describe, expect, it } from "vitest";
import type {
  PlanningState,
  UserProfile,
  UserState,
} from "../../models";
import {
  createRuleExecutor,
  createRuleRegistry,
  registerLogicBibleScenarioRules,
  RulePipeline,
  buildDecision,
  resolveRuleResults,
  type Decision,
} from "../index";

function emptySelection(): UserProfile["memorizationSelection"] {
  return {
    mode: "NONE",
    surahSelections: [],
    juzSelections: [],
  };
}

function baseProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: "test-user",
    displayName: "Test",
    pagesPerDay: 1,
    dailyMinutes: 45,
    memorizationStrength: 3,
    revisionStyle: "balanced",
    learningStyle: "READING",
    progressionMode: "continue_forward",
    memorizationSelection: emptySelection(),
    goals: [],
    ...over,
  };
}

function basePlanning(): PlanningState {
  return {
    scenarioId: "unknown",
    currentHifzPointer: { surah: 114, ayah: 1 },
    nearStack: [],
    farQueue: [],
    farIndex: 0,
    weekHifzLog: [],
    generatedDayCount: 0,
    hifzEnabled: true,
    dailyPageCapacity: 1,
  };
}

function baseState(userId = "test-user"): UserState {
  return {
    userId,
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
      dailyMinuteCapacity: 45,
    },
    planning: basePlanning(),
    sessions: { records: [], maxRecords: 200 },
    mistakes: { records: [], maxRecords: 200 },
    stateVersion: 1,
    updatedAt: "2026-07-23",
  };
}

function runBible(profile: UserProfile) {
  const registry = createRuleRegistry();
  registerLogicBibleScenarioRules(registry);
  const pipeline = RulePipeline.fromRegistry(registry);
  const executor = createRuleExecutor(registry);
  const output = executor.execute(pipeline, {
    profile,
    state: baseState(profile.userId),
    planning: basePlanning(),
    asOfDate: "2026-07-23",
  });

  const priorityOf = (id: string) =>
    registry.getMetadata(id)?.priority ?? 500;
  const categoryOf = (id: string) => registry.getMetadata(id)?.category;

  const built = buildDecision(output.results, {
    priorityOf,
    categoryOf,
    fallbackDailyMinutes: profile.dailyMinutes,
    fallbackDailyPages: profile.pagesPerDay,
  });

  return { output, built, decision: built.decision as Decision, registry };
}

describe("Decision Engine — S-001 + S-004", () => {
  it("weak retention hard-locks new hifz when pagesPerDay=0; capacity ceiling from S-004/S-001", () => {
    const { decision, built, output } = runBible(
      baseProfile({
        memorizationStrength: 1,
        dailyMinutes: 30,
        pagesPerDay: 0,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [{ surah: 1, strength: "WEAK" }],
          juzSelections: [],
        },
      })
    );

    const appliedIds = output.applied.map((r) => r.ruleId);
    expect(appliedIds).toContain("S-001");
    expect(appliedIds).toContain("S-004");
    // Beginner track must not apply (has memorization)
    expect(appliedIds).not.toContain("S-002");

    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.revisionOnly).toBe(true);
    expect(decision.additionalListeningPractice).toBe(true);
    expect(decision.additionalMistakeReview).toBe(true);
    expect(decision.dailyCapacity.minutes).toBe(30);
    expect(decision.dailyCapacity.pages).toBe(0);
    expect(decision.appliedRules).toContain("S-001");
    expect(decision.appliedRules).toContain("S-004");
    expect(decision.reasons.length).toBeGreaterThan(0);
    // Hard lock path documented in reasons
    expect(
      decision.reasons.some(
        (r) =>
          r.ruleId === "S-001" ||
          r.code.includes("hifz") ||
          r.code === "disableNewMemorization"
      )
    ).toBe(true);
    // Capacity is present and never exceeds profile
    expect(decision.dailyCapacity.minutes).toBeLessThanOrEqual(30);
    // Ranking puts hard safety/capacity early
    expect(built.rankedOrder.length).toBeGreaterThanOrEqual(2);
  });

  it("strengthen-existing goal triggers S-001 lock alongside S-004", () => {
    const { decision, output } = runBible(
      baseProfile({
        memorizationStrength: 4,
        goals: ["Strengthen existing memorization"],
        dailyMinutes: 60,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 78, strength: "GOOD" },
            { surah: 79, strength: "GOOD" },
          ],
          juzSelections: [],
        },
      })
    );

    expect(output.applied.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining(["S-001", "S-003", "S-004"])
    );
    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.revisionOnly).toBe(true);
    expect(decision.dailyCapacity.minutes).toBe(60);
  });
});

describe("Decision Engine — S-002 + S-004 combination", () => {
  it("beginner bottom-up track + capacity ceiling, hifz still allowed", () => {
    const { decision, output } = runBible(
      baseProfile({
        memorizationStrength: 3,
        dailyMinutes: 20,
        memorizationSelection: emptySelection(),
      })
    );

    const applied = output.applied.map((r) => r.ruleId);
    expect(applied).toContain("S-002");
    expect(applied).toContain("S-004");
    expect(applied).not.toContain("S-001");
    expect(applied).not.toContain("S-003");

    expect(decision.track).toBe("bottom_up");
    expect(decision.trackMeta.startSurah).toBe(114);
    expect(decision.trackMeta.endSurah).toBe(78);
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.revisionOnly).toBe(false);
    expect(decision.revisionScheduleEnabled).toBe(false);
    expect(decision.dailyCapacity.minutes).toBe(20);
    expect(decision.appliedRules).toEqual(
      expect.arrayContaining(["S-002", "S-004"])
    );
    expect(
      decision.reasons.some((r) => r.code === "set_track" && r.ruleId === "S-002")
    ).toBe(true);
  });
});

describe("Decision Engine — S-003 fragmented memorizer", () => {
  it("fragmented + continue_forward keeps NEW_HIFZ (user chose continue)", () => {
    const { decision, output } = runBible(
      baseProfile({
        memorizationStrength: 3,
        dailyMinutes: 40,
        progressionMode: "continue_forward",
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 2, strength: "GOOD" },
            { surah: 78, strength: "GOOD" },
            { surah: 114, strength: "WEAK" },
          ],
          juzSelections: [],
        },
      })
    );

    expect(output.applied.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining(["S-003", "S-004"])
    );
    expect(decision.track).toBe("continue_from_last_surah");
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.revisionOnly).toBe(false);
    expect(decision.trackMeta.lastMemorizedSurah).toBe(114);
  });

  it("fragmented Baqarah + Amma still enables NEW_HIFZ", () => {
    const { decision } = runBible(
      baseProfile({
        memorizationStrength: 3,
        dailyMinutes: 60,
        progressionMode: "continue_forward",
        goals: ["إتمام حفظ القرآن كاملاً"],
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 100 },
            ...Array.from({ length: 37 }, (_, i) => ({
              surah: 78 + i,
              strength: "GOOD" as const,
            })),
          ],
          juzSelections: [{ juz: 30, strength: "GOOD" }],
        },
      })
    );

    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.revisionOnly).toBe(false);
    expect(decision.track).not.toBe("fragmented_revision_only");
  });

  it("consecutive memorizer continues from last surah (soft), capacity hard", () => {
    const { decision, output } = runBible(
      baseProfile({
        memorizationStrength: 4,
        dailyMinutes: 50,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 78, strength: "GOOD" },
            { surah: 79, strength: "GOOD" },
            { surah: 80, strength: "GOOD" },
          ],
          juzSelections: [],
        },
      })
    );

    expect(output.applied.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining(["S-003", "S-004"])
    );
    expect(decision.track).toBe("continue_from_last_surah");
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.revisionOnly).toBe(false);
    expect(decision.trackMeta.lastMemorizedSurah).toBe(80);
    expect(decision.dailyCapacity.minutes).toBe(50);
  });
});

describe("Decision Engine — multiple rules together", () => {
  it("S-001 hard lock overrides S-003 soft consecutive enable of new hifz", () => {
    // Weak + pagesPerDay=0 → hard lock wins over S-003 soft enable
    const { decision, built, output } = runBible(
      baseProfile({
        memorizationStrength: 2,
        dailyMinutes: 35,
        pagesPerDay: 0,
        memorizationSelection: {
          mode: "RANGE",
          surahSelections: [],
          juzSelections: [],
          range: {
            fromSurah: 78,
            toSurah: 85,
            strength: "WEAK",
          },
        },
      })
    );

    const applied = output.applied.map((r) => r.ruleId);
    expect(applied).toEqual(
      expect.arrayContaining(["S-001", "S-003", "S-004"])
    );

    // Hard safety wins over progression soft enable
    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.revisionOnly).toBe(true);
    expect(decision.additionalListeningPractice).toBe(true);
    expect(decision.dailyCapacity.minutes).toBe(35);
    expect(decision.dailyCapacity.pages).toBe(0);

    // Explicit resolution trail
    expect(decision.reasons.length).toBeGreaterThan(1);
    expect(decision.appliedRules.length).toBeGreaterThanOrEqual(3);

    // Either S-003 track or conflict notes appear; hifz must stay locked
    const hifzReasons = decision.reasons.filter(
      (r) =>
        r.code.includes("hifz") ||
        r.code === "disableNewMemorization" ||
        r.code === "conflict_new_hifz" ||
        r.code === "set_new_hifz"
    );
    expect(hifzReasons.length).toBeGreaterThan(0);

    // resolveRuleResults convenience matches buildDecision.decision
    const only = resolveRuleResults(output.results, {
      priorityOf: (id) => built.rankedOrder.includes(id) ? 100 : 500,
      fallbackDailyMinutes: 35,
    });
    expect(only.newHifzEnabled).toBe(false);
  });

  it("zero capacity still yields a deterministic decision", () => {
    const { decision } = runBible(
      baseProfile({
        dailyMinutes: 0,
        memorizationSelection: emptySelection(),
      })
    );
    expect(decision.dailyCapacity.minutes).toBe(0);
    expect(decision.track).toBe("bottom_up");
    expect(decision.appliedRules).toContain("S-004");
  });
});
