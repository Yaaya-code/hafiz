import { describe, expect, it } from "vitest";
import {
  buildManualWird,
  isPlanEngineDisabled,
  manualWirdSessionHref,
  profileWithAutomaticPlan,
  profileWithManualWird,
} from "./usage-track";
import { getDefaultProfile } from "./user-profile";

describe("manual wird (EXTERNAL_TRACKER)", () => {
  it("clamps ayah range inside surah bounds", () => {
    const w = buildManualWird({ surah: 1, fromAyah: 1, toAyah: 99 });
    expect(w.surah).toBe(1);
    expect(w.fromAyah).toBe(1);
    expect(w.toAyah).toBe(7); // Fatiha
    expect(w.labelAr).toContain("الفاتحة");
  });

  it("builds session deep-link with from/to", () => {
    const w = buildManualWird({ surah: 2, fromAyah: 1, toAyah: 16 });
    const href = manualWirdSessionHref(w);
    expect(href).toContain("surah=2");
    expect(href).toContain("from=1");
    expect(href).toContain("to=16");
    expect(href).toContain("/session/revision");
  });

  it("profileWithManualWird sets EXTERNAL_TRACKER flags", () => {
    const p = profileWithManualWird(
      getDefaultProfile(),
      buildManualWird({ surah: 18, fromAyah: 1, toAyah: 10 })
    );
    expect(p.usageTrack).toBe("EXTERNAL_TRACKER");
    expect(p.hasActivePlan).toBe(false);
    expect(p.manualWird?.surah).toBe(18);
    expect(isPlanEngineDisabled(p.usageTrack)).toBe(true);
  });
});

describe("FREE_EXPLORER → AUTOMATIC_PLAN", () => {
  it("profileWithAutomaticPlan enables engine", () => {
    const free = {
      ...getDefaultProfile(),
      usageTrack: "FREE_EXPLORER" as const,
      hasActivePlan: false,
      pagesPerDay: 0,
    };
    const next = profileWithAutomaticPlan(free);
    expect(next.usageTrack).toBe("AUTOMATIC_PLAN");
    expect(next.hasActivePlan).toBe(true);
    expect(next.pagesPerDay).toBeGreaterThanOrEqual(1);
    expect(isPlanEngineDisabled(next.usageTrack, next.hasActivePlan)).toBe(
      false
    );
  });
});
