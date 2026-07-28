/**
 * TRACE: Baqarah 1–100 + Juz Amma + continue_forward
 * Proves where the Hifz pointer is created and where it is overwritten.
 *
 * Expected first NEW_HIFZ: surah 2 ayah 101
 * Actual after generatePlan track apply: surah 114 (Amma end) → no real progress
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
  resolveBootstrapHifzPointer,
  findIncompleteMemorizationPointer,
  collectMemorizedSurahsFromProfile,
} from "./bootstrap-from-profile";

function ammaSurahs(): number[] {
  return Array.from({ length: 37 }, (_, i) => 78 + i);
}

function scenarioProfile(): HafizProfile {
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
  };
}

describe("POINTER TRACE: Baqarah 1-100 + Juz Amma + continue_forward", () => {
  it("documents where pointer is created and where generatePlan overwrites it", () => {
    const profile = scenarioProfile();
    const log: string[] = [];

    // ── 1) First creation ──────────────────────────────────────────
    const incomplete = findIncompleteMemorizationPointer(
      profile.memorizationSelection
    );
    const bootstrap = resolveBootstrapHifzPointer(profile);
    const allSurahs = collectMemorizedSurahsFromProfile(
      profile.memorizationSelection
    );
    const maxSurah = allSurahs[allSurahs.length - 1];

    log.push(
      `1. findIncompleteMemorizationPointer → ${JSON.stringify(incomplete)}`
    );
    log.push(
      `   file: bootstrap-from-profile.ts  fn: findIncompleteMemorizationPointer`
    );
    log.push(
      `1b. resolveBootstrapHifzPointer → ${JSON.stringify(bootstrap)}`
    );
    log.push(
      `   file: bootstrap-from-profile.ts  fn: resolveBootstrapHifzPointer`
    );
    log.push(`   max(surahNumber) in selection = ${maxSurah}`);

    expect(incomplete).toEqual({ surah: 2, ayah: 101 });
    expect(bootstrap).toEqual({ surah: 2, ayah: 101 });
    expect(maxSurah).toBe(114);

    // ── 2) After enrich / before PlanningService steps ─────────────
    const progress = enrichProgressFromProfile(profile, { userId: "trace-u" });
    log.push(
      `2. enrichProgressFromProfile.hifzPointer → ${JSON.stringify(progress.hifzPointer)}`
    );
    log.push(
      `   file: bootstrap-from-profile.ts  fn: enrichProgressFromProfile`
    );
    expect(progress.hifzPointer).toEqual({ surah: 2, ayah: 101 });

    const ctx = buildPlanningContext({
      profile: { ...profile, userId: "trace-u" },
      progress,
      asOfDate: "2026-07-26",
    });
    const ptrBeforeDecision = {
      surah: ctx.state.hifz.currentPointer.surah,
      ayah: ctx.state.hifz.currentPointer.ayah,
    };
    log.push(
      `2b. AFTER buildPlanningContext (state pointer) → ${JSON.stringify(ptrBeforeDecision)}`
    );
    log.push(
      `   file: planning-context-builder.ts  fn: buildPlanningContext → adaptAppProgressToUserState`
    );
    expect(ptrBeforeDecision).toEqual({ surah: 2, ayah: 101 });

    // ── 3) Decision ────────────────────────────────────────────────
    const validated = runDecisionPipeline(ctx);
    const d = validated.decision;
    log.push(
      `3. Decision: newHifzEnabled=${d.newHifzEnabled} revisionOnly=${d.revisionOnly} track=${d.track}`
    );
    log.push(
      `   trackMeta.continueAfterSurah=${d.trackMeta.continueAfterSurah} lastMemorizedSurah=${d.trackMeta.lastMemorizedSurah}`
    );
    log.push(`   file: decision-runner / S-003 existingMemorizerTrackRule`);

    expect(d.newHifzEnabled).toBe(true);
    expect(d.revisionOnly).toBe(false);
    expect(d.track).toBe("continue_from_last_surah");
    // THE SMOKING GUN in Decision meta (max surah, not incomplete partial):
    expect(d.trackMeta.continueAfterSurah).toBe(114);
    expect(d.trackMeta.lastMemorizedSurah).toBe(114);

    const ptrBeforeGenerate = {
      surah: ctx.state.hifz.currentPointer.surah,
      ayah: ctx.state.hifz.currentPointer.ayah,
    };
    log.push(
      `3b. pointer BEFORE generatePlan (unchanged by Decision) → ${JSON.stringify(ptrBeforeGenerate)}`
    );
    expect(ptrBeforeGenerate).toEqual({ surah: 2, ayah: 101 });

    // ── 4) generatePlan ────────────────────────────────────────────
    const plan = generatePlan(validated, ctx.state, {
      horizonDays: 7,
      startDate: "2026-07-26",
      geometry: createDefaultQuranGeometry(),
      runId: "trace-plan",
    });

    // startingState is clone BEFORE track apply inside generatePlan
    const startPtr = plan.startingState.hifz.currentPointer;
    log.push(
      `4. plan.startingState pointer (input clone) → ${JSON.stringify(startPtr)}`
    );

    // First day's NEW_HIFZ if any
    const day1Hifz = plan.days[0]?.items.find((i) => i.type === "NEW_HIFZ");
    const hifzDays = plan.days.filter((d) =>
      d.items.some((i) => i.type === "NEW_HIFZ")
    );
    log.push(
      `4b. day1 NEW_HIFZ → ${
        day1Hifz
          ? `surah=${day1Hifz.surah} from=${day1Hifz.sourceRange?.fromAyah} label=${day1Hifz.labelAr}`
          : "NONE"
      }`
    );
    log.push(`4c. days with NEW_HIFZ: ${hifzDays.length} / ${plan.days.length}`);
    log.push(
      `   generatePlan applies applyDecisionTrackToState when track=continue_from_last_surah:`
    );
    log.push(
      `   continueAfterSurah=114 → pointer set to {114,1} + paused=true (after>=114)`
    );
    log.push(
      `   file: plan-generator.ts  fn: applyDecisionTrackToState lines ~192-205`
    );

    // Decision is correct...
    expect(d.newHifzEnabled).toBe(true);

    // After fix: Generator preserves incomplete continue (2:101)
    expect(day1Hifz).toBeTruthy();
    expect(day1Hifz!.surah).toBe(2);
    expect(day1Hifz!.sourceRange?.fromAyah).toBe(101);
    log.push(
      `4d. FIXED: day1 NEW_HIFZ starts at Baqarah ${day1Hifz!.sourceRange?.fromAyah}`
    );

    // Print full trace for human audit
    // eslint-disable-next-line no-console
    console.log("\n=== POINTER TRACE LOG ===\n" + log.join("\n") + "\n");
  });

  it("FIX verified: incomplete Baqarah 101 wins over continueAfterSurah=114", () => {
    const profile = scenarioProfile();
    const progress = enrichProgressFromProfile(profile, { userId: "u" });
    const ctx = buildPlanningContext({
      profile: { ...profile, userId: "u" },
      progress,
      asOfDate: "2026-07-26",
    });
    const validated = runDecisionPipeline(ctx);

    // A) Decision enables hifz (not the bug)
    expect(validated.decision.newHifzEnabled).toBe(true);
    expect(validated.decision.revisionOnly).toBe(false);

    // Meta still reports max surah (observability) + from_cursor executive mode
    expect(validated.decision.trackMeta.continueAfterSurah).toBe(114);
    expect(validated.decision.trackMeta.continuationMode).toBe("from_cursor");

    // Input state has correct bootstrap pointer
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
});
