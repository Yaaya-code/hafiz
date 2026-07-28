/**
 * Quran Chunk Engine tests — geometry only.
 */

import { describe, expect, it } from "vitest";
import {
  advancePointer,
  createNextHifzChunk,
  normalizePointer,
  remainingSurahPages,
} from "./chunk-engine";
import { createMetadataQuranGeometry } from "./default-geometry";
import type { QuranGeometry, QuranPointer } from "./types";

/** Deterministic in-memory geometry for precise page control in tests. */
function mockGeometry(): QuranGeometry {
  // Page map (illustrative, deterministic):
  // 114,113,112 share page 604 (short bundle)
  // 111,110,109 share page 603
  // Surah 2 is long: pages 2–49 via interpolation
  const ayahCounts: Record<number, number> = {
    1: 7,
    2: 286,
    109: 6,
    110: 3,
    111: 5,
    112: 4,
    113: 5,
    114: 6,
  };
  const pages: Record<string, number> = {};
  for (let a = 1; a <= 6; a++) pages[`114:${a}`] = 604;
  for (let a = 1; a <= 5; a++) pages[`113:${a}`] = 604;
  for (let a = 1; a <= 4; a++) pages[`112:${a}`] = 604;
  for (let a = 1; a <= 5; a++) pages[`111:${a}`] = 603;
  for (let a = 1; a <= 3; a++) pages[`110:${a}`] = 603;
  for (let a = 1; a <= 6; a++) pages[`109:${a}`] = 603;
  // Long surah 2: 10 ayahs per page starting page 2
  for (let a = 1; a <= 286; a++) {
    pages[`2:${a}`] = 2 + Math.floor((a - 1) / 10);
  }
  for (let a = 1; a <= 7; a++) pages[`1:${a}`] = 1;

  const names: Record<number, string> = {
    1: "الفاتحة",
    2: "البقرة",
    109: "الكافرون",
    110: "النصر",
    111: "المسد",
    112: "الإخلاص",
    113: "الفلق",
    114: "الناس",
  };

  return {
    firstSurah: 1,
    lastSurah: 114,
    getAyahCount: (s) => ayahCounts[s] ?? 0,
    getPageOfAyah: (s, a) => pages[`${s}:${a}`] ?? 1,
    getSurahNameAr: (s) => names[s] ?? String(s),
  };
}

describe("chunk-engine short surah bundling", () => {
  it("1. Short surah bundling works (An-Nas not alone when capacity=1 page)", () => {
    const g = mockGeometry();
    const pointer: QuranPointer = { surahNumber: 114, ayahNumber: 1 };
    const chunk = createNextHifzChunk(
      pointer,
      { pages: 1 },
      g,
      { direction: "backward" }
    );

    expect(chunk).not.toBeNull();
    // Must combine multiple short surahs on page 604
    expect(chunk!.surahRange.toSurah).toBe(114);
    expect(chunk!.surahRange.fromSurah).toBeLessThan(114);
    // At least An-Nas + Al-Falaq + Al-Ikhlas (112–114)
    expect(chunk!.surahRange.fromSurah).toBeLessThanOrEqual(112);
    expect(chunk!.pages).toBeLessThanOrEqual(1);
    expect(chunk!.startPointer.surahNumber).toBe(114);
    // Should not be An-Nas only
    expect(
      chunk!.startPointer.surahNumber === chunk!.endPointer.surahNumber &&
        chunk!.endPointer.surahNumber === 114
    ).toBe(false);
  });
});

describe("chunk-engine long surah split", () => {
  it("2. Long surah splits by pages", () => {
    const g = mockGeometry();
    const pointer: QuranPointer = { surahNumber: 2, ayahNumber: 1 };
    const chunk = createNextHifzChunk(
      pointer,
      { pages: 1 },
      g,
      { direction: "forward" }
    );

    expect(chunk).not.toBeNull();
    expect(chunk!.startPointer.surahNumber).toBe(2);
    expect(chunk!.endPointer.surahNumber).toBe(2);
    expect(chunk!.pages).toBeLessThanOrEqual(1);
    // 10 ayahs per page in mock → ayahs 1–10 on page 2
    expect(chunk!.endPointer.ayahNumber).toBe(10);
    expect(chunk!.startPointer.ayahNumber).toBe(1);

    // Second page
    const nextPtr = advancePointer(pointer, chunk!, g, {
      direction: "forward",
    });
    const chunk2 = createNextHifzChunk(nextPtr, { pages: 1 }, g, {
      direction: "forward",
    });
    expect(chunk2!.startPointer.ayahNumber).toBe(11);
    expect(chunk2!.endPointer.ayahNumber).toBe(20);
  });
});

describe("pointer advancement", () => {
  it("3. Pointer advances correctly after short bundle", () => {
    const g = mockGeometry();
    const pointer: QuranPointer = { surahNumber: 114, ayahNumber: 1 };
    const chunk = createNextHifzChunk(
      pointer,
      { pages: 1 },
      g,
      { direction: "backward" }
    )!;

    const next = advancePointer(pointer, chunk, g, { direction: "backward" });
    // After 112–114 on page 604, next is 111 (Al-Masad) ayah 1
    expect(next.surahNumber).toBe(chunk.surahRange.fromSurah - 1);
    expect(next.ayahNumber).toBe(1);
    // Example path toward Al-Kafirun (109) after another page
    const chunk2 = createNextHifzChunk(next, { pages: 1 }, g, {
      direction: "backward",
    })!;
    const after2 = advancePointer(next, chunk2, g, { direction: "backward" });
    expect(after2.surahNumber).toBeLessThan(next.surahNumber);
  });

  it("3b. Forward long-surah pointer advances within surah", () => {
    const g = mockGeometry();
    const pointer: QuranPointer = { surahNumber: 2, ayahNumber: 1 };
    const chunk = createNextHifzChunk(pointer, { pages: 1 }, g)!;
    const next = advancePointer(pointer, chunk, g, { direction: "forward" });
    expect(next.surahNumber).toBe(2);
    expect(next.ayahNumber).toBe(chunk.endPointer.ayahNumber + 1);
  });
});

describe("determinism & immutability", () => {
  it("4. Same input always returns deterministic chunk", () => {
    const g = mockGeometry();
    const pointer: QuranPointer = { surahNumber: 114, ayahNumber: 1 };
    const a = createNextHifzChunk(pointer, { pages: 1, minutes: 20 }, g, {
      direction: "backward",
    });
    const b = createNextHifzChunk(pointer, { pages: 1, minutes: 20 }, g, {
      direction: "backward",
    });
    expect(a).toEqual(b);

    const meta = createMetadataQuranGeometry();
    const c1 = createNextHifzChunk(
      { surahNumber: 2, ayahNumber: 1 },
      { pages: 1 },
      meta
    );
    const c2 = createNextHifzChunk(
      { surahNumber: 2, ayahNumber: 1 },
      { pages: 1 },
      meta
    );
    expect(c1).toEqual(c2);
  });

  it("5. Original pointer is not mutated", () => {
    const g = mockGeometry();
    const pointer: QuranPointer = { surahNumber: 114, ayahNumber: 1 };
    const frozen = { ...pointer };

    const chunk = createNextHifzChunk(pointer, { pages: 1 }, g, {
      direction: "backward",
    })!;
    const next = advancePointer(pointer, chunk, g, { direction: "backward" });

    expect(pointer).toEqual(frozen);
    expect(pointer.surahNumber).toBe(114);
    expect(pointer.ayahNumber).toBe(1);
    // next is a different object
    expect(next).not.toBe(pointer);
    expect(next.surahNumber).not.toBe(114);
  });
});

describe("normalize / remaining helpers", () => {
  it("normalizePointer clamps overflow ayah into next surah", () => {
    const g = mockGeometry();
    const n = normalizePointer({ surahNumber: 1, ayahNumber: 99 }, g);
    expect(n.surahNumber).toBe(2);
    expect(n.ayahNumber).toBe(1);
  });

  it("remainingSurahPages is positive for An-Nas", () => {
    const g = mockGeometry();
    const rem = remainingSurahPages(g, { surahNumber: 114, ayahNumber: 1 });
    expect(rem).toBeGreaterThan(0);
    expect(rem).toBeLessThanOrEqual(1);
  });
});
