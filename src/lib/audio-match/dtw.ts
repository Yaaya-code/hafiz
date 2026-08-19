/**
 * DTW with Sakoe–Chiba band + path-length normalization.
 * Raw cumulative cost is divided by warping-path length so longer/slower
 * tilawah does not explode the distance vs a shorter reference.
 */

export type DtwResult = {
  /** Cumulative squared Euclidean cost along the path */
  cost: number;
  /** Number of steps on the warping path */
  pathLength: number;
  /** cost / pathLength */
  normalizedCost: number;
};

/**
 * Constrained DTW. windowRatio ∈ (0,1] — fraction of max(n,m) for the band.
 */
export function dtwPathNormalized(
  a: number[][],
  b: number[][],
  windowRatio = 0.25
): DtwResult {
  const n = a.length;
  const m = b.length;
  if (!n || !m) {
    return {
      cost: Number.POSITIVE_INFINITY,
      pathLength: 0,
      normalizedCost: Number.POSITIVE_INFINITY,
    };
  }

  const dims = a[0]?.length || 0;
  const band = Math.max(1, Math.floor(Math.max(n, m) * windowRatio));

  // DP: cost + path length (two rolling rows)
  const prevC = new Float64Array(m + 1);
  const currC = new Float64Array(m + 1);
  const prevL = new Float64Array(m + 1);
  const currL = new Float64Array(m + 1);
  prevC.fill(Number.POSITIVE_INFINITY);
  currC.fill(Number.POSITIVE_INFINITY);
  prevC[0] = 0;
  prevL[0] = 0;

  for (let i = 1; i <= n; i++) {
    currC.fill(Number.POSITIVE_INFINITY);
    currL.fill(0);
    const ai = a[i - 1];
    // Center of band mapped from i
    const jCenter = Math.floor(((i - 1) * (m - 1)) / Math.max(1, n - 1)) + 1;
    const jLo = Math.max(1, jCenter - band);
    const jHi = Math.min(m, jCenter + band);

    for (let j = jLo; j <= jHi; j++) {
      const bj = b[j - 1];
      let local = 0;
      for (let d = 0; d < dims; d++) {
        const diff = (ai[d] || 0) - (bj[d] || 0);
        local += diff * diff;
      }

      // predecessors: (i-1,j), (i,j-1), (i-1,j-1)
      let bestC = prevC[j];
      let bestL = prevL[j];
      if (currC[j - 1] < bestC) {
        bestC = currC[j - 1];
        bestL = currL[j - 1];
      }
      if (prevC[j - 1] < bestC) {
        bestC = prevC[j - 1];
        bestL = prevL[j - 1];
      }
      if (!Number.isFinite(bestC)) continue;
      currC[j] = bestC + local;
      currL[j] = bestL + 1;
    }
    prevC.set(currC);
    prevL.set(currL);
  }

  const cost = prevC[m];
  const pathLength = Math.max(1, prevL[m]);
  if (!Number.isFinite(cost)) {
    return {
      cost: Number.POSITIVE_INFINITY,
      pathLength: 0,
      normalizedCost: Number.POSITIVE_INFINITY,
    };
  }
  return {
    cost,
    pathLength,
    normalizedCost: cost / pathLength,
  };
}

/** @deprecated Prefer dtwPathNormalized — kept for tests of raw cumulative cost */
export function dtwDistance(a: number[][], b: number[][]): number {
  return dtwPathNormalized(a, b, 1).cost;
}

/**
 * Map path-normalized cost → similarity in [0,1].
 * Tuned so near-identical MFCC paths land high; random speech lands low.
 */
export function dtwSimilarity(a: number[][], b: number[][]): number {
  const { normalizedCost } = dtwPathNormalized(a, b, 0.3);
  if (!Number.isFinite(normalizedCost)) return 0;
  // Per-frame mean squared error across dims (after CMVN typically ~O(1–20))
  const rms = Math.sqrt(Math.max(0, normalizedCost));
  // Soft exponential calibration for spike UI (0–100% later = score*100)
  return Math.exp(-rms / 2.8);
}

/** Percent 0–100 from similarity score */
export function similarityPercent(score01: number): number {
  return Math.max(0, Math.min(100, Math.round(score01 * 100)));
}
