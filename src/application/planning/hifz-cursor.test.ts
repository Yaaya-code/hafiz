/**
 * HifzCursor — Cases 1–5 (architectural Phase Cursor)
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
  resolveHifzCursor,
  advanceHifzCursorAfterSession,
} from "./hifz-cursor";
import { enrichProgressFromProfile } from "./bootstrap-from-profile";
import {
  LearningExecutionService,
} from "../learning/execution-service";
import {
  PlanningService,
} from "./planning-service";
import { MemoryLearningStore } from "../persistence/learning-store";

function ammaSurahs(): number[] {
  return Array.from({ length: 37 }, (_, i) => 78 + i);
}

function baseProfile(over: Partial<HafizProfile> = {}): HafizProfile {
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
    ...over,
  };
}

describe("HifzCursor Cases 1–5", () => {
  it("Case 1: Baqarah 1–100 + Juz Amma → NEW_HIFZ from 2:101", () => {
    const profile = baseProfile({
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

    const cursor = resolveHifzCursor(profile);
    expect(cursor).toMatchObject({
      surah: 2,
      ayah: 101,
      source: "incomplete_partial",
    });

    const progress = enrichProgressFromProfile(profile, { userId: "c1" });
    const ctx = buildPlanningContext({
      profile: { ...profile, userId: "c1" },
      progress,
      asOfDate: "2026-07-26",
    });
    const validated = runDecisionPipeline(ctx);
    expect(validated.decision.newHifzEnabled).toBe(true);
    expect(validated.decision.revisionOnly).toBe(false);
    expect(validated.decision.trackMeta.continuationMode).toBe("from_cursor");
    // Observability still has max surah
    expect(validated.decision.trackMeta.continueAfterSurah).toBe(114);

    expect(ctx.state.hifz.currentPointer).toEqual({ surah: 2, ayah: 101 });

    const plan = generatePlan(validated, ctx.state, {
      horizonDays: 1,
      startDate: "2026-07-26",
      geometry: createDefaultQuranGeometry(),
    });
    const hifz = plan.days[0]?.items.find((i) => i.type === "NEW_HIFZ");
    expect(hifz).toBeTruthy();
    expect(hifz!.surah).toBe(2);
    expect(hifz!.sourceRange?.fromAyah).toBe(101);
  });

  it("Case 2: complete single surah → next surah", () => {
    const profile = baseProfile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [{ surah: 1, strength: "GOOD" }],
        juzSelections: [],
      },
    });
    const cursor = resolveHifzCursor(profile);
    expect(cursor).toEqual({
      surah: 2,
      ayah: 1,
      source: "after_completed_block",
      reason: expect.stringContaining("1") as unknown as string,
    });
    expect(cursor.surah).toBe(2);
    expect(cursor.ayah).toBe(1);
    expect(cursor.source).toBe("after_completed_block");
  });

  it("Case 3: mid-surah partial → next ayah, not max surah", () => {
    const profile = baseProfile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 50 },
          { surah: 114, strength: "STRONG" },
        ],
        juzSelections: [],
      },
    });
    const cursor = resolveHifzCursor(profile);
    expect(cursor.surah).toBe(2);
    expect(cursor.ayah).toBe(51);
    expect(cursor.source).toBe("incomplete_partial");

    const progress = enrichProgressFromProfile(profile, { userId: "c3" });
    const ctx = buildPlanningContext({
      profile: { ...profile, userId: "c3" },
      progress,
      asOfDate: "2026-07-26",
    });
    const validated = runDecisionPipeline(ctx);
    const plan = generatePlan(validated, ctx.state, {
      horizonDays: 1,
      startDate: "2026-07-26",
      geometry: createDefaultQuranGeometry(),
    });
    const hifz = plan.days[0]?.items.find((i) => i.type === "NEW_HIFZ");
    expect(hifz?.surah).toBe(2);
    expect(hifz?.sourceRange?.fromAyah).toBe(51);
  });

  it("Case 4: opening plan does not move cursor", () => {
    const store = new MemoryLearningStore();
    const profile = baseProfile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 100 },
        ],
        juzSelections: [],
      },
    });
    // Seed empty brain then run planning service like dashboard
    store.save({
      version: 1,
      updatedAt: new Date().toISOString(),
      userState: null,
      revisionMemory: [],
      planCache: {},
    });

    const planning = new PlanningService({
      store,
      loadProfile: () => profile,
    });

    const before = resolveHifzCursor(profile);
    expect(before).toMatchObject({ surah: 2, ayah: 101 });

    // First plan generation (simulates opening dashboard)
    const r1 = planning.getTodayPlan({ force: true, asOfDate: "2026-07-26" });
    expect(r1.decision.newHifzEnabled).toBe(true);
    const snap1 = planning.getLearningSnapshot();
    expect(snap1.userState?.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 101,
    });
    expect(snap1.userState?.hifz.lastAdvancedDate).toBeUndefined();

    // Second open — still same cursor
    const r2 = planning.getTodayPlan({ force: true, asOfDate: "2026-07-26" });
    void r2;
    const snap2 = planning.getLearningSnapshot();
    expect(snap2.userState?.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 101,
    });
    expect(snap2.userState?.hifz.lastAdvancedDate).toBeUndefined();
  });

  it("Case 5: real NEW_HIFZ session advances cursor 2:101–110 → 2:111", () => {
    const store = new MemoryLearningStore();
    store.save({
      version: 1,
      updatedAt: "2026-07-26T00:00:00.000Z",
      userState: {
        userId: "c5",
        streakDays: 0,
        hifz: {
          currentPointer: { surah: 2, ayah: 101 },
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
          strengthScore: 3,
          learningStyle: "LISTEN_AND_READ",
          revisionStyle: "balanced",
          newHifzEnabled: true,
          dailyPageCapacity: 1,
          dailyMinuteCapacity: 60,
        },
        planning: {
          scenarioId: "continue_forward",
          currentHifzPointer: { surah: 2, ayah: 101 },
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
      },
      revisionMemory: [],
      planCache: {},
    });

    const profile = baseProfile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 100 },
        ],
        juzSelections: [],
      },
    });

    const planning = new PlanningService({
      store,
      loadProfile: () => profile,
    });
    const exec = new LearningExecutionService(planning);

    expect(
      advanceHifzCursorAfterSession({ surah: 2, toAyah: 110 })
    ).toMatchObject({ surah: 2, ayah: 111, source: "session_progress" });

    const result = exec.completeSession({
      sessionKind: "new_hifz",
      outcome: "success",
      surahNumber: 2,
      fromAyah: 101,
      toAyah: 110,
      date: "2026-07-26",
      autoReplan: false,
    });

    expect(result.snapshot.userState?.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 111,
    });
    expect(result.snapshot.userState?.hifz.lastAdvancedDate).toBe("2026-07-26");
  });
});
