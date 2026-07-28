import { describe, expect, it } from "vitest";
import {
  buildLearningQuiz,
  buildScopedQuiz,
  quizPassThreshold,
  QUIZ_MODES,
} from "./quiz-from-learning";
import {
  getAvailableQaris,
  INCOMPLETE_QARI_IDS,
  QARI_CDN_AUDIT,
  resolvePlayableQariId,
} from "./quran/audio";

describe("buildScopedQuiz (daily wird exam)", () => {
  it("only generates questions inside StartAyah–EndAyah", () => {
    const qs = buildScopedQuiz(2, 1, 16, 6);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(6);
    for (const q of qs) {
      expect(q.meta?.surahNumber).toBe(2);
      expect(q.meta?.ayahNumber).toBeGreaterThanOrEqual(1);
      expect(q.meta?.ayahNumber).toBeLessThanOrEqual(16);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      if (q.format !== "reorder") {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("returns empty for invalid empty range", () => {
    const qs = buildScopedQuiz(1, 100, 100, 3);
    expect(qs).toEqual([]);
  });

  it("can include reorder questions for wide ranges", () => {
    const qs = buildScopedQuiz(2, 1, 20, 8);
    // not guaranteed every run, but factory must support format
    const any = qs.find((q) => q.format === "reorder");
    if (any) {
      expect(any.reorderItems?.length).toBeGreaterThanOrEqual(3);
      expect(any.reorderItems?.length).toBeLessThanOrEqual(5);
    }
  });
});

describe("gamified multi-tier exam modes", () => {
  it("exposes all required product modes", () => {
    const kinds = QUIZ_MODES.map((m) => m.kind);
    expect(kinds).toContain("mutashabihat");
    expect(kinds).toContain("next_ayah_speed");
    expect(kinds).toContain("reorder");
    expect(kinds).toContain("identify_surah");
    expect(kinds).toContain("first_last");
    expect(kinds).toContain("hardcore");
    expect(kinds).toContain("mistakes");
    expect(kinds).toContain("custom_range");
  });

  it("builds questions for each core gamified kind", () => {
    for (const kind of [
      "mistakes",
      "next_ayah",
      "next_ayah_speed",
      "mutashabihat",
      "reorder",
      "first_last",
      "hardcore",
      "identify_surah",
      "daily",
      "weak",
    ] as const) {
      const qs = buildLearningQuiz(kind, null, 4);
      expect(qs.length, kind).toBeGreaterThan(0);
      for (const q of qs) {
        if (q.format === "reorder") {
          expect(q.reorderItems?.length).toBeGreaterThanOrEqual(3);
        } else {
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          expect(q.correct).toBeGreaterThanOrEqual(0);
          expect(q.correct).toBeLessThan(q.options.length);
        }
        if (kind === "next_ayah_speed") {
          expect(q.timeLimitSec).toBeGreaterThan(0);
        }
      }
    }
  });

  it("hardcore has stricter pass threshold", () => {
    expect(quizPassThreshold("hardcore")).toBe(0.8);
    expect(quizPassThreshold("next_ayah_speed")).toBe(0.7);
    expect(quizPassThreshold("daily")).toBe(0.6);
  });
});

describe("qari CDN procurement audit", () => {
  it("hides broken packs; Islam Sobhi is available (surah-mode)", () => {
    expect(INCOMPLETE_QARI_IDS.has("mustafa_ismail")).toBe(true);
    expect(INCOMPLETE_QARI_IDS.has("hazza_al_balushi")).toBe(true);
    expect(INCOMPLETE_QARI_IDS.has("islam_sobhi")).toBe(false);
    expect(getAvailableQaris().some((q) => q.id === "mustafa_ismail")).toBe(
      false
    );
    expect(getAvailableQaris().some((q) => q.id === "islam_sobhi")).toBe(true);
    expect(getAvailableQaris().some((q) => q.id === "hazza_al_balushi")).toBe(
      false
    );
    expect(resolvePlayableQariId("islam_sobhi")).toBe("islam_sobhi");
    expect(resolvePlayableQariId("hazza_al_balushi")).toBe("alafasy");
    expect(QARI_CDN_AUDIT.islam_sobhi.complete114).toBe(false);
    expect(QARI_CDN_AUDIT.hazza_al_balushi.complete114).toBe(false);
  });
});
