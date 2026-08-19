/**
 * Lightweight MFCC feature extraction for browser spike.
 * Not a research-grade frontend — enough to prototype tilawah similarity.
 */

const DEFAULT_SR = 16000;
const FRAME = 512;
const HOP = 160;
const N_MELS = 26;
const N_MFCC = 13;

function hzToMel(hz: number) {
  return 2595 * Math.log10(1 + hz / 700);
}
function melToHz(mel: number) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

function createMelFilterbank(
  sr: number,
  nFft: number,
  nMels: number
): Float64Array[] {
  const fMin = 0;
  const fMax = sr / 2;
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);
  const points = new Float64Array(nMels + 2);
  for (let i = 0; i < points.length; i++) {
    points[i] = melToHz(melMin + ((melMax - melMin) * i) / (nMels + 1));
  }
  const bins = new Int32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    bins[i] = Math.floor(((nFft + 1) * points[i]) / sr);
  }
  const filters: Float64Array[] = [];
  const nBins = (nFft >> 1) + 1;
  for (let m = 1; m <= nMels; m++) {
    const f = new Float64Array(nBins);
    const left = bins[m - 1];
    const center = bins[m];
    const right = bins[m + 1];
    for (let k = left; k < center; k++) {
      if (k >= 0 && k < nBins && center !== left) {
        f[k] = (k - left) / (center - left);
      }
    }
    for (let k = center; k < right; k++) {
      if (k >= 0 && k < nBins && right !== center) {
        f[k] = (right - k) / (right - center);
      }
    }
    filters.push(f);
  }
  return filters;
}

/** In-place radix-2 FFT (real → complex interleaved). n must be power of 2. */
function fftRadix2(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
}

function hamming(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return w;
}

function dct(input: Float64Array, nCoeff: number): number[] {
  const n = input.length;
  const out: number[] = [];
  for (let k = 0; k < nCoeff; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos((Math.PI * k * (i + 0.5)) / n);
    }
    out.push(sum);
  }
  return out;
}

/** Resample mono PCM to targetSr with linear interpolation. */
export function resampleLinear(
  input: Float32Array,
  fromSr: number,
  toSr: number
): Float32Array {
  if (fromSr === toSr) return new Float32Array(input);
  const ratio = fromSr / toSr;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = (input[i0] || 0) * (1 - t) + (input[i1] || 0) * t;
  }
  return out;
}

/**
 * Extract MFCC frames from mono PCM.
 * Returns array of frames; each frame is nMfcc coefficients (c0 kept).
 */
export function extractMfcc(
  pcm: Float32Array,
  sampleRate: number = DEFAULT_SR
): number[][] {
  const x = resampleLinear(pcm, sampleRate, DEFAULT_SR);
  const win = hamming(FRAME);
  const filters = createMelFilterbank(DEFAULT_SR, FRAME, N_MELS);
  const frames: number[][] = [];
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const mels = new Float64Array(N_MELS);

  for (let start = 0; start + FRAME <= x.length; start += HOP) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME; i++) {
      re[i] = (x[start + i] || 0) * win[i];
    }
    fftRadix2(re, im);
    const nBins = (FRAME >> 1) + 1;
    const power = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) {
      power[k] = (re[k] * re[k] + im[k] * im[k]) / FRAME;
    }
    for (let m = 0; m < N_MELS; m++) {
      let sum = 0;
      const f = filters[m];
      for (let k = 0; k < nBins; k++) sum += power[k] * f[k];
      mels[m] = Math.log(sum + 1e-10);
    }
    frames.push(dct(mels, N_MFCC));
  }
  return frames;
}
