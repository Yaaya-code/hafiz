/**
 * Classic DTW distance between two feature sequences (frames × dims).
 * Lean O(n*m) — keep clips short in the spike (a few seconds).
 */

export function dtwDistance(a: number[][], b: number[][]): number {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return Number.POSITIVE_INFINITY;

  const dims = a[0]?.length || 0;
  const prev = new Float64Array(m + 1);
  const curr = new Float64Array(m + 1);
  prev.fill(Number.POSITIVE_INFINITY);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    curr[0] = Number.POSITIVE_INFINITY;
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const bj = b[j - 1];
      let cost = 0;
      for (let d = 0; d < dims; d++) {
        const diff = (ai[d] || 0) - (bj[d] || 0);
        cost += diff * diff;
      }
      const best = Math.min(prev[j], curr[j - 1], prev[j - 1]);
      curr[j] = best + cost;
    }
    prev.set(curr);
  }
  return prev[m];
}

/** Length-normalized score in ~[0,1] where 1 ≈ closest match. */
export function dtwSimilarity(a: number[][], b: number[][]): number {
  const dist = dtwDistance(a, b);
  if (!Number.isFinite(dist)) return 0;
  const norm = dist / (a.length * b.length + 1e-9);
  // Soft map — calibrated later with real tilawah samples
  return 1 / (1 + norm);
}
