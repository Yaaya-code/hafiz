/**
 * Spike: compare user PCM to a reference clip via MFCC + path-normalized DTW.
 * No text ASR — acoustic similarity only.
 */

import {
  dtwPathNormalized,
  dtwSimilarity,
  similarityPercent,
} from "./dtw";
import { extractMfcc, resampleLinear } from "./mfcc";
import { cmvnFrames, trimSilence } from "./preprocess";

const TARGET_SR = 16000;

export type CompareResult = {
  /** 0–1 similarity */
  score: number;
  /** 0–100 for UI */
  percent: number;
  userFrames: number;
  refFrames: number;
  /** Path-normalized DTW cost (debug) */
  normalizedCost: number;
  pathLength: number;
  /** Human hint for the spike UI */
  verdict: "قريب جداً" | "مقبول" | "ضعيف" | "بعيد";
};

export async function decodeAudioUrlToMono(
  url: string
): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("تعذّر تحميل الملف المرجعي");
  const buf = await res.arrayBuffer();
  const W = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctx = W.AudioContext || W.webkitAudioContext;
  if (!Ctx) throw new Error("AudioContext غير مدعوم");
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    const ch0 = decoded.getChannelData(0);
    const pcm = new Float32Array(ch0.length);
    pcm.set(ch0);
    if (decoded.numberOfChannels > 1) {
      const ch1 = decoded.getChannelData(1);
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = (pcm[i] + (ch1[i] || 0)) * 0.5;
      }
    }
    return { pcm, sampleRate: decoded.sampleRate };
  } finally {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }
}

function verdictFromPercent(pct: number): CompareResult["verdict"] {
  // Calibrated for path-normalized + CMVN spike (re-tune with field samples)
  if (pct >= 70) return "قريب جداً";
  if (pct >= 50) return "مقبول";
  if (pct >= 30) return "ضعيف";
  return "بعيد";
}

/** Drop c0 (log-energy) — reduces loudness/mic-gain bias */
function dropEnergyCoeff(frames: number[][]): number[][] {
  return frames.map((f) => f.slice(1));
}

/**
 * Compare user recording to reference audio.
 */
export async function compareUserToReference(opts: {
  userPcm: Float32Array;
  userSampleRate: number;
  referenceUrl?: string;
  referencePcm?: Float32Array;
  referenceSampleRate?: number;
}): Promise<CompareResult> {
  let refPcm = opts.referencePcm;
  let refSr = opts.referenceSampleRate || TARGET_SR;
  if (!refPcm) {
    if (!opts.referenceUrl) throw new Error("لا يوجد مرجع صوتي");
    const decoded = await decodeAudioUrlToMono(opts.referenceUrl);
    refPcm = decoded.pcm;
    refSr = decoded.sampleRate;
  }

  let user16 = resampleLinear(opts.userPcm, opts.userSampleRate, TARGET_SR);
  let ref16 = resampleLinear(refPcm, refSr, TARGET_SR);

  // Preprocess: trim leading/trailing silence on BOTH sides
  user16 = trimSilence(user16, TARGET_SR);
  ref16 = trimSilence(ref16, TARGET_SR);

  // Cap ~10s after trim (بسم الله الرحمن الرحيم ≈ few seconds)
  const maxSamples = TARGET_SR * 10;
  if (user16.length > maxSamples) user16 = user16.subarray(0, maxSamples);
  if (ref16.length > maxSamples) ref16 = ref16.subarray(0, maxSamples);

  let userFeat = extractMfcc(user16, TARGET_SR);
  let refFeat = extractMfcc(ref16, TARGET_SR);
  userFeat = dropEnergyCoeff(cmvnFrames(userFeat));
  refFeat = dropEnergyCoeff(cmvnFrames(refFeat));

  if (userFeat.length < 3 || refFeat.length < 3) {
    return {
      score: 0,
      percent: 0,
      userFrames: userFeat.length,
      refFrames: refFeat.length,
      normalizedCost: Number.POSITIVE_INFINITY,
      pathLength: 0,
      verdict: "بعيد",
    };
  }

  const path = dtwPathNormalized(userFeat, refFeat, 0.3);
  const score = dtwSimilarity(userFeat, refFeat);
  const percent = similarityPercent(score);

  return {
    score,
    percent,
    userFrames: userFeat.length,
    refFrames: refFeat.length,
    normalizedCost: path.normalizedCost,
    pathLength: path.pathLength,
    verdict: verdictFromPercent(percent),
  };
}
