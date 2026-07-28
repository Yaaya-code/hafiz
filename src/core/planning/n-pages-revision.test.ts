/**
 * N-page sequential revision — no gaps, exact N, wrap, Fatiha included.
 */
import { describe, expect, it } from "vitest";
import { createDefaultQuranGeometry } from "./quran/default-geometry";
import {
  defaultSequentialCursor,
  mergeConsecutiveSameSurahUnits,
  packSequentialRevision,
  sortRangesSequential,
} from "./sequential-revision";
import { packRevisionDay } from "./day-revision-packer";
import { getPageOfAyah } from "@/lib/quran/page-boundaries";

const geo = createDefaultQuranGeometry();

describe("N-pages sequential — no gaps", () => {
  it("packs N=3 consecutive Madani pages without skipping", () => {
    const ranges = [{ surah: 2, fromAyah: 1, toAyah: 100 }];
    const day1 = packSequentialRevision({
      ranges,
      cursor: { rangeIdx: 0, ayah: 1 },
      targetPages: 3,
      geometry: geo,
    });
    expect(day1.pagesPacked).toBe(3);
    expect(day1.pageIds).toEqual([2, 3, 4]); // Baqarah starts page 2

    const day2 = packSequentialRevision({
      ranges,
      cursor: day1.nextCursor,
      targetPages: 3,
      geometry: geo,
    });
    // Must continue at page 5, not skip to 6
    expect(day2.pageIds[0]).toBe(5);
    expect(day2.pageIds).toEqual([5, 6, 7]);
  });

  it("day stream never leaves a hole between consecutive days", () => {
    // Long enough for 5 days × 3 pages without wrapping
    const ranges = [{ surah: 2, fromAyah: 1, toAyah: 200 }];
    let cursor = { rangeIdx: 0, ayah: 1 };
    const allPages: number[] = [];
    for (let d = 0; d < 5; d++) {
      const pack = packSequentialRevision({
        ranges,
        cursor,
        targetPages: 3,
        geometry: geo,
      });
      expect(pack.pagesPacked).toBe(3);
      allPages.push(...pack.pageIds);
      cursor = pack.nextCursor;
    }
    // Strictly increasing by 1 with no duplicates or holes
    for (let i = 1; i < allPages.length; i++) {
      expect(allPages[i]).toBe(allPages[i - 1] + 1);
    }
  });

  it("multi-surah same page counts as ONE face toward N", () => {
    // Page 587 = Infitar + start Mutaffifin
    const ranges = [
      { surah: 82, fromAyah: 1, toAyah: 19 },
      { surah: 83, fromAyah: 1, toAyah: 36 },
    ];
    const pack = packSequentialRevision({
      ranges,
      cursor: { rangeIdx: 0, ayah: 1 },
      targetPages: 3,
      geometry: geo,
    });
    expect(pack.pageIds[0]).toBe(587);
    // 587 may have 2 units but only one page id
    expect(pack.pageIds.filter((p) => p === 587).length).toBe(1);
    expect(pack.pagesPacked).toBe(3);
    // Must include 588 (Mutaffifin 7–34) — not jump to 589
    expect(pack.pageIds).toContain(588);
    expect(pack.pageIds).toEqual([587, 588, 589]);
  });

  it("starts at Fatiha when map includes it (mushaf order)", () => {
    const ranges = sortRangesSequential([
      { surah: 1, fromAyah: 1, toAyah: 7 },
      { surah: 2, fromAyah: 1, toAyah: 30 },
      { surah: 78, fromAyah: 1, toAyah: 40 },
    ]);
    const cur = defaultSequentialCursor(ranges, 2); // preferred primary ignored
    expect(cur.rangeIdx).toBe(0);
    expect(ranges[0].surah).toBe(1);
    const pack = packSequentialRevision({
      ranges,
      cursor: cur,
      targetPages: 2,
      geometry: geo,
    });
    expect(pack.units[0].surah).toBe(1);
  });

  it("merges consecutive same-surah units into one span with page range label", () => {
    const pack = packSequentialRevision({
      ranges: [{ surah: 2, fromAyah: 1, toAyah: 40 }],
      cursor: { rangeIdx: 0, ayah: 1 },
      targetPages: 3,
      geometry: geo,
    });
    // Before merge: multiple page units
    expect(pack.units.length).toBeGreaterThanOrEqual(2);
    const tagged = pack.units.map((u) => ({
      ...u,
      role: "stabilize_primary" as const,
      internalTier: "far" as const,
    }));
    const merged = mergeConsecutiveSameSurahUnits(tagged, geo);
    expect(merged.length).toBe(1);
    expect(merged[0].surah).toBe(2);
    expect(merged[0].fromAyah).toBe(1);
    expect(merged[0].toAyah).toBeGreaterThan(merged[0].fromAyah);
    // Label includes page range ص From–To
    expect(merged[0].labelAr).toContain("ص");
    expect(merged[0].labelAr.includes("1–") || merged[0].labelAr.includes("1-")).toBe(
      true
    );
  });

  it("packRevisionDay does not advance cursor past trimmed content (N=3)", () => {
    const ranges = [{ surah: 2, fromAyah: 1, toAyah: 100, strengthScore: 0.4 }];
    const day1 = packRevisionDay({
      hifzPointer: { surah: 2, ayah: 31 },
      memorizedRanges: ranges,
      revisionMinutes: 25, // tight minutes
      revisionPages: 3,
      horizonCursor: { stabilizeAyah: 1, corpus: { rangeIdx: 0, ayah: 1 } },
      geometry: geo,
      dayNumber: 1,
      runId: "gap-test",
    });
    const rev1 = day1.items.filter(
      (i) => i.type === "FAR_REVISION" || i.type === "NEAR_REVISION"
    );
    // After merge: one span may cover multiple pages — count by page endpoints
    const lastPageDay1 = Math.max(
      ...rev1.map((i) =>
        getPageOfAyah(i.surah!, i.sourceRange!.toAyah!)
      )
    );
    const firstPageDay1 = Math.min(
      ...rev1.map((i) =>
        getPageOfAyah(i.surah!, i.sourceRange!.fromAyah!)
      )
    );
    expect(lastPageDay1 - firstPageDay1 + 1).toBeGreaterThanOrEqual(3);

    const day2 = packRevisionDay({
      hifzPointer: { surah: 2, ayah: 31 },
      memorizedRanges: ranges,
      revisionMinutes: 25,
      revisionPages: 3,
      horizonCursor: day1.nextCursor,
      geometry: geo,
      dayNumber: 2,
      runId: "gap-test",
    });
    const firstDay2 = day2.items.find(
      (i) => i.type === "FAR_REVISION" || i.type === "NEAR_REVISION"
    );
    const p2 = getPageOfAyah(
      firstDay2!.surah!,
      firstDay2!.sourceRange!.fromAyah!
    );
    // Day2 must start at last(day1)+1 — no hole
    expect(p2).toBe(lastPageDay1 + 1);
  });
});
