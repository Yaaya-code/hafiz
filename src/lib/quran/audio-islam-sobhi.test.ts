import { describe, expect, it } from "vitest";
import {
  ayahAudioUrl,
  getAvailableQaris,
  getQari,
  qariPreviewAudioUrl,
  resolvePlayableQariId,
} from "./audio";

describe("Islam Sobhi integration", () => {
  it("is listed in available qaris", () => {
    expect(getAvailableQaris().some((q) => q.id === "islam_sobhi")).toBe(true);
    expect(resolvePlayableQariId("islam_sobhi")).toBe("islam_sobhi");
  });

  it("uses mp3quran surah file for available surahs", () => {
    const url = ayahAudioUrl("islam_sobhi", 2, 16);
    expect(url).toContain("server14.mp3quran.net/islam");
    expect(url).toMatch(/002\.mp3$/);
    // same surah → same file regardless of ayah
    expect(ayahAudioUrl("islam_sobhi", 2, 1)).toBe(url);
  });

  it("falls back to Alafasy verse URL for missing surahs", () => {
    for (const s of [37, 39, 40, 45, 65]) {
      const url = ayahAudioUrl("islam_sobhi", s, 1);
      expect(url).toContain("everyayah.com");
      expect(url).toContain("Alafasy");
    }
  });

  it("preview uses Fatiha surah file", () => {
    const q = getQari("islam_sobhi")!;
    expect(q.playbackMode).toBe("surah");
    expect(qariPreviewAudioUrl("islam_sobhi")).toMatch(/001\.mp3$/);
  });
});
