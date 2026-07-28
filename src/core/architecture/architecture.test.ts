/**
 * Architecture baseline tests — Path Resolver, Map, Measurement, Strength, P7.
 */
import { describe, expect, it } from "vitest";
import {
  buildMemorizationMapFromProfile,
  deriveMemorizationState,
  resolveNewHifzPath,
  measureQuranRange,
  evaluateRegionStrength,
  classifyError,
  recordConfusion,
  buildMutashabihSupportSignals,
  computeAdaptation,
  composeDailyJourney,
  createArchitectureState,
  type EvidenceRecord,
} from "./index";
import { getDefaultProfile, type HafizProfile } from "@/lib/user-profile";

function profile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    ...getDefaultProfile(),
    onboardingComplete: true,
    completedAt: "2026-07-26T00:00:00.000Z",
    pagesPerDay: 1,
    dailyMinutes: 60,
    learningGoalId: "complete_quran",
    progressionMode: "continue_forward",
    memorizationSelection: {
      mode: "SURAH",
      surahSelections: [
        { surah: 1, strength: "STRONG" },
        { surah: 2, strength: "WEAK", fromAyah: 1, toAyah: 60 },
      ],
      juzSelections: [{ juz: 30, strength: "STRONG" }],
    },
    ...over,
  };
}

describe("P0 MemorizationMap", () => {
  it("Scenario 2: incomplete Baqarah continues at 61", () => {
    const map = buildMemorizationMapFromProfile(profile());
    const d = deriveMemorizationState(map);
    expect(d.suggestedContinuePointer).toEqual({ surahId: 2, ayah: 61 });
    expect(d.incompletePartials.some((p) => p.surahId === 2)).toBe(true);
    // Declared regions have UNKNOWN strength (not user WEAK as truth)
    const baq = map.regions.find((r) => r.surahId === 2);
    expect(baq?.strength).toBe("UNKNOWN");
  });
});

describe("P6 Path Resolver", () => {
  it("SYSTEM_GUIDED: continues incomplete Baqarah", () => {
    const p = profile();
    const arch = createArchitectureState(p);
    const path = resolveNewHifzPath({
      intent: { mode: "SYSTEM_GUIDED" },
      map: arch.memorizationMap,
      profile: p,
    });
    expect(path.newHifzPointer?.surahId).toBe(2);
    expect(path.newHifzPointer?.ayah).toBe(61);
    expect(path.source).toBe("incomplete_partial");
  });

  it("does not re-teach full Baqarah when declared complete", () => {
    const p = profile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [{ surah: 2, strength: "GOOD" }], // full surah
        juzSelections: [],
      },
    });
    const map = buildMemorizationMapFromProfile(p);
    // Stale cursor stuck at start of Baqarah (common bug)
    const path = resolveNewHifzPath({
      intent: { mode: "SYSTEM_GUIDED" },
      map,
      hifzCursor: { surah: 2, ayah: 1 },
      profile: p,
    });
    expect(path.newHifzPointer?.surahId).toBe(3);
    expect(path.newHifzPointer?.ayah).toBe(1);
  });

  it("middle-only map is ambiguous until preference set", () => {
    const map = buildMemorizationMapFromProfile(
      profile({
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [
            { surah: 18, strength: "GOOD" },
            { surah: 36, strength: "GOOD" },
          ],
          juzSelections: [],
        },
      })
    );
    const d = deriveMemorizationState(map);
    expect(d.journeyShape).toBe("middle_only");
    expect(d.ambiguity).toBe(true);
    expect(d.pathChoices?.length).toBeGreaterThanOrEqual(2);

    const withPref = resolveNewHifzPath({
      intent: { mode: "SYSTEM_GUIDED", pathPreference: "mushaf_end" },
      map,
    });
    expect(withPref.newHifzPointer?.surahId).toBe(114);

    const startPref = resolveNewHifzPath({
      intent: { mode: "SYSTEM_GUIDED", pathPreference: "mushaf_start" },
      map,
    });
    expect(startPref.newHifzPointer?.surahId).toBe(2);
  });

  it("Baqarah+Imran+Maidah+Amma → after Maidah (6), never Nas", () => {
    const p = profile({
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [
          { surah: 2, strength: "GOOD" },
          { surah: 3, strength: "GOOD" },
          { surah: 5, strength: "GOOD" },
        ],
        juzSelections: [{ juz: 30, strength: "STRONG" }],
      },
    });
    const map = buildMemorizationMapFromProfile(p);
    const d = deriveMemorizationState(map);
    expect(d.suggestedContinuePointer?.surahId).toBe(6);
    expect(d.suggestedContinuePointer?.surahId).not.toBe(114);

    const path = resolveNewHifzPath({
      intent: { mode: "SYSTEM_GUIDED" },
      map,
      profile: p,
    });
    expect(path.newHifzPointer?.surahId).toBe(6);
  });

  it("Scenario 3: EXTERNAL_TEACHER uses assignment", () => {
    const path = resolveNewHifzPath({
      intent: { mode: "EXTERNAL_TEACHER" },
      map: buildMemorizationMapFromProfile(profile()),
      externalAssignments: [
        {
          id: "a1",
          surahId: 18,
          fromAyah: 1,
          toAyah: 10,
          active: true,
          updatedAt: new Date().toISOString(),
          teacherLabel: "سورة الكهف 1–10",
        },
      ],
    });
    expect(path.source).toBe("external_assignment");
    expect(path.newHifzPointer).toEqual({ surahId: 18, ayah: 1 });
  });

  it("Scenario 1: FROM_SCRATCH defaults Amma", () => {
    const path = resolveNewHifzPath({
      intent: { mode: "FROM_SCRATCH" },
      map: { version: 1, regions: [], updatedAt: "" },
    });
    expect(path.newHifzPointer?.surahId).toBe(114);
  });
});

describe("P1 Measurement", () => {
  it("returns range from pointer with page capacity (ayahs are output)", () => {
    const m = measureQuranRange({
      startPointer: { surahId: 2, ayah: 61 },
      capacityPages: 1,
      direction: "forward",
    });
    expect(m).toBeTruthy();
    expect(m!.startPointer.surahId).toBe(2);
    expect(m!.endPointer.ayah).toBeGreaterThanOrEqual(m!.startPointer.ayah);
    expect(m!.pagesActual).toBeGreaterThan(0);
  });
});

describe("P5 Strength Engine", () => {
  it("Scenario 4/6: needs evidence trend, not one mistake", () => {
    const one: EvidenceRecord[] = [
      {
        id: "1",
        kind: "mistake",
        surahId: 2,
        fromAyah: 10,
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ];
    const e1 = evaluateRegionStrength(one, 2, 1, 60);
    expect(e1.strength).toBe("UNKNOWN");

    const many: EvidenceRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      kind: "revision_fail" as const,
      surahId: 2,
      fromAyah: 10,
      createdAt: `2026-07-2${i}T00:00:00.000Z`,
    }));
    const e2 = evaluateRegionStrength(many, 2, 1, 60);
    expect(["WEAK", "NEEDS_REVIEW"]).toContain(e2.strength);

    const improved: EvidenceRecord[] = [
      ...many,
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `ok-${i}`,
        kind: "revision_success" as const,
        surahId: 2,
        fromAyah: 10,
        quality: 4 as number,
        createdAt: `2026-07-2${i + 5}T00:00:00.000Z`,
      })),
    ];
    const e3 = evaluateRegionStrength(improved, 2, 1, 60);
    expect(["GOOD", "STRONG", "NEEDS_REVIEW"]).toContain(e3.strength);
  });
});

describe("P7 Mutashabihat", () => {
  it("Scenario 5: similarity confusion needs 2+ occurrences for signal", () => {
    let conf = recordConfusion([], {
      category: "similarity_confusion",
      surahId: 2,
      ayah: 35,
      relatedSurahId: 7,
      relatedAyah: 19,
    });
    expect(buildMutashabihSupportSignals(conf).length).toBe(0);
    conf = recordConfusion(conf, {
      category: "similarity_confusion",
      surahId: 2,
      ayah: 35,
      relatedSurahId: 7,
      relatedAyah: 19,
    });
    const signals = buildMutashabihSupportSignals(conf);
    expect(signals.length).toBe(1);
    expect(signals[0].reasonAr).toBeTruthy();
    expect(classifyError({
      expectedSurah: 2,
      expectedAyah: 35,
      producedSurah: 7,
      producedAyah: 19,
    })).toBe("similarity_confusion");
  });
});

describe("P3 Day Composer + P8 Adaptation", () => {
  it("composes journey without Near/Far labels", () => {
    const journey = composeDailyJourney({
      date: "2026-07-26",
      path: {
        mode: "SYSTEM_GUIDED",
        newHifzPointer: { surahId: 2, ayah: 61 },
        source: "incomplete_partial",
        reasonAr: "نكمل البقرة",
      },
      capacity: { newHifzPages: 1, revisionPages: 3 },
      newHifz: null,
      planItems: [
        {
          id: "r1",
          type: "FAR_REVISION",
          surah: 2,
          estimatedMinutes: 12,
          labelAr: "مراجعة: البقرة 1–15",
          priorityReasons: ["تثبيت الحفظ", "stabilize_primary"],
          sourceRange: { surah: 2, fromAyah: 1, toAyah: 15 },
        },
        {
          id: "h1",
          type: "NEW_HIFZ",
          surah: 2,
          estimatedMinutes: 12,
          labelAr: "البقرة 61–70",
          sourceRange: { surah: 2, fromAyah: 61, toAyah: 70 },
        },
      ],
    });
    expect(journey.steps.some((s) => s.kind === "revision")).toBe(true);
    expect(journey.steps.some((s) => s.kind === "new_hifz")).toBe(true);
    expect(journey.steps.every((s) => !/قريبة|بعيدة/.test(s.titleAr))).toBe(
      true
    );
  });

  it("adaptation eases load after failure streak", () => {
    const evidence: EvidenceRecord[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      kind: "revision_fail" as const,
      createdAt: `2026-07-2${i}T00:00:00.000Z`,
    }));
    const a = computeAdaptation(evidence);
    expect(a.difficultyBalance).toBe("ease");
    expect(a.revisionExposure).toBe("intensive");
  });
});
