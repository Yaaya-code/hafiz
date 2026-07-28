import { describe, expect, it } from "vitest";
import {
  nextSequentialChunk,
  packSequentialRevision,
  sortRangesSequential,
} from "./sequential-revision";

describe("sequential revision", () => {
  it("finishes a surah before moving to the next", () => {
    const ranges = sortRangesSequential([
      { surah: 1, fromAyah: 1, toAyah: 7 },
      { surah: 2, fromAyah: 1, toAyah: 40 },
    ]);
    let cursor = { rangeIdx: 0, ayah: 1 };
    const surahs: number[] = [];
    for (let i = 0; i < 8; i++) {
      const { unit, nextCursor } = nextSequentialChunk(ranges, cursor);
      if (!unit) break;
      surahs.push(unit.surah);
      cursor = nextCursor;
    }
    // First pass: exhaust Fatiha before any Baqarah (wrap after full cycle is OK)
    const firstBaq = surahs.indexOf(2);
    expect(firstBaq).toBeGreaterThan(0);
    expect(surahs.slice(0, firstBaq).every((s) => s === 1)).toBe(true);
    let i = firstBaq;
    while (i < surahs.length && surahs[i] === 2) i++;
    // After leaving Baqarah only wrap to Fatiha is allowed (new cycle)
    if (i < surahs.length) {
      expect(surahs[i]).toBe(1);
    }
  });

  it("does not hop randomly across days", () => {
    const ranges = [
      { surah: 2, fromAyah: 1, toAyah: 100 },
      { surah: 5, fromAyah: 1, toAyah: 50 },
      { surah: 78, fromAyah: 1, toAyah: 40 },
    ];
    let cursor = { rangeIdx: 0, ayah: 1 };
    const daySurahs: number[][] = [];
    for (let d = 0; d < 5; d++) {
      const { units, nextCursor } = packSequentialRevision({
        ranges,
        cursor,
        maxMinutes: 25,
        maxItems: 2,
      });
      daySurahs.push(units.map((u) => u.surah));
      cursor = nextCursor;
    }
    // Early days should stay on Baqarah until its range progresses
    expect(daySurahs[0].every((s) => s === 2)).toBe(true);
  });

  it("advances ayah cursor across days (does not restart same chunk)", () => {
    const ranges = [{ surah: 2, fromAyah: 1, toAyah: 90 }];
    let cursor = { rangeIdx: 0, ayah: 1 };
    const starts: number[] = [];
    for (let d = 0; d < 3; d++) {
      const { units, nextCursor } = packSequentialRevision({
        ranges,
        cursor,
        maxMinutes: 20,
        maxItems: 1,
      });
      expect(units.length).toBeGreaterThan(0);
      starts.push(units[0].fromAyah);
      cursor = nextCursor;
    }
    // Day 2 and 3 must progress past day 1 start
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[2]).toBeGreaterThan(starts[1]);
  });
});
