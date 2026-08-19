import { describe, expect, it } from "vitest";
import { dtwDistance, dtwSimilarity } from "./dtw";

describe("dtw", () => {
  it("identical sequences → high similarity", () => {
    const a = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    expect(dtwDistance(a, a)).toBe(0);
    expect(dtwSimilarity(a, a)).toBeGreaterThan(0.9);
  });

  it("very different sequences → lower similarity", () => {
    const a = [
      [0, 0],
      [0, 0],
    ];
    const b = [
      [5, 5],
      [5, 5],
      [5, 5],
    ];
    expect(dtwSimilarity(a, b)).toBeLessThan(dtwSimilarity(a, a));
  });
});
