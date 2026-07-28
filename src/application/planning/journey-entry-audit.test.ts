/**
 * State-diff audit: plan object before vs after Daily Journey orchestration.
 * Replays the exact call order of plan-reveal → dashboard/journey hooks.
 */
import { describe, expect, it } from "vitest";
import type { HafizProfile } from "@/lib/user-profile";
import { getDefaultProfile } from "@/lib/user-profile";
import { PlanningService } from "./planning-service";
import { MemoryLearningStore } from "../persistence/learning-store";
import { mapOrchestrationToDashboard } from "../mappers/plan-to-dashboard";
import type { GeneratedPlan, PlanItem } from "@/core";

function profile(): HafizProfile {
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
        { surah: 1, strength: "STRONG" },
        { surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 90 },
      ],
      juzSelections: [{ juz: 30, strength: "STRONG" }],
    },
  };
}

function day0Items(plan: GeneratedPlan): PlanItem[] {
  return plan.days[0]?.items ?? [];
}

function summarize(items: PlanItem[]) {
  return items.map((i) => ({
    type: i.type,
    surah: i.surah ?? i.sourceRange?.surah,
    from: i.sourceRange?.fromAyah,
    to: i.sourceRange?.toAyah,
    label: i.labelAr,
  }));
}

function hasNas(items: PlanItem[]) {
  return items.some(
    (i) =>
      i.surah === 114 ||
      i.sourceRange?.surah === 114 ||
      (i.labelAr || "").includes("الناس")
  );
}

describe("Journey entry state-diff audit", () => {
  it("A) plan-reveal sequence: force today then week keeps day:1 cache", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => profile(),
    });

    // Exact plan-reveal-view order (fixed: week force:false)
    const refreshed = svc.refreshLearningState({
      force: true,
      asOfDate: "2026-07-26",
    });
    const todayBeforeWeek = refreshed.today;
    const snapAfterToday = store.load();
    const keysAfterToday = Object.keys(snapAfterToday.planCache);

    const weekPlan = svc.generateJourneyPlan({
      days: 7,
      force: false,
      asOfDate: "2026-07-26",
    });
    const snapAfterWeek = store.load();
    const keysAfterWeek = Object.keys(snapAfterWeek.planCache);

    const audit = {
      keysAfterToday,
      keysAfterWeek,
      todayItems: summarize(day0Items(todayBeforeWeek.plan)),
      weekDay0: summarize(day0Items(weekPlan.plan)),
      cursorAfterWeek: snapAfterWeek.userState?.hifz.currentPointer,
      nearStackAfterWeek: snapAfterWeek.userState?.revision.nearStack,
      day1CachePresent: Boolean(snapAfterWeek.planCache["2026-07-26:1"]),
      day7CachePresent: Boolean(snapAfterWeek.planCache["2026-07-26:7"]),
    };
    // eslint-disable-next-line no-console
    console.log("AUDIT_A", JSON.stringify(audit, null, 2));

    expect(keysAfterToday).toContain("2026-07-26:1");
    // Integrity fix: week must not erase today's plan
    expect(audit.day1CachePresent).toBe(true);
    expect(audit.day7CachePresent).toBe(true);
    // Simulated near_carry must not become Actual nearStack
    expect(audit.nearStackAfterWeek ?? []).toEqual([]);

    const hifz = day0Items(todayBeforeWeek.plan).find((i) => i.type === "NEW_HIFZ");
    expect(hifz?.surah).toBe(2);
    expect(hifz?.sourceRange?.fromAyah).toBe(91);
  });

  it("A2) force:true on week alone still keeps sibling :1 cache", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => profile(),
    });
    svc.getTodayPlan({ force: true, asOfDate: "2026-07-26" });
    expect(store.load().planCache["2026-07-26:1"]).toBeTruthy();

    svc.generateJourneyPlan({ days: 7, force: true, asOfDate: "2026-07-26" });
    const snap = store.load();
    expect(snap.planCache["2026-07-26:1"]).toBeTruthy();
    expect(snap.planCache["2026-07-26:7"]).toBeTruthy();
  });

  it("B) dashboard/journey load after plan-reveal: getTodayPlan recompute + week/month", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => profile(),
    });

    // Plan-reveal (fixed sequence)
    svc.refreshLearningState({ force: true, asOfDate: "2026-07-26" });
    svc.generateJourneyPlan({ days: 7, force: false, asOfDate: "2026-07-26" });

    const snapMid = store.load();
    const beforeJourney = {
      cursor: snapMid.userState?.hifz.currentPointer,
      cacheKeys: Object.keys(snapMid.planCache),
      nearStackLen: snapMid.userState?.revision.nearStack?.length ?? 0,
    };

    // Exact useOrchestratedPlan load(false) order
    const todayResult = svc.getTodayPlan({ asOfDate: "2026-07-26" });
    const weekResult = svc.generateJourneyPlan({
      days: 7,
      force: false,
      asOfDate: "2026-07-26",
    });
    const monthResult = svc.generateJourneyPlan({
      days: 30,
      force: false,
      asOfDate: "2026-07-26",
    });

    const snapAfter = store.load();
    const view = mapOrchestrationToDashboard({
      today: todayResult,
      week: weekResult,
      month: monthResult,
    });

    const todayItems = day0Items(todayResult.plan);
    const audit = {
      beforeJourney,
      after: {
        cursor: snapAfter.userState?.hifz.currentPointer,
        cacheKeys: Object.keys(snapAfter.planCache),
        nearStackLen: snapAfter.userState?.revision.nearStack?.length ?? 0,
      },
      todayFromCache: todayResult.fromCache,
      weekFromCache: weekResult.fromCache,
      monthFromCache: monthResult.fromCache,
      todayItems: summarize(todayItems),
      viewSteps: view.steps.map((s) => ({
        kind: s.kind,
        surah: s.surahNumber,
        from: s.fromAyah,
        title: s.subtitleAr,
      })),
      todayHasNas: hasNas(todayItems),
    };
    // eslint-disable-next-line no-console
    console.log("AUDIT_B", JSON.stringify(audit, null, 2));

    expect(audit.after.cursor).toEqual({ surah: 2, ayah: 91 });
    expect(audit.todayHasNas).toBe(false);
    expect(todayItems.find((i) => i.type === "NEW_HIFZ")?.surah).toBe(2);
    // Today was preserved from plan-reveal — Journey loads from cache
    expect(todayResult.fromCache).toBe(true);
    expect(weekResult.fromCache).toBe(true);
    expect(beforeJourney.nearStackLen).toBe(0);
    expect(audit.after.nearStackLen).toBe(0);
  });

  it("C) double useOrchestratedPlan (dashboard + journey) does not flip to Nas", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => profile(),
    });

    // First mount (dashboard)
    const t1 = svc.getTodayPlan({ asOfDate: "2026-07-26" });
    svc.generateJourneyPlan({ days: 7, force: false, asOfDate: "2026-07-26" });
    svc.generateJourneyPlan({ days: 30, force: false, asOfDate: "2026-07-26" });

    const afterDash = summarize(day0Items(t1.plan));

    // Second mount (journey) — same as another useOrchestratedPlan
    const t2 = svc.getTodayPlan({ asOfDate: "2026-07-26" });
    const w2 = svc.generateJourneyPlan({
      days: 7,
      force: false,
      asOfDate: "2026-07-26",
    });
    const m2 = svc.generateJourneyPlan({
      days: 30,
      force: false,
      asOfDate: "2026-07-26",
    });

    const afterJourney = summarize(day0Items(t2.plan));
    // eslint-disable-next-line no-console
    console.log("AUDIT_C", {
      afterDash,
      afterJourney,
      t2fromCache: t2.fromCache,
      w2fromCache: w2.fromCache,
      m2fromCache: m2.fromCache,
      cursor: store.load().userState?.hifz.currentPointer,
    });

    expect(hasNas(day0Items(t2.plan))).toBe(false);
    expect(day0Items(t2.plan).find((i) => i.type === "NEW_HIFZ")?.surah).toBe(2);
    // Second load should prefer cache
    expect(t2.fromCache).toBe(true);
  });

  it("D) LEARNING_SNAPSHOT re-entry: load after save must not replace today with month day-N", () => {
    const store = new MemoryLearningStore();
    const svc = new PlanningService({
      store,
      loadProfile: () => profile(),
    });

    // Initial good today
    const good = svc.getTodayPlan({ force: true, asOfDate: "2026-07-26" });
    expect(day0Items(good.plan).find((i) => i.type === "NEW_HIFZ")?.surah).toBe(
      2
    );

    // Multi-day (as hook does) — each save would fire LEARNING_SNAPSHOT_EVENT in browser
    svc.generateJourneyPlan({ days: 7, force: false, asOfDate: "2026-07-26" });
    svc.generateJourneyPlan({ days: 30, force: false, asOfDate: "2026-07-26" });

    // Simulated event handler: load(false) again
    const again = svc.getTodayPlan({ asOfDate: "2026-07-26" });
    const items = day0Items(again.plan);
    // eslint-disable-next-line no-console
    console.log("AUDIT_D", {
      againFromCache: again.fromCache,
      items: summarize(items),
      cacheKeys: Object.keys(store.load().planCache),
    });

    expect(hasNas(items)).toBe(false);
    expect(items.find((i) => i.type === "NEW_HIFZ")?.surah).toBe(2);
  });
});
