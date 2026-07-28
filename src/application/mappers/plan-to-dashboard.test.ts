/**
 * Dashboard mapper — pure mapping tests.
 */

import { describe, expect, it } from "vitest";
import { mapOrchestrationToDashboard } from "./plan-to-dashboard";
import type { TodayPlanResult, JourneyPlanResult } from "../types";
import type { Decision, GeneratedPlan, PlanDay } from "../types";

function decision(over: Partial<Decision> = {}): Decision {
  return {
    track: "bottom_up",
    newHifzEnabled: true,
    revisionOnly: false,
    dailyCapacity: { minutes: 40, pages: 1 },
    additionalListeningPractice: false,
    additionalMistakeReview: false,
    revisionScheduleEnabled: true,
    allowNewHifz: true,
    lockProgression: false,
    strengtheningRequired: false,
    strengtheningArea: null,
    suggestedCapacityChange: null,
    revisionPriority: false,
    recommendedRevision: null,
    recoveryRequired: false,
    recoveryScope: null,
    stabilityGatePassed: true,
    appliedRules: ["S-002", "S-004"],
    reasons: [],
    effects: [],
    conflicts: [],
    warnings: [],
    trackMeta: {},
    ...over,
  };
}

function day(n: number, items: PlanDay["items"]): PlanDay {
  return {
    dayNumber: n,
    date: `2026-07-${String(22 + n).padStart(2, "0")}`,
    items,
    totalMinutes: items.reduce((s, i) => s + i.estimatedMinutes, 0),
  };
}

function fakePlan(days: PlanDay[]): GeneratedPlan {
  return {
    days,
    startingState: {} as GeneratedPlan["startingState"],
    endingState: {} as GeneratedPlan["endingState"],
    endingRevisionMemory: [],
    meta: {
      decisionValid: true,
      newHifzEnabled: true,
      revisionOnly: false,
      horizonDays: days.length,
      srsEnabled: true,
      notes: [],
    },
  };
}

describe("mapOrchestrationToDashboard", () => {
  it("maps today items into journey steps and revision rows", () => {
    const todayDay = day(1, [
      {
        id: "n1",
        type: "NEAR_REVISION",
        estimatedMinutes: 10,
        labelAr: "مراجعة قريبة: الناس",
        surah: 114,
        priorityReasons: ["near revision"],
      },
      {
        id: "h1",
        type: "NEW_HIFZ",
        estimatedMinutes: 15,
        labelAr: "الفلق–الإخلاص",
        surah: 113,
      },
    ]);
    const today: TodayPlanResult = {
      asOfDate: "2026-07-23",
      plan: fakePlan([todayDay]),
      today: todayDay,
      decision: decision(),
      validation: { valid: true, errors: [], warnings: [] },
      appliedRules: ["S-002"],
      fromCache: false,
    };
    const week: JourneyPlanResult = {
      asOfDate: "2026-07-23",
      horizonDays: 7,
      plan: fakePlan([
        todayDay,
        day(2, [
          {
            id: "f1",
            type: "FAR_REVISION",
            estimatedMinutes: 12,
            labelAr: "مراجعة بعيدة",
          },
        ]),
      ]),
      decision: decision(),
      validation: { valid: true, errors: [], warnings: [] },
      appliedRules: ["S-002"],
      fromCache: false,
    };

    const view = mapOrchestrationToDashboard({ today, week, month: week });
    expect(view.hifzEnabled).toBe(true);
    expect(view.steps.some((s) => s.kind === "new_hifz")).toBe(true);
    expect(view.steps.some((s) => s.kind === "revision")).toBe(true);
    expect(view.revisionRows.length).toBeGreaterThan(0);
    expect(view.miniNewHifzLabel).toContain("الفلق");
    expect(view.weekly.length).toBeGreaterThan(0);
  });
});
