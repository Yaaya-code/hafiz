/**
 * Logic Bible v1 — coverage matrix integration tests
 *
 * Full pipeline: register all S/P/R → execute → resolve → validate
 */

import { describe, expect, it } from "vitest";
import type {
  MistakeRecord,
  PlanningState,
  SessionRecord,
  UserProfile,
  UserState,
} from "../../models";
import {
  buildDecision,
  createRuleExecutor,
  createRuleRegistry,
  registerLogicBibleRules,
  RulePipeline,
  validateDecision,
  S001_ID,
  S002_ID,
  S003_ID,
  S004_ID,
  P001_ID,
  P004_ID,
  R001_ID,
  R003_ID,
  R004_ID,
} from "../index";

const AS_OF = "2026-07-23";

function emptySelection(): UserProfile["memorizationSelection"] {
  return { mode: "NONE", surahSelections: [], juzSelections: [] };
}

function baseProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: "coverage-user",
    displayName: "Coverage",
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
    userId: "coverage-user",
    streakDays: 2,
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
  return {
    ...base,
    ...over,
    learning: { ...base.learning, ...over.learning },
    revision: over.revision ?? base.revision,
    sessions: over.sessions ?? base.sessions,
    mistakes: over.mistakes ?? base.mistakes,
  };
}

function completedSessions(n: number): SessionRecord[] {
  const out: SessionRecord[] = [];
  for (let i = 0; i < n; i++) {
    const day = String(18 + i).padStart(2, "0");
    out.push({
      id: `s-${i}`,
      userId: "coverage-user",
      date: `2026-07-${day}`,
      kind: "new_hifz",
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
    userId: partial.userId ?? "coverage-user",
    category: partial.category ?? "WORD",
    frequency: partial.frequency ?? 1,
    lastOccurredAt: partial.lastOccurredAt ?? "2026-07-22",
    ...partial,
    surah: partial.surah,
  };
}

function runBible(profile: UserProfile, state: UserState) {
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
    fallbackDailyPages: profile.pagesPerDay,
  });
  const validation = validateDecision(built.decision);
  return { output, built, decision: built.decision, validation };
}

describe("Logic Bible v1 coverage matrix", () => {
  it("1. Absolute beginner — S-002, P-001 allows, hifz start allowed", () => {
    const { decision, output, validation, built } = runBible(
      baseProfile({
        memorizationStrength: 4,
        dailyMinutes: 30,
        memorizationSelection: emptySelection(),
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

    const applied = output.applied.map((r) => r.ruleId);
    expect(applied).toContain(S002_ID);
    expect(applied).toContain(S004_ID);
    expect(applied).toContain(P001_ID);
    expect(applied).not.toContain(S001_ID);
    expect(applied).not.toContain(S003_ID);

    expect(decision.track).toBe("bottom_up");
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.allowNewHifz).toBe(true);
    expect(decision.revisionOnly).toBe(false);
    expect(decision.stabilityGatePassed).toBe(true);
    expect(decision.appliedRules.length).toBeGreaterThan(0);
    expect(decision.reasons.length).toBeGreaterThan(0);
    expect(Array.isArray(decision.effects)).toBe(true);
    expect(Array.isArray(decision.conflicts)).toBe(true);
    expect(Array.isArray(decision.warnings)).toBe(true);
    expect(validation.valid).toBe(true);
    expect(built.validation.valid).toBe(true);
  });

  it("2. Weak memorizer — S-001 + revision locks block new hifz when pages=0", () => {
    const { decision, output, validation } = runBible(
      baseProfile({
        memorizationStrength: 1,
        dailyMinutes: 30,
        pagesPerDay: 0,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 1, strength: "WEAK" },
            { surah: 2, strength: "WEAK" },
          ],
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

    const applied = output.applied.map((r) => r.ruleId);
    expect(applied).toContain(S001_ID);
    expect(applied).toContain(R001_ID);
    expect(applied.some((id) => id === R003_ID || id === R004_ID)).toBe(true);

    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.allowNewHifz).toBe(false);
    expect(decision.revisionOnly).toBe(true);
    expect(decision.additionalListeningPractice).toBe(true);
    expect(decision.revisionPriority).toBe(true);
    expect(validation.valid).toBe(true);
    // Hard locks explain effects
    expect(
      decision.effects.some(
        (e) =>
          e.effect.includes("newHifzEnabled=false") ||
          e.rule === S001_ID ||
          e.rule === R003_ID
      )
    ).toBe(true);
  });

  it("3. Strong existing consecutive memorizer — progress allowed, gate passed", () => {
    const { decision, output, validation } = runBible(
      baseProfile({
        memorizationStrength: 4,
        dailyMinutes: 50,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 78, strength: "GOOD" },
            { surah: 79, strength: "GOOD" },
            { surah: 80, strength: "STRONG" },
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
      expect.arrayContaining([S003_ID, S004_ID, P001_ID, R004_ID])
    );
    expect(decision.track).toBe("continue_from_last_surah");
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.allowNewHifz).toBe(true);
    expect(decision.stabilityGatePassed).toBe(true);
    expect(decision.recoveryRequired).toBe(false);
    expect(decision.lockProgression).toBe(false);
    expect(validation.valid).toBe(true);
  });

  it("4. Fragmented memorization — S-003 continues with NEW_HIFZ", () => {
    // Clean session history: only scenario fragmentation, no recovery/regression locks
    const { decision, output, validation } = runBible(
      baseProfile({
        memorizationStrength: 4,
        dailyMinutes: 60,
        progressionMode: "continue_forward",
        goals: ["إتمام حفظ القرآن كاملاً"],
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 2, strength: "GOOD" },
            { surah: 78, strength: "GOOD" },
            { surah: 114, strength: "GOOD" },
          ],
          juzSelections: [],
        },
      }),
      baseState()
    );

    expect(output.applied.map((r) => r.ruleId)).toContain(S003_ID);
    expect(decision.track).toBe("continue_from_last_surah");
    expect(decision.newHifzEnabled).toBe(true);
    expect(decision.revisionOnly).toBe(false);
    expect(validation.valid).toBe(true);
  });

  it("5. Regression — P-004 hard lock, no progression", () => {
    const sessions: SessionRecord[] = [
      {
        id: "f1",
        userId: "coverage-user",
        date: "2026-07-20",
        kind: "near_revision",
        outcome: "failed",
        createdAt: "2026-07-20T10:00:00.000Z",
      },
      {
        id: "f2",
        userId: "coverage-user",
        date: "2026-07-21",
        kind: "near_revision",
        outcome: "partial",
        createdAt: "2026-07-21T10:00:00.000Z",
      },
      {
        id: "f3",
        userId: "coverage-user",
        date: "2026-07-22",
        kind: "new_hifz",
        outcome: "failed",
        createdAt: "2026-07-22T10:00:00.000Z",
      },
    ];
    const { decision, output, validation } = runBible(
      baseProfile({
        memorizationStrength: 3,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [{ surah: 78, strength: "GOOD" }],
          juzSelections: [],
        },
      }),
      baseState({
        learning: {
          ...baseState().learning,
          strengthScore: 3,
          effectiveStrength: "NEEDS_REVIEW",
        },
        sessions: { records: sessions, maxRecords: 200 },
        mistakes: {
          records: [
            mistake({ surah: 78, frequency: 3, lastOccurredAt: "2026-07-21" }),
            mistake({
              id: "m2",
              surah: 78,
              frequency: 3,
              lastOccurredAt: "2026-07-22",
            }),
            mistake({
              id: "m3",
              surah: 79,
              frequency: 2,
              lastOccurredAt: "2026-07-22",
            }),
          ],
          maxRecords: 200,
        },
        revision: {
          nearStack: [
            {
              id: "n1",
              slice: { labelAr: "a", pagesApprox: 0.5 },
              priority: 1,
              timesServed: 4,
              source: "near_carry",
            },
            {
              id: "n2",
              slice: { labelAr: "b", pagesApprox: 0.5 },
              priority: 1,
              timesServed: 3,
              source: "near_carry",
            },
          ],
          farQueue: [],
          farIndex: 0,
          weekLog: [],
          nearStackMax: 7,
        },
      })
    );

    expect(output.applied.map((r) => r.ruleId)).toContain(P004_ID);
    expect(decision.lockProgression).toBe(true);
    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.allowNewHifz).toBe(false);
    expect(validation.valid).toBe(true);
    expect(
      decision.effects.some((e) => e.effect.includes("lockProgression") || e.rule === P004_ID)
    ).toBe(true);
  });

  it("6. Conflict — soft progression loses to hard revision/recovery lock", () => {
    const { decision, output, validation } = runBible(
      baseProfile({
        memorizationStrength: 2,
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 36, strength: "WEAK" },
            { surah: 67, strength: "WEAK" },
          ],
          juzSelections: [],
        },
      }),
      baseState({
        learning: {
          ...baseState().learning,
          strengthScore: 2,
          effectiveStrength: "WEAK",
        },
        mistakes: {
          records: [
            mistake({ surah: 36, frequency: 4 }),
            mistake({ id: "mb", surah: 67, frequency: 3 }),
          ],
          maxRecords: 200,
        },
      })
    );

    const applied = output.applied.map((r) => r.ruleId);
    expect(applied).toContain(P001_ID); // soft readiness
    expect(applied.some((id) => id === R003_ID || id === R004_ID || id === S001_ID)).toBe(
      true
    );
    // Hard wins
    expect(decision.newHifzEnabled).toBe(false);
    expect(decision.allowNewHifz).toBe(false);
    expect(decision.suggestedCapacityChange).toBeNull();
    expect(validation.valid).toBe(true);
  });

  it("7. Capacity edge — zero minutes yields deterministic valid Decision", () => {
    const { decision, validation, built } = runBible(
      baseProfile({
        dailyMinutes: 0,
        memorizationStrength: 4,
        memorizationSelection: emptySelection(),
      }),
      baseState({
        learning: {
          ...baseState().learning,
          strengthScore: 4,
          dailyMinuteCapacity: 0,
        },
      })
    );

    expect(decision.dailyCapacity.minutes).toBe(0);
    expect(decision.track).toBe("bottom_up");
    expect(decision.appliedRules).toContain(S004_ID);
    expect(validation.valid).toBe(true);
    expect(built.validation.valid).toBe(true);
    // Deterministic structure always present
    expect(decision.reasons).toBeDefined();
    expect(decision.effects).toBeDefined();
    expect(decision.conflicts).toBeDefined();
    expect(decision.warnings).toBeDefined();
  });
});
