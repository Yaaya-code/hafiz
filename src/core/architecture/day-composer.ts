/**
 * P3 — Day Composer: structure the daily journey from decided work.
 * Does not choose path or revision priority.
 */

import type { PlanItem } from "@/core/planning/types";
import type {
  ComposedDailyJourney,
  DailyJourneyStep,
  MeasurementResult,
  PathResolution,
  UserCapacity,
  AdaptationProfile,
} from "./types";

export type DayComposerInput = {
  date: string;
  path: PathResolution;
  capacity: UserCapacity;
  newHifz: MeasurementResult | null;
  /** Plan items already packed (revision + hifz) */
  planItems: readonly PlanItem[];
  adaptation?: AdaptationProfile | null;
  mutashabihHints?: Array<{ reasonAr: string; surahId?: number }>;
};

/**
 * Compose a human journey sequence from decided content.
 */
export function composeDailyJourney(
  input: DayComposerInput
): ComposedDailyJourney {
  const steps: DailyJourneyStep[] = [];
  let order = 1;
  const notes: string[] = [];

  const style = input.adaptation?.sessionStyle ?? "balanced";
  const listenFirst = style === "listen_first";

  steps.push({
    id: `prep-${input.date}`,
    order: order++,
    kind: "prepare",
    titleAr: "استعد للحفظ",
    subtitleAr: input.path.reasonAr,
    reason: "new_hifz",
    reasonAr: "تهيئة لرحلة اليوم",
  });

  const revItems = input.planItems.filter(
    (i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION"
  );
  const hifzItems = input.planItems.filter((i) => i.type === "NEW_HIFZ");

  const pushListening = (afterHifz: boolean) => {
    const src =
      input.newHifz ??
      (hifzItems[0]
        ? {
            startPointer: {
              surahId: hifzItems[0].surah ?? 1,
              ayah: hifzItems[0].sourceRange?.fromAyah ?? 1,
            },
            endPointer: {
              surahId: hifzItems[0].surah ?? 1,
              ayah: hifzItems[0].sourceRange?.toAyah ?? 1,
            },
            startPage: 0,
            endPage: 0,
            pagesActual: 0.5,
            labelAr: hifzItems[0].labelAr,
          }
        : null);
    if (!src) return;
    steps.push({
      id: `listen-${input.date}-${afterHifz ? "b" : "a"}`,
      order: order++,
      kind: "listening",
      titleAr: "استماع",
      subtitleAr: src.labelAr ?? "استمع لورد اليوم",
      reason: "listening",
      reasonAr: "تهيئة السمع قبل/مع الحفظ",
      surahId: src.startPointer.surahId,
      fromAyah: src.startPointer.ayah,
      toAyah: src.endPointer.ayah,
      planItemId: hifzItems[0]?.id,
    });
  };

  if (listenFirst) pushListening(false);

  // Revision block (user-facing: المراجعة)
  for (const r of revItems) {
    const reasonTag = (r.priorityReasons?.[1] as string) || "";
    const reasonAr =
      r.priorityReasons?.[0] ||
      (reasonTag.includes("neighborhood")
        ? "دعم الحفظ الجديد"
        : reasonTag.includes("stabilize")
          ? "تثبيت الحفظ"
          : "مراجعة المحفوظ");
    steps.push({
      id: r.id,
      order: order++,
      kind: "revision",
      titleAr: "المراجعة",
      subtitleAr: r.labelAr?.replace(/^مراجعة:\s*/, "") ?? "ورد المراجعة",
      reason:
        reasonTag.includes("neighborhood")
          ? "neighborhood"
          : reasonTag.includes("stabilize")
            ? "stabilize"
            : "corpus",
      reasonAr,
      surahId: r.surah ?? r.sourceRange?.surah,
      fromAyah: r.sourceRange?.fromAyah,
      toAyah: r.sourceRange?.toAyah,
      pagesApprox: r.sourceRange?.pagesApprox,
      estimatedMinutes: r.estimatedMinutes,
      planItemId: r.id,
    });
  }

  // Mutashabih support note as soft step if present
  if (input.mutashabihHints?.length) {
    const h = input.mutashabihHints[0];
    steps.push({
      id: `mutash-${input.date}`,
      order: order++,
      kind: "revision",
      titleAr: "المراجعة",
      subtitleAr: h.reasonAr,
      reason: "mutashabih_support",
      reasonAr: h.reasonAr,
      surahId: h.surahId,
    });
    notes.push(h.reasonAr);
  }

  if (!listenFirst) pushListening(true);

  for (const h of hifzItems) {
    steps.push({
      id: h.id,
      order: order++,
      kind: "new_hifz",
      titleAr: "حفظ جديد",
      subtitleAr: h.labelAr ?? "ورد الحفظ",
      reason:
        input.path.source === "external_assignment"
          ? "external_assignment"
          : "new_hifz",
      reasonAr: input.path.reasonAr,
      surahId: h.surah ?? h.sourceRange?.surah,
      fromAyah: h.sourceRange?.fromAyah,
      toAyah: h.sourceRange?.toAyah,
      pagesApprox: h.sourceRange?.pagesApprox,
      estimatedMinutes: h.estimatedMinutes,
      planItemId: h.id,
    });
    steps.push({
      id: `tasmee-${h.id}`,
      order: order++,
      kind: "tasmee",
      titleAr: "تسميع",
      subtitleAr: "سمّع بدون نظر",
      reason: "new_hifz",
      reasonAr: "تثبيت ما حُفظ اليوم",
      surahId: h.surah ?? h.sourceRange?.surah,
      fromAyah: h.sourceRange?.fromAyah,
      toAyah: h.sourceRange?.toAyah,
      planItemId: h.id,
    });
  }

  steps.push({
    id: `check-${input.date}`,
    order: order++,
    kind: "check",
    titleAr: "مراجعة الأداء",
    subtitleAr: "سجّل الأخطاء إن وُجدت",
    reason: "testing",
    reasonAr: "جمع أدلة لتحسين الخطة لاحقاً",
  });

  steps.push({
    id: `reflect-${input.date}`,
    order: order++,
    kind: "reflection",
    titleAr: "خاتمة اليوم",
    subtitleAr: "دعاء ونية ليوم الغد",
    reason: "reflection",
    reasonAr: "إغلاق الرحلة",
  });

  if (input.adaptation?.reasonAr) {
    notes.push(input.adaptation.reasonAr);
  }

  const revisionSummaryAr =
    revItems.length === 0
      ? "لا مراجعة مكثّفة اليوم"
      : revItems
          .map((r) => r.labelAr?.replace(/^مراجعة:\s*/, "") || "مقطع")
          .slice(0, 4)
          .join(" · ");

  return {
    date: input.date,
    steps,
    newHifz: input.newHifz,
    revisionSummaryAr,
    path: input.path,
    capacity: input.capacity,
    notes,
  };
}
