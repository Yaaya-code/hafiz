/**
 * First-run score must be zero — no optimistic defaults.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
});

vi.stubGlobal("window", {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

import {
  buildLocalScoreInputs,
  computeLocalHafizScore,
  hasLocalScoreActivity,
  localScoreHistoryBars,
} from "./hafiz-score";
import { STORAGE_KEYS } from "@/lib/storage/safe-storage";

describe("hafiz-score first-run isolation", () => {
  beforeEach(() => {
    store.clear();
  });

  it("reports no activity on empty storage", () => {
    expect(hasLocalScoreActivity()).toBe(false);
  });

  it("score is 0 for brand-new empty user", () => {
    expect(computeLocalHafizScore()).toBe(0);
  });

  it("empty inputs neutralize mistakeRate bonus", () => {
    const inputs = buildLocalScoreInputs();
    expect(inputs.quizAccuracy).toBe(0);
    expect(inputs.revisionCompletion).toBe(0);
    expect(inputs.mutashabihatMastery).toBe(0);
    expect(inputs.mistakeRate).toBe(1);
  });

  it("history bars are zeros without timeline", () => {
    const bars = localScoreHistoryBars(0, 12);
    expect(bars).toHaveLength(12);
    expect(bars.every((n) => n === 0)).toBe(true);
  });

  it("score rises after real practice is stored", () => {
    store.set(
      STORAGE_KEYS.streak,
      JSON.stringify({
        current: 7,
        longest: 7,
        lastActiveDate: "2026-07-26",
        totalDays: 7,
      })
    );
    store.set(
      STORAGE_KEYS.memStats,
      JSON.stringify({
        totalListenSeconds: 100,
        totalPracticeSessions: 10,
        ayahsMastered: 2,
        audioMastered: 1,
        timeline: [{ date: "2026-07-26", listened: 2, practiced: 3, mastered: 1 }],
      })
    );
    expect(hasLocalScoreActivity()).toBe(true);
    expect(computeLocalHafizScore()).toBeGreaterThan(0);
  });

  it("engine-seeded revision memory alone does not inflate score (~205)", () => {
    // Plan generator seeds memory with strength defaults but reviewCount 0
    const seeded = [
      { strengthScore: 0.55, stabilityScore: 0.4, reviewCount: 0 },
      { strengthScore: 0.55, reviewCount: 0, mistakesCount: 0 },
    ];
    expect(hasLocalScoreActivity(seeded)).toBe(false);
    expect(computeLocalHafizScore(seeded)).toBe(0);
  });

  it("real reviewed memory counts as activity", () => {
    const practiced = [
      {
        strengthScore: 0.6,
        reviewCount: 2,
        lastReviewedAt: "2026-07-26",
      },
    ];
    expect(hasLocalScoreActivity(practiced)).toBe(true);
  });
});
