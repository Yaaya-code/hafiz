/**
 * P5 — Strength Engine: evidence → SystemStrength (region-aware, trend-based).
 * Does not rewrite plans or paths directly.
 */

import type {
  EvidenceRecord,
  MemorizationMap,
  SystemStrength,
} from "./types";
import { applyRegionStrength } from "./memorization-map";

export type StrengthEvaluation = {
  surahId: number;
  fromAyah: number;
  toAyah: number;
  strength: SystemStrength;
  confidence: number;
  reasonAr: string;
};

/**
 * Evaluate strength for a region from evidence history (not single events).
 */
export function evaluateRegionStrength(
  evidence: readonly EvidenceRecord[],
  surahId: number,
  fromAyah: number,
  toAyah: number
): StrengthEvaluation {
  const relevant = evidence.filter((e) => {
    if (e.surahId !== surahId) return false;
    if (e.fromAyah == null) return true;
    const ef = e.fromAyah;
    const et = e.toAyah ?? ef;
    return ef <= toAyah && et >= fromAyah;
  });

  if (relevant.length < 2) {
    return {
      surahId,
      fromAyah,
      toAyah,
      strength: "UNKNOWN",
      confidence: 0.15,
      reasonAr: "لا تكفي الأدلة بعد لتقييم القوة",
    };
  }

  let fail = 0;
  let success = 0;
  let recentFailRun = 0;
  let recentSuccessRun = 0;

  const sorted = [...relevant].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  for (const e of sorted) {
    const bad =
      e.kind === "tasmee_fail" ||
      e.kind === "revision_fail" ||
      e.kind === "mistake" ||
      (typeof e.quality === "number" && e.quality < 3);
    const good =
      e.kind === "tasmee_success" ||
      e.kind === "revision_success" ||
      e.kind === "recovery" ||
      (typeof e.quality === "number" && e.quality >= 4);

    if (bad) {
      fail++;
      recentFailRun++;
      recentSuccessRun = 0;
    } else if (good) {
      success++;
      recentSuccessRun++;
      recentFailRun = 0;
    }
  }

  const total = fail + success;
  const failRate = total > 0 ? fail / total : 0.5;
  const confidence = Math.min(0.95, 0.25 + total * 0.08);

  let strength: SystemStrength = "UNKNOWN";
  let reasonAr = "";

  if (recentFailRun >= 3 && failRate >= 0.5) {
    strength = "WEAK";
    reasonAr = "إخفاقات متكررة — يحتاج تثبيتاً مكثفاً";
  } else if (failRate >= 0.45 || recentFailRun >= 2) {
    strength = "NEEDS_REVIEW";
    reasonAr = "الأدلة تشير إلى حاجة لمراجعة إضافية";
  } else if (recentSuccessRun >= 4 && failRate <= 0.2) {
    strength = "STRONG";
    reasonAr = "استقرار متكرر في الأداء";
  } else if (success >= 2 && failRate <= 0.35) {
    strength = "GOOD";
    reasonAr = "أداء مستقر مع صيانة عادية";
  } else {
    strength = "NEEDS_REVIEW";
    reasonAr = "أداء متذبذب — نتابع التثبيت";
  }

  // Single-event protection: never WEAK from < 3 samples
  if (total < 3 && strength === "WEAK") {
    strength = "NEEDS_REVIEW";
    reasonAr = "إشارات مبكرة — لا حكم نهائي بعد";
  }

  return {
    surahId,
    fromAyah,
    toAyah,
    strength,
    confidence,
    reasonAr,
  };
}

/** Apply evaluations for all map regions that have evidence. */
export function refreshMapStrengthFromEvidence(
  map: MemorizationMap,
  evidence: readonly EvidenceRecord[]
): MemorizationMap {
  let next = map;
  for (const r of map.regions) {
    const ev = evaluateRegionStrength(
      evidence,
      r.surahId,
      r.fromAyah,
      r.toAyah
    );
    if (ev.strength === "UNKNOWN" && (r.strengthConfidence ?? 0) > 0) {
      continue;
    }
    next = applyRegionStrength(
      next,
      r.surahId,
      r.fromAyah,
      r.toAyah,
      ev.strength,
      ev.confidence
    );
  }
  return next;
}
