/**
 * P8 — Learning personalization / adaptation.
 * Adjusts presentation style only — never path ownership or Actual writes.
 */

import type { AdaptationProfile, EvidenceRecord } from "./types";

export function defaultAdaptation(): AdaptationProfile {
  return {
    sessionStyle: "balanced",
    revisionExposure: "normal",
    difficultyBalance: "maintain",
    reasonAr: "أسلوب متوازن افتراضي",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adapt experience from recent behavior trends (not single events).
 */
export function computeAdaptation(
  evidence: readonly EvidenceRecord[],
  previous?: AdaptationProfile | null
): AdaptationProfile {
  const base = previous ?? defaultAdaptation();
  if (evidence.length < 3) {
    return { ...base, updatedAt: new Date().toISOString() };
  }

  const recent = evidence.slice(-12);
  let fail = 0;
  let success = 0;
  let listening = 0;

  for (const e of recent) {
    if (
      e.kind === "tasmee_fail" ||
      e.kind === "revision_fail" ||
      e.kind === "mistake"
    ) {
      fail++;
    }
    if (
      e.kind === "tasmee_success" ||
      e.kind === "revision_success" ||
      e.kind === "session_complete"
    ) {
      success++;
    }
    if (e.kind === "listening_complete") listening++;
  }

  const total = fail + success;
  const failRate = total > 0 ? fail / total : 0;

  let sessionStyle = base.sessionStyle;
  let revisionExposure = base.revisionExposure;
  let difficultyBalance = base.difficultyBalance;
  let reasonAr = base.reasonAr;

  if (failRate >= 0.5 && total >= 4) {
    revisionExposure = "intensive";
    difficultyBalance = "ease";
    sessionStyle = listening >= 2 ? "listen_first" : "balanced";
    reasonAr = "سنخفف الحمل ونكثّف التثبيت بناءً على الأداء الأخير";
  } else if (failRate <= 0.2 && success >= 5) {
    revisionExposure = "normal";
    difficultyBalance = "challenge";
    sessionStyle = "read_first";
    reasonAr = "أداء قوي — يمكن زيادة التحدي تدريجياً";
  } else {
    revisionExposure = "normal";
    difficultyBalance = "maintain";
    sessionStyle = "balanced";
    reasonAr = "نحافظ على توازن الجلسات والمراجعة";
  }

  return {
    sessionStyle,
    revisionExposure,
    difficultyBalance,
    reasonAr,
    updatedAt: new Date().toISOString(),
  };
}
