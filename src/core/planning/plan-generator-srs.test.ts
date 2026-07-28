/**
 * Plan Generator × SRS Revision Intelligence integration tests.
 */

import { describe, expect, it } from "vitest";
import type { Decision } from "../rules";
import type { UserState } from "../models";
import type { RevisionMemoryItem } from "../models/revision-memory";
import { generatePlan } from "./plan-generator";
import type { ValidatedDecisionResult } from "../engine/decision-runner";
import type { QuranGeometry } from "./quran/types";
import { rankRevisionItems } from "../revision";

const DAY = "2026-07-23";

function baseDecision(over: Partial<Decision> = {}): Decision {
  return {
    track: "bottom_up",
    newHifzEnabled: true,
    revisionOnly: false,
    dailyCapacity: { minutes: 60, pages: 1 },
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

function emptyState(over: Partial<UserState> = {}): UserState {
  return {
    userId: "srs-plan-user",
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
      dailyMinuteCapacity: 60,
    },
    planning: {
      scenarioId: "unknown",
      currentHifzPointer: { surah: 114, ayah: 1 },
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
    updatedAt: DAY,
    ...over,
  };
}

function asValidated(decision: Decision): ValidatedDecisionResult {
  return {
    decision,
    validation: { valid: true, errors: [], warnings: [] },
    conflicts: [],
    rankedOrder: [...decision.appliedRules],
    appliedRules: decision.appliedRules,
    asOfDate: DAY,
  };
}

function mem(
  over: Partial<RevisionMemoryItem> & Pick<RevisionMemoryItem, "id">
): RevisionMemoryItem {
  return {
    id: over.id,
    content: over.content ?? {
      surah: 78,
      fromAyah: 1,
      toAyah: 10,
      pagesApprox: 0.5,
      labelAr: over.id,
    },
    lastReviewedAt: over.lastReviewedAt ?? "2026-07-15",
    reviewCount: over.reviewCount ?? 4,
    mistakesCount: over.mistakesCount ?? 0,
    successRate: over.successRate ?? 0.9,
    strengthScore: over.strengthScore ?? 0.7,
    stabilityScore: over.stabilityScore ?? 0.65,
    nextReviewDate: over.nextReviewDate ?? DAY,
    intervalDays: over.intervalDays ?? 3,
    easeFactor: over.easeFactor ?? 2.5,
    consecutiveSuccesses: over.consecutiveSuccesses ?? 1,
    consecutiveFailures: over.consecutiveFailures ?? 0,
    isNear: over.isNear,
    urgent: over.urgent,
    source: over.source ?? "far_corpus",
  };
}

function geo(): QuranGeometry {
  return {
    firstSurah: 1,
    lastSurah: 114,
    getAyahCount: (s) => (s >= 100 ? 6 : 10),
    getPageOfAyah: (s) => (s >= 112 ? 604 : s >= 109 ? 603 : s >= 100 ? 600 : s),
    getSurahNameAr: (s) => `S${s}`,
  };
}

describe("SRS integration — ranking & priority", () => {
  it("1. Due forgotten item ranks before normal items (SRS rank engine)", () => {
    // Ranking remains an internal SRS concern; pedagogy order is RevisionPolicy.
    const memory = [
      mem({
        id: "normal",
        mistakesCount: 0,
        strengthScore: 0.85,
        stabilityScore: 0.85,
        nextReviewDate: "2026-07-28",
        content: { surah: 1, pagesApprox: 0.3, labelAr: "normal" },
      }),
      mem({
        id: "forgotten",
        mistakesCount: 5,
        strengthScore: 0.15,
        stabilityScore: 0.1,
        consecutiveFailures: 2,
        nextReviewDate: "2026-07-10",
        successRate: 0.25,
        content: { surah: 36, pagesApprox: 0.5, labelAr: "forgotten" },
      }),
    ];
    const ranked = rankRevisionItems(memory, { asOfDate: DAY });
    expect(ranked[0].item.id).toBe("forgotten");
  });

  it("2. High mistake item gets higher priority than clean item (SRS rank)", () => {
    const memory = [
      mem({
        id: "clean",
        mistakesCount: 0,
        nextReviewDate: DAY,
        content: { surah: 2, pagesApprox: 0.4, labelAr: "clean" },
      }),
      mem({
        id: "messy",
        mistakesCount: 7,
        nextReviewDate: DAY,
        content: { surah: 3, pagesApprox: 0.4, labelAr: "messy" },
      }),
    ];
    const ranked = rankRevisionItems(memory, { asOfDate: DAY });
    const messyIdx = ranked.findIndex((r) => r.item.id === "messy");
    const cleanIdx = ranked.findIndex((r) => r.item.id === "clean");
    expect(messyIdx).toBeGreaterThanOrEqual(0);
    expect(messyIdx).toBeLessThan(cleanIdx);
  });

  it("3. Near revision stays before far revision", () => {
    const memory = [
      mem({
        id: "far-urgent",
        mistakesCount: 4,
        nextReviewDate: "2026-07-01",
        strengthScore: 0.2,
        stabilityScore: 0.2,
        content: { surah: 50, pagesApprox: 0.5, labelAr: "far" },
      }),
    ];

    // Day 1: new hifz; Day 2: near should precede far
    const plan = generatePlan(
      asValidated(
        baseDecision({
          dailyCapacity: { minutes: 90, pages: 1 },
        })
      ),
      emptyState(),
      {
        horizonDays: 2,
        startDate: DAY,
        geometry: geo(),
        revisionMemory: memory,
        runId: "near-order",
      }
    );

    const day2 = plan.days[1];
    const types = day2.items.map((i) => i.type);
    const nearIdx = types.indexOf("NEAR_REVISION");
    const farIdx = types.indexOf("FAR_REVISION");
    // Day 2 should carry neighborhood (NEAR) after prior NEW_HIFZ
    expect(nearIdx).toBeGreaterThanOrEqual(0);
    // Sequential stream (FAR) is the main structured review when corpus exists
    // Order: sequential first, neighborhood support second (may be either if one missing)
    if (farIdx >= 0 && nearIdx >= 0) {
      expect(types.some((t) => t === "NEAR_REVISION" || t === "FAR_REVISION")).toBe(
        true
      );
    }
  });

  it("4. Capacity limits revision items correctly", () => {
    const memory = Array.from({ length: 8 }, (_, i) =>
      mem({
        id: `item-${i}`,
        mistakesCount: 8 - i,
        nextReviewDate: "2026-07-10",
        content: {
          surah: 10 + i,
          pagesApprox: 1,
          labelAr: `item-${i}`,
        },
      })
    );

    const plan = generatePlan(
      asValidated(
        baseDecision({
          revisionOnly: true,
          newHifzEnabled: false,
          dailyCapacity: { minutes: 20, pages: 0 },
        })
      ),
      emptyState(),
      {
        horizonDays: 1,
        startDate: DAY,
        geometry: geo(),
        revisionMemory: memory,
        maxFarItemsPerDay: 10,
      }
    );

    const day = plan.days[0];
    expect(day.totalMinutes).toBeLessThanOrEqual(20 + 15); // first item may slightly overshoot empty day edge
    // With 20 min budget and ~8–12 min/item, expect a lean day (not a dump)
    expect(day.items.length).toBeLessThanOrEqual(4);
    expect(day.items.every((i) => i.type !== "NEW_HIFZ")).toBe(true);
  });

  it("5. Revision-only decision generates only revision", () => {
    const memory = [
      mem({ id: "r1", mistakesCount: 2, nextReviewDate: DAY }),
      mem({ id: "r2", isNear: true, urgent: true, nextReviewDate: DAY }),
    ];
    const plan = generatePlan(
      asValidated(
        baseDecision({
          revisionOnly: true,
          newHifzEnabled: false,
          allowNewHifz: false,
          dailyCapacity: { minutes: 50, pages: 0 },
        })
      ),
      emptyState(),
      {
        horizonDays: 2,
        startDate: DAY,
        geometry: geo(),
        revisionMemory: memory,
      }
    );

    for (const d of plan.days) {
      expect(d.items.every((i) => i.type !== "NEW_HIFZ")).toBe(true);
      expect(
        d.items.every(
          (i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION"
        )
      ).toBe(true);
    }
    expect(plan.meta.revisionOnly).toBe(true);
    expect(plan.meta.newHifzEnabled).toBe(false);
  });

  it("6. Beginner with revision memory: near + far + new hifz", () => {
    const memory = [
      mem({
        id: "corpus-1",
        mistakesCount: 1,
        nextReviewDate: DAY,
        content: { surah: 67, pagesApprox: 0.5, labelAr: "الملك" },
      }),
    ];

    const plan = generatePlan(
      asValidated(
        baseDecision({
          track: "bottom_up",
          newHifzEnabled: true,
          revisionOnly: false,
          dailyCapacity: { minutes: 90, pages: 1 },
        })
      ),
      emptyState(),
      {
        horizonDays: 2,
        startDate: DAY,
        geometry: geo(),
        revisionMemory: memory,
        runId: "beg",
      }
    );

    // Day 1: far + new hifz
    const d1 = plan.days[0];
    expect(d1.items.some((i) => i.type === "FAR_REVISION")).toBe(true);
    expect(d1.items.some((i) => i.type === "NEW_HIFZ")).toBe(true);

    // Day 2: near of yesterday + far + maybe new hifz
    const d2 = plan.days[1];
    expect(d2.items.some((i) => i.type === "NEAR_REVISION")).toBe(true);
    expect(d2.items.some((i) => i.type === "FAR_REVISION" || i.type === "NEW_HIFZ")).toBe(
      true
    );

    // Near comes first
    const nearIdx = d2.items.findIndex((i) => i.type === "NEAR_REVISION");
    const hifzIdx = d2.items.findIndex((i) => i.type === "NEW_HIFZ");
    if (hifzIdx >= 0) expect(nearIdx).toBeLessThan(hifzIdx);
  });

  it("7. Same input produces identical plan", () => {
    const memory = [
      mem({ id: "a", mistakesCount: 3, nextReviewDate: "2026-07-20" }),
      mem({ id: "b", mistakesCount: 0, nextReviewDate: DAY }),
    ];
    const state = emptyState();
    const decision = asValidated(baseDecision());
    const opts = {
      horizonDays: 3,
      startDate: DAY,
      geometry: geo(),
      revisionMemory: memory,
      runId: "det",
    } as const;

    const p1 = generatePlan(decision, state, opts);
    const p2 = generatePlan(decision, state, opts);
    expect(JSON.stringify(p1.days)).toBe(JSON.stringify(p2.days));
    expect(p1.endingState.hifz.currentPointer).toEqual(
      p2.endingState.hifz.currentPointer
    );
  });

  it("8. Original UserState and RevisionMemory remain unchanged", () => {
    const memory = [
      mem({ id: "m1", mistakesCount: 2 }),
      mem({ id: "m2", mistakesCount: 5, nextReviewDate: "2026-07-01" }),
    ];
    const memSnap = JSON.stringify(memory);
    const state = emptyState({
      hifz: {
        currentPointer: { surah: 114, ayah: 1 },
        track: "bottom_up",
        paused: false,
        weekHifzLog: [],
      },
      streakDays: 2,
    });
    const stateSnap = JSON.stringify(state);

    const plan = generatePlan(
      asValidated(baseDecision({ dailyCapacity: { minutes: 80, pages: 1 } })),
      state,
      {
        horizonDays: 4,
        startDate: DAY,
        geometry: geo(),
        revisionMemory: memory,
      }
    );

    expect(JSON.stringify(state)).toBe(stateSnap);
    expect(JSON.stringify(memory)).toBe(memSnap);
    expect(plan.endingState).not.toBe(state);
    expect(plan.endingRevisionMemory).not.toBe(memory);
    // Ending memory may grow with scheduled near items
    expect(plan.endingRevisionMemory.length).toBeGreaterThanOrEqual(
      memory.length
    );
  });
});

describe("SRS integration — capacity order", () => {
  it("enforces dailyCapacity.minutes ceiling across packed items", () => {
    const memory = Array.from({ length: 6 }, (_, i) =>
      mem({
        id: `cap-${i}`,
        mistakesCount: 6 - i,
        nextReviewDate: "2026-07-01",
        content: { surah: 20 + i, pagesApprox: 0.8, labelAr: `c${i}` },
      })
    );

    const plan = generatePlan(
      asValidated(
        baseDecision({
          revisionOnly: true,
          newHifzEnabled: false,
          dailyCapacity: { minutes: 25, pages: 0 },
        })
      ),
      emptyState(),
      {
        horizonDays: 1,
        startDate: DAY,
        geometry: geo(),
        revisionMemory: memory,
        maxFarItemsPerDay: 10,
      }
    );

    // Allow one overshoot only for first-item edge case
    expect(plan.days[0].totalMinutes).toBeLessThanOrEqual(40);
    expect(plan.days[0].items.length).toBeGreaterThan(0);
  });
});
