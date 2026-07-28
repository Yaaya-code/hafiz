import { describe, expect, it } from "vitest";
import {
  getAyahsOnPage,
  getMemorizationChunkByPages,
  getPageOfAyah,
} from "./page-boundaries";
import { hasMadaniMap } from "./madani-page-map";

describe("Exact Madani 604-page map", () => {
  it("has full offline map loaded", () => {
    expect(hasMadaniMap()).toBe(true);
  });

  it("matches classic Madani boundaries (user example table)", () => {
    // Page 1 = Fatiha 1–7
    expect(getPageOfAyah(1, 1)).toBe(1);
    expect(getPageOfAyah(1, 7)).toBe(1);
    // Page 2 = Baqarah 1–5
    expect(getPageOfAyah(2, 1)).toBe(2);
    expect(getPageOfAyah(2, 5)).toBe(2);
    // Page 3 = Baqarah 6–16
    expect(getPageOfAyah(2, 6)).toBe(3);
    expect(getPageOfAyah(2, 16)).toBe(3);
    // An-Nas on last page
    expect(getPageOfAyah(114, 6)).toBe(604);
  });

  it("1 page from Baqarah 1 = ayahs 1–5 (exact page 2)", () => {
    const chunk = getMemorizationChunkByPages(2, 1, 1);
    expect(chunk.startPage).toBe(2);
    expect(chunk.endPage).toBe(2);
    expect(chunk.fromAyah).toBe(1);
    expect(chunk.toAyah).toBe(5);
    expect(chunk.pages).toBe(1);
  });

  it("2 pages from Baqarah 1 covers pages 2–3", () => {
    const chunk = getMemorizationChunkByPages(2, 1, 2);
    expect(chunk.fromAyah).toBe(1);
    expect(chunk.toAyah).toBe(16); // through page 3
    expect(chunk.startPage).toBe(2);
    expect(chunk.endPage).toBe(3);
    expect(chunk.pages).toBe(2);
  });

  it("getAyahsOnPage(2) returns Baqarah 1–5", () => {
    const ayahs = getAyahsOnPage(2);
    expect(ayahs[0]?.surahNumber).toBe(2);
    expect(ayahs[0]?.ayahNumber).toBe(1);
    expect(ayahs[ayahs.length - 1]?.ayahNumber).toBe(5);
  });
});
