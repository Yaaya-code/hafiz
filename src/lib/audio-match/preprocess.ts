/**
 * Silence trimming for mobile recordings / reference clips.
 * Cuts leading & trailing quiet so DTW starts on speech, not mic pause.
 */

/** RMS per frame; returns trimmed mono PCM (copy). */
export function trimSilence(
  pcm: Float32Array,
  sampleRate: number,
  opts?: { frameMs?: number; thresholdRatio?: number; padMs?: number }
): Float32Array {
  if (!pcm.length) return new Float32Array(0);
  const frameMs = opts?.frameMs ?? 20;
  const thresholdRatio = opts?.thresholdRatio ?? 0.025;
  const padMs = opts?.padMs ?? 60;
  const frame = Math.max(1, Math.floor((sampleRate * frameMs) / 1000));
  const pad = Math.floor((sampleRate * padMs) / 1000);

  const nFrames = Math.floor(pcm.length / frame);
  if (nFrames < 2) return new Float32Array(pcm);

  let peak = 0;
  const rms = new Float64Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let sum = 0;
    const off = f * frame;
    for (let i = 0; i < frame; i++) {
      const v = pcm[off + i] || 0;
      sum += v * v;
    }
    const e = Math.sqrt(sum / frame);
    rms[f] = e;
    if (e > peak) peak = e;
  }
  if (peak < 1e-7) return new Float32Array(pcm);

  const thr = peak * thresholdRatio;
  let startF = 0;
  let endF = nFrames - 1;
  while (startF < nFrames && rms[startF] < thr) startF++;
  while (endF > startF && rms[endF] < thr) endF--;

  const start = Math.max(0, startF * frame - pad);
  const end = Math.min(pcm.length, (endF + 1) * frame + pad);
  if (end <= start) return new Float32Array(pcm);
  return new Float32Array(pcm.subarray(start, end));
}

/** Cepstral mean (and light variance) normalization across frames. */
export function cmvnFrames(frames: number[][]): number[][] {
  if (!frames.length) return frames;
  const dims = frames[0].length;
  const mean = new Float64Array(dims);
  for (const fr of frames) {
    for (let d = 0; d < dims; d++) mean[d] += fr[d];
  }
  for (let d = 0; d < dims; d++) mean[d] /= frames.length;

  const out: number[][] = [];
  for (const fr of frames) {
    const row = new Array(dims);
    for (let d = 0; d < dims; d++) row[d] = fr[d] - mean[d];
    out.push(row);
  }
  return out;
}
