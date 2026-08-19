/**
 * Spike: compare user PCM to a reference clip via MFCC + DTW.
 * No text ASR — acoustic similarity only.
 */

import { dtwSimilarity } from "./dtw";
import { extractMfcc, resampleLinear } from "./mfcc";

const TARGET_SR = 16000;

export type CompareResult = {
  score: number;
  userFrames: number;
  refFrames: number;
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

function verdictFromScore(score: number): CompareResult["verdict"] {
  if (score >= 0.72) return "قريب جداً";
  if (score >= 0.55) return "مقبول";
  if (score >= 0.4) return "ضعيف";
  return "بعيد";
}

/**
 * Compare user recording to reference audio (already decoded or via URL).
 * Keeps clips short: trims to shared-ish length for the spike.
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

  const user16 = resampleLinear(opts.userPcm, opts.userSampleRate, TARGET_SR);
  const ref16 = resampleLinear(refPcm, refSr, TARGET_SR);

  // Spike guard: cap ~8s to keep DTW cheap on phones
  const maxSamples = TARGET_SR * 8;
  const u = user16.length > maxSamples ? user16.subarray(0, maxSamples) : user16;
  const r = ref16.length > maxSamples ? ref16.subarray(0, maxSamples) : ref16;

  const userFeat = extractMfcc(u, TARGET_SR);
  const refFeat = extractMfcc(r, TARGET_SR);
  if (userFeat.length < 3 || refFeat.length < 3) {
    return {
      score: 0,
      userFrames: userFeat.length,
      refFrames: refFeat.length,
      verdict: "بعيد",
    };
  }

  const score = dtwSimilarity(userFeat, refFeat);
  return {
    score,
    userFrames: userFeat.length,
    refFrames: refFeat.length,
    verdict: verdictFromScore(score),
  };
}
