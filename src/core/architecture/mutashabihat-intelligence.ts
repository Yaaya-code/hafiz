/**
 * P7 — Mutashabihat + error relationship intelligence.
 * Produces support signals; never changes path or deletes progress.
 */

import type {
  ConfusionRelationship,
  ErrorCategory,
  EvidenceRecord,
} from "./types";

export type MutashabihSupportSignal = {
  kind: "paired_revision" | "sequence_drill" | "ending_focus";
  surahId: number;
  fromAyah: number;
  toAyah: number;
  relatedSurahId?: number;
  relatedAyah?: number;
  reasonAr: string;
  category: ErrorCategory;
};

/**
 * Classify a mistake into an error category (heuristic, evidence-based).
 */
export function classifyError(input: {
  expectedSurah?: number;
  expectedAyah?: number;
  producedSurah?: number;
  producedAyah?: number;
  nearSequence?: boolean;
}): ErrorCategory {
  if (
    input.producedSurah != null &&
    input.expectedSurah != null &&
    input.producedSurah !== input.expectedSurah
  ) {
    return "similarity_confusion";
  }
  if (
    input.nearSequence ||
    (input.producedAyah != null &&
      input.expectedAyah != null &&
      Math.abs(input.producedAyah - input.expectedAyah) === 1 &&
      input.producedSurah === input.expectedSurah)
  ) {
    return "sequence_confusion";
  }
  if (
    input.producedAyah != null &&
    input.expectedAyah != null &&
    input.producedSurah === input.expectedSurah &&
    input.producedAyah !== input.expectedAyah
  ) {
    return "ending_confusion";
  }
  return "recall_failure";
}

/**
 * Upsert confusion relationship from a mistake evidence event.
 * One event increments; does not set permanent weakness.
 */
export function recordConfusion(
  existing: ConfusionRelationship[],
  input: {
    category: ErrorCategory;
    surahId: number;
    ayah: number;
    relatedSurahId?: number;
    relatedAyah?: number;
    reasonAr?: string;
  }
): ConfusionRelationship[] {
  const now = new Date().toISOString();
  const id = [
    input.category,
    input.surahId,
    input.ayah,
    input.relatedSurahId ?? "",
    input.relatedAyah ?? "",
  ].join(":");

  const prev = existing.find((c) => c.id === id);
  if (prev) {
    return existing.map((c) =>
      c.id === id
        ? {
            ...c,
            occurrences: c.occurrences + 1,
            lastSeenAt: now,
            reasonAr: input.reasonAr ?? c.reasonAr,
          }
        : c
    );
  }

  return [
    ...existing,
    {
      id,
      category: input.category,
      locationA: { surahId: input.surahId, ayah: input.ayah },
      locationB:
        input.relatedSurahId != null
          ? {
              surahId: input.relatedSurahId,
              ayah: input.relatedAyah ?? 1,
            }
          : undefined,
      occurrences: 1,
      lastSeenAt: now,
      reasonAr:
        input.reasonAr ??
        "تم رصد موضع قد يحتاج ربطاً مع مواضع متشابهة",
    },
  ];
}

/**
 * Convert repeated confusions into revision support signals (not path).
 * Requires ≥2 occurrences (trend, not one-shot).
 */
export function buildMutashabihSupportSignals(
  confusions: readonly ConfusionRelationship[]
): MutashabihSupportSignal[] {
  const out: MutashabihSupportSignal[] = [];
  for (const c of confusions) {
    if (c.occurrences < 2) continue;
    const kind =
      c.category === "sequence_confusion"
        ? "sequence_drill"
        : c.category === "ending_confusion"
          ? "ending_focus"
          : "paired_revision";
    out.push({
      kind,
      surahId: c.locationA.surahId,
      fromAyah: Math.max(1, c.locationA.ayah - 2),
      toAyah: c.locationA.ayah + 2,
      relatedSurahId: c.locationB?.surahId,
      relatedAyah: c.locationB?.ayah,
      category: c.category,
      reasonAr:
        c.reasonAr ??
        "سنراجع مواضع متشابهة لتقوية الربط بينها",
    });
  }
  return out;
}

/**
 * Build evidence-friendly mutashabih note from recent mistake evidence.
 */
export function inferConfusionFromEvidence(
  evidence: readonly EvidenceRecord[]
): ConfusionRelationship[] {
  let conf: ConfusionRelationship[] = [];
  for (const e of evidence) {
    if (e.kind !== "mistake" && e.kind !== "tasmee_fail") continue;
    if (e.surahId == null || e.fromAyah == null) continue;
    const relatedSurah = e.meta?.confusedSurah as number | undefined;
    const relatedAyah = e.meta?.confusedAyah as number | undefined;
    const category = classifyError({
      expectedSurah: e.surahId,
      expectedAyah: e.fromAyah,
      producedSurah: relatedSurah,
      producedAyah: relatedAyah,
      nearSequence: e.meta?.nearSequence === true,
    });
    conf = recordConfusion(conf, {
      category,
      surahId: e.surahId,
      ayah: e.fromAyah,
      relatedSurahId: relatedSurah,
      relatedAyah: relatedAyah,
    });
  }
  return conf;
}
