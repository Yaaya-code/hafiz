import { describe, expect, it } from "vitest";
import {
  buildMemorizedPageSet,
  skipMemorizedToNextHifzPointer,
} from "./memorized-pages";
import { getExactPageOfAyah } from "./madani-page-map";

describe("skip-if-memorized (NEW_HIFZ)", () => {
  it("Baqarah fully memorized + from_start → lands after Baqarah (Imran)", () => {
    const sel = {
      mode: "SURAH" as const,
      surahSelections: [
        { surah: 1, strength: "GOOD" as const },
        { surah: 2, strength: "GOOD" as const },
      ],
      juzSelections: [],
    };
    const pages = buildMemorizedPageSet(sel);
    // Page 2 is Baqarah start — should be memorized
    expect(pages.has(2)).toBe(true);
    const next = skipMemorizedToNextHifzPointer({ surah: 2, ayah: 1 }, pages);
    // Must not stay on Baqarah pages
    expect(pages.has(next.page)).toBe(false);
    expect(next.surah).toBeGreaterThanOrEqual(3);
  });

  it("skips fully covered Kahf pages mid-journey (shared edge pages may stay)", () => {
    const sel = {
      mode: "SURAH" as const,
      surahSelections: [{ surah: 18, strength: "GOOD" as const }],
      juzSelections: [],
    };
    const pages = buildMemorizedPageSet(sel);
    expect(pages.size).toBeGreaterThan(0);
    // Land on a fully memorized Kahf page (e.g. mid surah)
    const mid = getExactPageOfAyah(18, 50);
    expect(pages.has(mid)).toBe(true);
    const land = skipMemorizedToNextHifzPointer(
      { surah: 18, ayah: 50 },
      pages
    );
    expect(pages.has(land.page)).toBe(false);
  });
});
