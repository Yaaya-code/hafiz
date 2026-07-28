/**
 * Decision validator — report-only consistency checks.
 */

import { describe, expect, it } from "vitest";
import type { Decision } from "./types";
import { validateDecision, isDecisionValid } from "./decision-validator";

function baseDecision(over: Partial<Decision> = {}): Decision {
  return {
    track: "unspecified",
    newHifzEnabled: true,
    revisionOnly: false,
    dailyCapacity: { minutes: 30, pages: 1 },
    additionalListeningPractice: false,
    additionalMistakeReview: false,
    revisionScheduleEnabled: true,
    allowNewHifz: true,
    lockProgression: false,
    strengtheningRequired: false,
    strengtheningArea: null,
    suggestedCapacityChange: null,
    revisionPriority: false,
    recommendedRevision: null,
    recoveryRequired: false,
    recoveryScope: null,
    stabilityGatePassed: true,
    appliedRules: ["S-004"],
    reasons: [
      {
        code: "test",
        ruleId: "S-004",
        message: "ok",
        severity: "hard",
      },
    ],
    effects: [],
    conflicts: [],
    warnings: [],
    trackMeta: {},
    ...over,
  };
}

describe("validateDecision", () => {
  it("accepts a consistent open Decision", () => {
    const v = validateDecision(baseDecision());
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it("flags newHifzEnabled + revisionOnly both true", () => {
    const v = validateDecision(
      baseDecision({ newHifzEnabled: true, revisionOnly: true })
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes("revisionOnly"))).toBe(true);
  });

  it("flags recoveryRequired + allowNewHifz", () => {
    const v = validateDecision(
      baseDecision({
        recoveryRequired: true,
        allowNewHifz: true,
        newHifzEnabled: false,
        revisionOnly: true,
      })
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes("recoveryRequired"))).toBe(true);
  });

  it("flags negative capacity", () => {
    const v = validateDecision(
      baseDecision({
        dailyCapacity: { minutes: -5, pages: -1 },
      })
    );
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("flags stability gate fail with progression allowed", () => {
    const v = validateDecision(
      baseDecision({
        stabilityGatePassed: false,
        newHifzEnabled: true,
        allowNewHifz: true,
        lockProgression: false,
      })
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes("stabilityGatePassed"))).toBe(true);
  });

  it("does not mutate the Decision object", () => {
    const d = baseDecision({ newHifzEnabled: true, revisionOnly: true });
    const before = JSON.stringify(d);
    validateDecision(d);
    expect(JSON.stringify(d)).toBe(before);
  });

  it("isDecisionValid mirrors valid flag", () => {
    expect(isDecisionValid(baseDecision())).toBe(true);
    expect(
      isDecisionValid(baseDecision({ newHifzEnabled: true, revisionOnly: true }))
    ).toBe(false);
  });
});
