import { describe, expect, it } from "vitest";
import {
  buildHafizScoreFromSignals,
  buildRevisionQueueFromMemory,
  type MemoryRow,
} from "./learning-api-data";

describe("learning-api-data", () => {
  const memory: MemoryRow[] = [
    {
      id: "a",
      content: { surah: 2, fromAyah: 1, toAyah: 5, labelAr: "البقرة ١–٥" },
      strengthScore: 0.3,
      mistakesCount: 2,
      nextReviewDate: "2026-07-20",
      urgent: true,
      reviewCount: 3,
    },
    {
      id: "b",
      content: { surah: 112, fromAyah: 1, toAyah: 4 },
      strengthScore: 0.9,
      mistakesCount: 0,
      nextReviewDate: "2026-08-01",
      reviewCount: 5,
    },
    {
      id: "c",
      content: { surah: 1, page: 1 },
      strengthScore: 0.5,
      isNear: true,
      nextReviewDate: "2026-07-26",
    },
  ];

  it("ranks urgent memory first in revision queue", () => {
    const { queue, totalMemory } = buildRevisionQueueFromMemory(memory, {
      asOfDate: "2026-07-26",
      limit: 10,
    });
    expect(totalMemory).toBe(3);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].id).toBe("a");
    expect(queue[0].status).toBe("URGENT");
    expect(queue[0].label).toContain("البقرة");
  });

  it("returns empty queue for empty memory", () => {
    const { queue, predictive, totalMemory } = buildRevisionQueueFromMemory([]);
    expect(queue).toEqual([]);
    expect(predictive).toEqual([]);
    expect(totalMemory).toBe(0);
  });

  it("deduplicates same surah range with different ids", () => {
    const twin: MemoryRow[] = [
      {
        id: "a",
        content: {
          surah: 1,
          fromAyah: 1,
          toAyah: 7,
          labelAr: "الفاتحة",
        },
        strengthScore: 0.5,
        isNear: true,
        nextReviewDate: "2026-07-26",
      },
      {
        id: "b",
        content: {
          surah: 1,
          fromAyah: 1,
          toAyah: 7,
          labelAr: "الفاتحة",
        },
        strengthScore: 0.5,
        isNear: true,
        nextReviewDate: "2026-07-26",
      },
    ];
    const { queue, totalMemory } = buildRevisionQueueFromMemory(twin, {
      asOfDate: "2026-07-26",
      limit: 10,
    });
    expect(totalMemory).toBe(1);
    expect(queue.filter((q) => q.surah === 1).length).toBeLessThanOrEqual(1);
  });

  it("builds score in 0–1000 range from signals", () => {
    const result = buildHafizScoreFromSignals({
      revisionMemory: memory,
      streak: { current: 7, longest: 14, totalDays: 20 },
      mistakeHits: 3,
      practiceSessions: 12,
      journeyFinished: false,
      journeyCompletedSteps: 2,
      mutashabihatAccuracy: 70,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1000);
    expect(result.history.length).toBe(12);
    expect(result.streak).toBe(7);
    expect(result.tier.length).toBeGreaterThan(0);
  });

  it("returns score 0 and flat history for empty first-run signals", () => {
    const result = buildHafizScoreFromSignals({});
    expect(result.score).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.history.every((n) => n === 0)).toBe(true);
    expect(result.trend).toBe("stable");
  });
});
