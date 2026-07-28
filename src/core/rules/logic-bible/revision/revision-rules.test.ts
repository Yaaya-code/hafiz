/**
 * Logic Bible — Revision Structure Rules R-001…R-004 tests
 *
 * - Strong stable memorizer → normal revision
 * - Weak memorizer → revision priority
 * - Forgotten content → recovery lock
 * - Stable user → progression remains allowed
 * - Revision + progression conflict resolution
 * - Full pipeline integration
 */

import { describe, expect, it } from "vitest";
import type {
  MistakeRecord,
  PlanningState,
  SessionRecord,
  UserProfile,
  UserState,
} from "../../../models";
import {
  buildDecision,
  createRuleExecutor,
  createRuleRegistry,
  registerLogicBibleProgressionRules,
  registerLogicBibleRevisionRules,
  registerLogicBibleRules,
  RulePipeline,
  R001_ID,
  R002_ID,
  R003_ID,
  R004_ID,
  P001_ID,
  P002_ID,
} from "../../index";

const AS_OF = "2026-07-23";

function emptySelection(): UserProfile["memorizationSelection"] {
  return { mode: "NONE", surahSelections: [], juzSelections: [] };
}

function baseProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: "rev-user",
    displayName: "Rev",
    pagesPerDay: 1,
    dailyMinutes: 40,
    memorizationStrength: 4,
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

function baseState(over: Partial<UserState> = {}): UserState {
  const base: UserState = {
    userId: "rev-user",
    streakDays: 5,
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
      strengthScore: 4,
      learningStyle: "READING",
      revisionStyle: "balanced",
      newHifzEnabled: true,
      dailyPageCapacity: 1,
      dailyMinuteCapacity: 40,
    },
    planning: basePlanning(),
    sessions: { records: [], maxRecords: 200 },
    mistakes: { records: [], maxRecords: 200 },
    stateVersion: 1,
    updatedAt: AS_OF,
  };
  return { ...base, ...over, learning: { ...base.learning, ...over.learning } };
}

function completedSessions(n: number): SessionRecord[] {
  const out: SessionRecord[] = [];
  for (let i = 0; i < n; i++) {
    const day = String(18 + i).padStart(2, "0");
    out.push({
      id: `s-${i}`,
      userId: "rev-user",
      date: `2026-07-${day}`,
      kind: i % 2 === 0 ? "near_revision" : "new_hifz",
      outcome: "completed",
      createdAt: `2026-07-${day}T10:00:00.000Z`,
    });
  }
  return out;
}

function mistake(
  partial: Partial<MistakeRecord> & Pick<MistakeRecord, "surah">
): MistakeRecord {
  return {
    id: partial.id ?? `m-${partial.surah}`,
    userId: partial.userId ?? "rev-user",
    category: partial.category ?? "WORD",
    frequency: partial.frequency ?? 1,
    lastOccurredAt: partial.lastOccurredAt ?? "2026-07-22",
    ...partial,
    surah: partial.surah,
  };
}

function runRevision(profile: UserProfile, state: UserState) {
  const registry = createRuleRegistry();
  registerLogicBibleRevisionRules(registry);
  const pipeline = RulePipeline.fromRegistry(registry);
  const executor = createRuleExecutor(registry);
  const output = executor.execute(pipeline, {
    profile,
    state,
    planning: basePlanning(),
    asOfDate: AS_OF,
  });
  const built = buildDecision(output.results, {
    priorityOf: (id) => registry.getMetadata(id)?.priority ?? 500,
    categoryOf: (id) => registry.getMetadata(id)?.category,
    fallbackDailyMinutes: profile.dailyMinutes,
  });
  return { output, built, decision: built.decision };
}

function runProgressionAndRevision(profile: UserProfile, state: UserState) {
  const registry = createRuleRegistry();
  registerLogicBibleProgressionRules(registry);
  registerLogicBibleRevisionRules(registry);
  const pipeline = RulePipeline.fromRegistry(registry);
  const executor = createRuleExecutor(registry);
  const output = executor.execute(pipeline, {
    profile,
    state,
    planning: basePlanning(),
    asOfDate: AS_OF,
  });
  const built = buildDecision(output.results, {
    priorityOf: (id) => registry.getMetadata(id)?.priority ?? 500,
    categoryOf: (id) => registry.getMetadata(id)?.category,
    fallbackDailyMinutes: profile.dailyMinutes,
  });
  return { output, built, decision: built.decision };
}

function runFull(profile: UserProfile, state: UserState) {
  const registry = createRuleRegistry();
  registerLogicBibleRules(registry);
  const pipeline = RulePipeline.fromRegistry(registry);
  const executor = createRuleExecutor(registry);
  const output = executor.execute(pipeline, {
    profile,
    state,
    planning: basePlanning(),
    asOfDate: AS_OF,
  });
  const built = buildDecision(output.results, {
    priorityOf: (id) => registry.getMetadata(id)?.priority ?? 500,
    categoryOf: (id) => registry.getMetadata(id)?.category,
    fallbackDailyMinutes: profile.dailyMinutes,
  });
  return { output, built, decision: built.decision };
}

describe("R-001/R-002 — strong stable memorizer → normal revision", () => {
  it("does not force exclusive revision priority; publishes a load", () => {
    const profile = baseProfile({
      memorizationStrength: 5,
      dailyMinutes: 40,
      pagesPerDay: 1,
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 78, strength: "STRONG" },
          { surah: 79, strength: "STRONG" },
          { surah: 80, strength: "GOOD" },
        ],
        juzSelections: [],
      },
    });
    const state = baseState({
      learning: {
        ...baseState().learning,
        strengthScore: 5,
        effectiveStrength: "STRONG",
      },
      sessions: { records: completedSessions(4), maxRecords: 200 },
      mistakes: { records: [], maxRecords: 200 },
      revision: {
        nearStack: [
          {
            id: "n1",
            slice: { labelAr: "ok", pagesApprox: 0.25 },
            priority: 1,
            timesServed: 1,
            source: "near_carry",
          },
        ],
        farQueue: [],
        farIndex: 0,
        weekLog: [],
        nearStackMax: 7,
      },
    });

    const { decision, output } = runRevision(profile, state);
    const r001 = output.results.find((r) => r.ruleId === R001_ID);
    const r002 = output.results.find((r) => r.ruleId === R002_ID);
    const r004 = output.results.find((r) => r.ruleId === R004_ID);

    expect(r001?.applied).toBe(true);
    expect(r001?.meta?.revisionPriority).toBe(false);
    expect(r001?.meta?.revisionPriorityLevel).toBe("normal");
    expect(r002?.applied).toBe(true);
    expect(typeof r002?.meta?.recommendedRevisionPages).toBe("number");
    expect(typeof r002?.meta?.recommendedRevisionMinutes).toBe("number");
    expect(
      (r002?.meta?.recommendedRevisionMinutes as number) <= 40
    ).toBe(true);
    expect(r004?.meta?.stabilityGatePassed).toBe(true);

    expect(decision.revisionPriority).toBe(false);
    expect(decision.stabilityGatePassed).toBe(true);
    expect(decision.recoveryRequired).toBe(false);
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.recommendedRevision).not.toBeNull();
    expect(decision.recommendedRevision!.minutes).toBeLessThanOrEqual(40);
  });
});

describe("R-001 — weak memorizer → revision priority", () => {
  it("elevates revision priority and soft-restricts critical path", () => {
    const profile = baseProfile({
      memorizationStrength: 2,
      pagesPerDay: 0,
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 1, strength: "WEAK" },
          { surah: 2, strength: "NEEDS_REVIEW" },
        ],
        juzSelections: [],
      },
    });
    const state = baseState({
      learning: {
        ...baseState().learning,
        strengthScore: 2,
        effectiveStrength: "WEAK",
      },
    });

    const { decision, output } = runRevision(profile, state);
    const r001 = output.results.find((r) => r.ruleId === R001_ID);
    expect(r001?.meta?.revisionPriority).toBe(true);
    expect(r001?.meta?.revisionPriorityLevel).toBe("critical");
    expect(decision.revisionPriority).toBe(true);
    // With pages=0, R-001 meta may mark revisionOnly; full hard lock needs S-001
    expect(r001?.meta?.revisionPriority).toBe(true);
  });
});

describe("R-003 — forgotten content → recovery lock", () => {
  it("hard recovery lock on weak corpus + elevated mistakes", () => {
    const profile = baseProfile({
      memorizationStrength: 3,
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "WEAK" },
          { surah: 3, strength: "NEEDS_REVIEW" },
          { surah: 4, strength: "WEAK" },
        ],
        juzSelections: [],
      },
    });
    const state = baseState({
      learning: {
        ...baseState().learning,
        strengthScore: 3,
        effectiveStrength: "NEEDS_REVIEW",
      },
      mistakes: {
        records: [
          mistake({ surah: 2, frequency: 3, lastOccurredAt: "2026-07-20" }),
          mistake({
            id: "m2",
            surah: 3,
            frequency: 3,
            lastOccurredAt: "2026-07-22",
          }),
        ],
        maxRecords: 200,
      },
    });

    const { decision, output } = runRevision(profile, state);
    const r003 = output.results.find((r) => r.ruleId === R003_ID);
    expect(r003?.applied).toBe(true);
    expect(r003?.severity).toBe("hard");
    expect(r003?.meta?.recoveryRequired).toBe(true);
    expect(r003?.meta?.recoveryScope).toBeTruthy();

    expect(decision.recoveryRequired).toBe(true);
    expect(decision.lockProgression).toBe(true);
    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.allowNewHifz).toBe(false);
    expect(decision.stabilityGatePassed).toBe(false);
    expect(decision.dailyCapacity.pages).toBe(0);
  });
});

describe("R-004 — stable user → progression remains allowed", () => {
  it("passes stability gate and keeps hifz allowed", () => {
    const profile = baseProfile({
      memorizationStrength: 4,
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 78, strength: "GOOD" },
          { surah: 79, strength: "GOOD" },
        ],
        juzSelections: [],
      },
    });
    const state = baseState({
      learning: {
        ...baseState().learning,
        strengthScore: 4,
        effectiveStrength: "GOOD",
      },
      sessions: { records: completedSessions(3), maxRecords: 200 },
      mistakes: {
        records: [
          mistake({ surah: 78, frequency: 1, lastOccurredAt: "2026-07-21" }),
        ],
        maxRecords: 200,
      },
    });

    const { decision, output } = runRevision(profile, state);
    const r004 = output.results.find((r) => r.ruleId === R004_ID);
    expect(r004?.applied).toBe(true);
    expect(r004?.meta?.stabilityGatePassed).toBe(true);
    expect(r004?.severity).toBe("info");

    expect(decision.stabilityGatePassed).toBe(true);
    expect(decision.recoveryRequired).toBe(false);
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.lockProgression).toBe(false);
  });
});

describe("Revision + progression conflict resolution", () => {
  it("hard recovery/gate overrides soft readiness and capacity increase", () => {
    const profile = baseProfile({
      memorizationStrength: 2,
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 36, strength: "WEAK" },
          { surah: 67, strength: "WEAK" },
        ],
        juzSelections: [],
      },
    });
    const state = baseState({
      learning: {
        ...baseState().learning,
        strengthScore: 2,
        effectiveStrength: "WEAK",
      },
      sessions: {
        records: [
          {
            id: "f1",
            userId: "rev-user",
            date: "2026-07-20",
            kind: "near_revision",
            outcome: "failed",
            createdAt: "2026-07-20T10:00:00.000Z",
          },
          {
            id: "f2",
            userId: "rev-user",
            date: "2026-07-21",
            kind: "near_revision",
            outcome: "partial",
            createdAt: "2026-07-21T10:00:00.000Z",
          },
        ],
        maxRecords: 200,
      },
      mistakes: {
        records: [
          mistake({ surah: 36, frequency: 4, lastOccurredAt: "2026-07-21" }),
          mistake({
            id: "mb",
            surah: 67,
            frequency: 3,
            lastOccurredAt: "2026-07-22",
          }),
        ],
        maxRecords: 200,
      },
    });

    const { decision, output } = runProgressionAndRevision(profile, state);
    const applied = output.applied.map((r) => r.ruleId);

    expect(applied).toContain(P001_ID);
    expect(applied).toContain(R001_ID);
    expect(applied.some((id) => id === R003_ID || id === R004_ID)).toBe(true);
    // Soft capacity increase must not stick when locked
    expect(applied).not.toContain(P002_ID);

    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.allowNewHifz).toBe(false);
    expect(decision.revisionPriority).toBe(true);
    expect(decision.suggestedCapacityChange).toBeNull();
    expect(
      decision.recoveryRequired || decision.stabilityGatePassed === false
    ).toBe(true);
  });
});

describe("Full pipeline integration", () => {
  it("scenario + progression + revision: strong consecutive user can progress", () => {
    const { decision, output } = runFull(
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
      }),
      baseState({
        learning: {
          ...baseState().learning,
          strengthScore: 4,
          effectiveStrength: "GOOD",
        },
        sessions: { records: completedSessions(3), maxRecords: 200 },
      })
    );

    expect(output.applied.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining(["S-003", "S-004", P001_ID, R001_ID, R004_ID])
    );
    expect(decision.track).toBe("continue_from_last_surah");
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.allowNewHifz).toBe(true);
    expect(decision.stabilityGatePassed).toBe(true);
    expect(decision.recoveryRequired).toBe(false);
    expect(decision.dailyCapacity.minutes).toBe(50);
    expect(decision.recommendedRevision).not.toBeNull();
  });

  it("full pipeline: weak + S-001 + revision recovery stay blocked", () => {
    const { decision, output } = runFull(
      baseProfile({
        memorizationStrength: 1,
        dailyMinutes: 30,
        pagesPerDay: 0,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [{ surah: 1, strength: "WEAK" }],
          juzSelections: [],
        },
      }),
      baseState({
        learning: {
          ...baseState().learning,
          strengthScore: 1,
          effectiveStrength: "WEAK",
        },
      })
    );

    expect(output.applied.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining(["S-001", "S-004", R001_ID, R004_ID])
    );
    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.revisionPriority).toBe(true);
    expect(decision.additionalListeningPractice).toBe(true);
    expect(decision.dailyCapacity.minutes).toBe(30);
  });
});
