import { describe, expect, it } from "vitest";
import {
  dtwDistance,
  dtwPathNormalized,
  dtwSimilarity,
  similarityPercent,
} from "./dtw";

describe("dtw path-normalized", () => {
  it("identical sequences → cost 0, high similarity", () => {
    const a = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const r = dtwPathNormalized(a, a, 1);
    expect(r.cost).toBe(0);
    expect(r.normalizedCost).toBe(0);
    expect(dtwSimilarity(a, a)).toBeGreaterThan(0.9);
    expect(similarityPercent(dtwSimilarity(a, a))).toBeGreaterThanOrEqual(90);
  });

  it("length difference does not explode normalized cost vs raw product norm", () => {
    const short = [
      [1, 0],
      [0, 1],
    ];
    const long = [
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 1],
      [1, 1],
    ];
    const r = dtwPathNormalized(short, long, 1);
    expect(Number.isFinite(r.normalizedCost)).toBe(true);
    expect(r.pathLength).toBeGreaterThan(0);
  });

  it("very different sequences → lower similarity than identical", () => {
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

  it("dtwDistance stays available", () => {
    const a = [[1], [2]];
    expect(dtwDistance(a, a)).toBe(0);
  });
});
