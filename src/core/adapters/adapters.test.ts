/**
 * Adapter Layer tests — mapping only, no rule logic in adapters.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adaptHafizProfileToUserProfile,
  adaptAppProgressToUserState,
  buildPlanningContext,
  createDefaultUserState,
} from "./index";
import { runDecisionPipeline } from "../engine/decision-runner";

describe("profile-adapter", () => {
  it("1. HafizProfile converts correctly", () => {
    const profile = adaptHafizProfileToUserProfile({
      name: "يحيى",
      pagesPerDay: 2,
      dailyMinutes: 60,
      memorizationStrength: 4,
      revisionStyle: "intensive",
      learningStyle: "LISTENING",
      progressionMode: "continue_forward",
      preferredQariId: "alafasy",
      goals: ["تثبيت المحفوظ"],
      completedAt: "2026-07-20T10:00:00.000Z",
      onboardingComplete: true,
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 78, strength: "GOOD" },
          { surah: 79, strength: "STRONG" },
        ],
        juzSelections: [],
      },
      userId: "user-1",
    });

    expect(profile.userId).toBe("user-1");
    expect(profile.displayName).toBe("يحيى");
    expect(profile.pagesPerDay).toBe(2);
    expect(profile.dailyMinutes).toBe(60);
    expect(profile.memorizationStrength).toBe(4);
    expect(profile.revisionStyle).toBe("intensive");
    expect(profile.learningStyle).toBe("LISTENING");
    expect(profile.progressionMode).toBe("continue_forward");
    expect(profile.preferredQariId).toBe("alafasy");
    expect(profile.goals).toEqual(["تثبيت المحفوظ"]);
    expect(profile.onboardingCompletedAt).toBe("2026-07-20");
    expect(profile.memorizationSelection.mode).toBe("SURAH");
    expect(profile.memorizationSelection.surahSelections).toHaveLength(2);
    expect(profile.memorizationSelection.surahSelections[0].surah).toBe(78);
  });

  it("2. Missing optional fields have safe defaults", () => {
    const profile = adaptHafizProfileToUserProfile({});
    expect(profile.userId).toBe("anonymous");
    expect(profile.displayName.length).toBeGreaterThan(0);
    expect(profile.pagesPerDay).toBe(1);
    expect(profile.dailyMinutes).toBe(45);
    expect(profile.memorizationStrength).toBe(3);
    expect(profile.revisionStyle).toBe("balanced");
    expect(profile.learningStyle).toBe("LISTEN_AND_READ");
    expect(profile.progressionMode).toBe("continue_forward");
    expect(profile.goals).toEqual([]);
    expect(profile.memorizationSelection.mode).toBe("NONE");
    expect(profile.preferredQariId).toBeUndefined();

    // null source
    const fromNull = adaptHafizProfileToUserProfile(null);
    expect(fromNull.dailyMinutes).toBe(45);

    // clamp strength / floor minutes
    const clamped = adaptHafizProfileToUserProfile({
      memorizationStrength: 99 as 5,
      dailyMinutes: -10,
      pagesPerDay: -1,
    });
    expect(clamped.memorizationStrength).toBe(5);
    expect(clamped.dailyMinutes).toBe(0);
    expect(clamped.pagesPerDay).toBe(0);
  });
});

describe("state-adapter", () => {
  it("3. State conversion preserves pointers and queues", () => {
    const profile = adaptHafizProfileToUserProfile({
      userId: "u2",
      memorizationStrength: 4,
      dailyMinutes: 40,
      pagesPerDay: 1,
    });

    const state = adaptAppProgressToUserState(
      {
        userId: "u2",
        streakDays: 5,
        hifzPointer: { surah: 80, ayah: 3 },
        hifzTrack: "continue_forward",
        hifzPaused: false,
        nearStack: [
          {
            id: "near-1",
            priority: 10,
            timesServed: 2,
            source: "near_carry",
            slice: {
              labelAr: "عبس",
              pagesApprox: 0.5,
              range: { surah: 80, fromAyah: 1, toAyah: 10 },
            },
          },
        ],
        farQueue: [
          {
            id: "far-1",
            priority: 1,
            timesServed: 0,
            source: "memorized_corpus",
            slice: { labelAr: "النبأ", pagesApprox: 1 },
          },
        ],
        farIndex: 0,
        nearStackMax: 7,
        mistakes: [
          {
            id: "m1",
            surahNumber: 80,
            ayahNumber: 2,
            type: "WORD",
            frequency: 2,
            createdAt: "2026-07-21",
          },
        ],
        sessions: [
          {
            id: "s1",
            date: "2026-07-22",
            kind: "new_hifz",
            outcome: "completed",
            surahNumber: 80,
          },
        ],
      },
      { profile, asOfDate: "2026-07-23" }
    );

    expect(state.userId).toBe("u2");
    expect(state.streakDays).toBe(5);
    expect(state.hifz.currentPointer).toEqual({ surah: 80, ayah: 3 });
    expect(state.planning.currentHifzPointer).toEqual({ surah: 80, ayah: 3 });
    expect(state.hifz.track).toBe("continue_forward");
    expect(state.revision.nearStack).toHaveLength(1);
    expect(state.revision.nearStack[0].id).toBe("near-1");
    expect(state.revision.nearStack[0].slice.range?.surah).toBe(80);
    expect(state.revision.farQueue).toHaveLength(1);
    expect(state.mistakes.records).toHaveLength(1);
    expect(state.mistakes.records[0].surah).toBe(80);
    expect(state.sessions.records).toHaveLength(1);
    expect(state.sessions.records[0].outcome).toBe("completed");
    expect(state.learning.strengthScore).toBe(4);
    expect(state.learning.dailyMinuteCapacity).toBe(40);
  });

  it("createDefaultUserState uses profile capacity", () => {
    const profile = adaptHafizProfileToUserProfile({
      userId: "u3",
      dailyMinutes: 25,
      pagesPerDay: 0.5,
      memorizationStrength: 2,
    });
    const state = createDefaultUserState(profile, "2026-07-23");
    expect(state.learning.dailyMinuteCapacity).toBe(25);
    expect(state.learning.dailyPageCapacity).toBe(0.5);
    expect(state.learning.strengthScore).toBe(2);
    expect(state.hifz.currentPointer.surah).toBeGreaterThan(0);
  });
});

describe("decision-runner + planning context", () => {
  it("4. Decision runner accepts adapted context", () => {
    const ctx = buildPlanningContext({
      profile: {
        name: "مبتدئ",
        pagesPerDay: 1,
        dailyMinutes: 30,
        memorizationStrength: 4,
        learningStyle: "READING",
        revisionStyle: "balanced",
        memorizationSelection: {
          mode: "NONE",
          surahSelections: [],
          juzSelections: [],
        },
        userId: "beginner-1",
      },
      progress: {
        sessions: [
          {
            id: "s1",
            date: "2026-07-20",
            kind: "new_hifz",
            outcome: "completed",
          },
          {
            id: "s2",
            date: "2026-07-21",
            kind: "new_hifz",
            outcome: "completed",
          },
          {
            id: "s3",
            date: "2026-07-22",
            kind: "new_hifz",
            outcome: "completed",
          },
        ],
      },
      asOfDate: "2026-07-23",
    });

    expect(ctx.profile.userId).toBe("beginner-1");
    expect(ctx.asOfDate).toBeInstanceOf(Date);

    const result = runDecisionPipeline(ctx);
    expect(result.asOfDate).toBe("2026-07-23");
    expect(result.decision.track).toBe("bottom_up");
    expect(result.decision.newHifzEnabled).toBe(true);
    expect(result.validation.valid).toBe(true);
    expect(result.appliedRules.length).toBeGreaterThan(0);
    expect(result.decision.appliedRules).toContain("S-002");
    expect(result.decision.appliedRules).toContain("S-004");
  });
});

describe("adapter purity", () => {
  it("5. No adapter contains rule logic", () => {
    const dir = join(process.cwd(), "src/core/adapters");
    // Implementation files only (types may mention app storage conceptually)
    const files = [
      "profile-adapter.ts",
      "state-adapter.ts",
      "planning-context-builder.ts",
      "index.ts",
    ];
    const banned = [
      "evaluate(",
      "registerLogicBible",
      "buildDecision",
      "validateDecision",
      "isReadyForNewHifz",
      "assessRegression",
      "assessRecovery",
      "RulePriorityBand",
      "severity:",
      "localStorage",
      "prisma",
      "DATABASE_URL",
      "window.",
      "fetch(",
    ];

    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const token of banned) {
        expect(src.includes(token), `${f} must not contain ${token}`).toBe(
          false
        );
      }
    }
  });
});
