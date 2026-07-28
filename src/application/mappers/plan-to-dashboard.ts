/**
 * Map GeneratedPlan / Decision → dashboard view models.
 * Presentation mapping only — no core imports beyond types re-exported via application.
 */

import type {
  Decision,
  GeneratedPlan,
  PlanDay,
  PlanItem,
  TodayPlanResult,
  JourneyPlanResult,
} from "../types";

export type DashboardStepKind =
  | "revision"
  | "new_hifz"
  | "listening"
  | "quiz"
  | "mutashabihat"
  | "reflection"
  | "finish";

export interface DashboardJourneyStep {
  id: string;
  order: number;
  kind: DashboardStepKind;
  titleAr: string;
  subtitleAr: string;
  minutes: number;
  emoji: string;
  href: string;
  surahNumber?: number;
  fromAyah?: number;
  toAyah?: number;
  reason?: string;
}

export interface DashboardPlanBlock {
  id: string;
  kind: DashboardStepKind;
  titleAr: string;
  minutes: number;
  items: { label: string; surahNumber?: number; reason?: string }[];
  href: string;
}

export interface DashboardDayCard {
  day: string;
  dayIndex: number;
  revision: string;
  newHifz: string;
  note?: string;
  isAnchor?: boolean;
}

export interface DashboardMonthWeek {
  week: number;
  focusAr: string;
  detailAr: string;
  days: {
    dayIndex: number;
    revision: string;
    newHifz: string;
  }[];
}

export interface DashboardRevisionRow {
  label: string;
  reason: string;
  minutes: number;
  priorityScore?: number;
}

export interface DashboardForgetRow {
  key: string;
  title: string;
  /** 0–1 proxy from priority (higher priority → lower "confidence") */
  confidence: number;
}

export interface DashboardPlanView {
  asOfDate: string;
  fromCache: boolean;
  hifzEnabled: boolean;
  revisionOnly: boolean;
  coachingMessage: string;
  coachIntro: string;
  balanceNote: string;
  totalMinutes: number;
  appliedRules: readonly string[];
  /** Ordered steps for "رحلة اليوم" card */
  steps: DashboardJourneyStep[];
  revision: DashboardPlanBlock;
  newMemorization: DashboardPlanBlock;
  revisionRows: DashboardRevisionRow[];
  forgetRows: DashboardForgetRow[];
  weekly: DashboardDayCard[];
  monthly: DashboardMonthWeek[];
  miniRevisionLabel: string;
  miniNewHifzLabel: string;
}

const WEEKDAY_AR = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

function itemHref(item: PlanItem): string {
  const surah = item.surah ?? item.sourceRange?.surah ?? "";
  const from = item.sourceRange?.fromAyah ?? "";
  const to = item.sourceRange?.toAyah ?? "";
  const mid = item.revisionMemoryId
    ? `&memoryId=${encodeURIComponent(item.revisionMemoryId)}`
    : "";
  const rangeQ =
    surah !== ""
      ? `?step=${encodeURIComponent(item.id)}&surah=${surah}&from=${from || 1}&to=${to || from || 1}${mid}`
      : `?step=${encodeURIComponent(item.id)}${mid.replace(/^&/, "?")}`;

  switch (item.type) {
    case "NEW_HIFZ":
      return `/session/revision${rangeQ}${rangeQ.includes("?") ? "&" : "?"}mode=memorize`;
    case "NEAR_REVISION":
    case "FAR_REVISION":
      return `/session/revision${rangeQ}`;
    case "LISTENING":
      return `/session/listen${rangeQ}`;
    case "QUIZ":
      return `/session/quiz${rangeQ}`;
    default:
      return "/plans/journey";
  }
}

function itemKind(type: PlanItem["type"]): DashboardStepKind {
  switch (type) {
    case "NEW_HIFZ":
      return "new_hifz";
    case "LISTENING":
      return "listening";
    case "QUIZ":
      return "quiz";
    case "NEAR_REVISION":
    case "FAR_REVISION":
    default:
      return "revision";
  }
}

function itemEmoji(type: PlanItem["type"]): string {
  switch (type) {
    case "NEW_HIFZ":
      return "📖";
    case "LISTENING":
      return "🎧";
    case "QUIZ":
      return "✍️";
    case "NEAR_REVISION":
      return "🔄";
    case "FAR_REVISION":
      return "📚";
    default:
      return "✨";
  }
}

function itemTitleAr(type: PlanItem["type"]): string {
  switch (type) {
    case "NEW_HIFZ":
      return "حفظ جديد";
    case "NEAR_REVISION":
    case "FAR_REVISION":
      // User-facing: single label — Near/Far are internal only
      return "المراجعة";
    case "LISTENING":
      return "استماع";
    case "QUIZ":
      return "اختبار";
    default:
      return "نشاط";
  }
}

function itemLabel(item: PlanItem): string {
  // Prefer explicit plan labels (already mother-friendly from packer)
  if (item.labelAr && item.labelAr.trim()) {
    // Strip internal Near/Far if any old cache still has them
    return item.labelAr
      .replace(/^مراجعة قريبة:\s*/u, "تثبيت: ")
      .replace(/^مراجعة بعيدة:\s*/u, "تثبيت: ");
  }
  const sr = item.sourceRange;
  const rangeText = (() => {
    if (sr?.fromSurah && sr?.toSurah && sr.fromSurah !== sr.toSurah) {
      return `سور ${sr.fromSurah}–${sr.toSurah}`;
    }
    if (sr?.surah || item.surah) {
      const s = sr?.surah ?? item.surah;
      if (sr?.fromAyah && sr?.toAyah) {
        return `سورة ${s} · ${sr.fromAyah}–${sr.toAyah}`;
      }
      return `سورة ${s}`;
    }
    return "";
  })();

  if (item.type === "NEW_HIFZ") {
    return rangeText ? `حفظ جديد: ${rangeText}` : "حفظ جديد";
  }
  if (item.type === "NEAR_REVISION" || item.type === "FAR_REVISION") {
    return rangeText ? `تثبيت: ${rangeText}` : "تثبيت المحفوظ";
  }
  return rangeText || itemTitleAr(item.type);
}

function weekdayAr(dateStr?: string, fallbackIndex = 0): string {
  if (!dateStr || dateStr.length < 10) {
    return WEEKDAY_AR[fallbackIndex % 7];
  }
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return WEEKDAY_AR[fallbackIndex % 7];
  return WEEKDAY_AR[d.getDay()];
}

function summarizeDayRevision(day: PlanDay): string {
  const revs = day.items.filter(
    (i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION"
  );
  if (!revs.length) return "مراجعة خفيفة / راحة";
  return revs.map(itemLabel).join(" · ");
}

function summarizeDayHifz(day: PlanDay): string {
  const h = day.items.find((i) => i.type === "NEW_HIFZ");
  if (!h) return "—";
  return itemLabel(h);
}

function buildSteps(day: PlanDay | null): DashboardJourneyStep[] {
  if (!day) return [];
  const steps: DashboardJourneyStep[] = day.items.map((item, idx) => ({
    id: item.id,
    order: idx + 1,
    kind: itemKind(item.type),
    titleAr: itemTitleAr(item.type),
    subtitleAr: itemLabel(item),
    minutes: item.estimatedMinutes,
    emoji: itemEmoji(item.type),
    href: itemHref(item),
    surahNumber: item.surah ?? item.sourceRange?.surah,
    fromAyah: item.sourceRange?.fromAyah,
    toAyah: item.sourceRange?.toAyah,
    reason: item.priorityReasons?.[0],
  }));

  steps.push({
    id: "finish",
    order: steps.length + 1,
    kind: "finish",
    titleAr: "خاتمة اليوم",
    subtitleAr: "دعاء ونية ليوم الغد",
    minutes: 2,
    emoji: "🤲",
    href: "/plans/journey",
  });

  return steps;
}

function buildBlock(
  day: PlanDay | null,
  typeFilter: PlanItem["type"][],
  kind: DashboardStepKind,
  titleAr: string,
  href: string
): DashboardPlanBlock {
  const items = (day?.items ?? []).filter((i) => typeFilter.includes(i.type));
  return {
    id: kind,
    kind,
    titleAr,
    minutes: items.reduce((s, i) => s + i.estimatedMinutes, 0),
    items: items.map((i) => ({
      label: itemLabel(i),
      surahNumber: i.surah ?? i.sourceRange?.surah,
      reason: i.priorityReasons?.[0],
    })),
    href,
  };
}

function coachingFromDecision(
  decision: Decision,
  plan: GeneratedPlan
): { coachingMessage: string; coachIntro: string; balanceNote: string } {
  const parts: string[] = [];

  if (decision.revisionOnly || !decision.newHifzEnabled) {
    parts.push(
      "اليوم تركيزك على تثبيت المحفوظ: المراجعة أولى من الحفظ الجديد."
    );
  } else if (decision.track === "bottom_up") {
    parts.push(
      "مسارك من جزء عمّ (من الناس صعوداً). نمضغ الورد بهدوء ونثبت ما نحفظ."
    );
  } else if (decision.track === "continue_from_last_surah") {
    parts.push("نكمل من حيث وقفت — حفظ متّصل مع مراجعة تحمي البناء.");
  } else if (decision.track === "fragmented_revision_only") {
    parts.push(
      "محفوظك متفرّق: نوقف التلقائي للجديد ونرتّب المراجعة حتى يتّصل المسار."
    );
  } else {
    parts.push("خطتك اليوم مبنية على قواعد حافظ — قرار واحد واضح.");
  }

  if (decision.lockProgression) {
    parts.push("التقدّم مقفول مؤقتاً حتى يستقر الحفظ.");
  }
  if (decision.recoveryRequired) {
    parts.push("هناك محتوى يحتاج استرجاعاً قبل التوسّع.");
  }
  if (decision.additionalListeningPractice) {
    parts.push("زد الاستماع اليوم.");
  }

  const notes = plan.meta?.notes?.filter((n) => !n.startsWith("Multi-day")) ?? [];
  const balance =
    decision.dailyCapacity.minutes != null
      ? `سعة اليوم ≈ ${decision.dailyCapacity.minutes} دقيقة`
      : "وزّع وقتك بين المراجعة والحفظ";

  const coachingMessage = parts.join(" ");
  return {
    coachingMessage,
    coachIntro: coachingMessage,
    balanceNote: balance + (notes[0] ? ` · ${notes[0]}` : ""),
  };
}

function mapWeekly(plan: GeneratedPlan): DashboardDayCard[] {
  return plan.days.slice(0, 7).map((d, i) => ({
    day: weekdayAr(d.date, i),
    dayIndex: d.dayNumber,
    revision: summarizeDayRevision(d),
    newHifz: summarizeDayHifz(d),
    note: d.dayNumber === 7 ? "ختم أسبوعي خفيف إن أمكن" : undefined,
    isAnchor: d.dayNumber === 7,
  }));
}

function mapMonthly(plan: GeneratedPlan): DashboardMonthWeek[] {
  const weeks: DashboardMonthWeek[] = [];
  const days = plan.days.slice(0, 30);
  for (let w = 0; w < 4; w++) {
    const slice = days.slice(w * 7, w * 7 + 7);
    if (!slice.length) break;
    const hifzDays = slice.filter((d) =>
      d.items.some((i) => i.type === "NEW_HIFZ")
    ).length;
    const revFocus = slice
      .flatMap((d) =>
        d.items.filter(
          (i) => i.type === "FAR_REVISION" || i.type === "NEAR_REVISION"
        )
      )
      .slice(0, 2)
      .map(itemLabel)
      .join(" · ");

    weeks.push({
      week: w + 1,
      focusAr:
        hifzDays > 0
          ? `أسبوع ${w + 1}: حفظ + تثبيت`
          : `أسبوع ${w + 1}: تركيز مراجعة`,
      detailAr: revFocus
        ? `أبرز المراجعات: ${revFocus}`
        : "استمرار على الورد اليومي حسب القرار.",
      days: slice.map((d) => ({
        dayIndex: d.dayNumber,
        revision: summarizeDayRevision(d),
        newHifz: summarizeDayHifz(d),
      })),
    });
  }
  return weeks;
}

/**
 * Build dashboard view from orchestration results.
 * Prefer a 7-day and 30-day journey for week/month tabs; today from getTodayPlan.
 */
export function mapOrchestrationToDashboard(input: {
  today: TodayPlanResult;
  week?: JourneyPlanResult | null;
  month?: JourneyPlanResult | null;
}): DashboardPlanView {
  const { today } = input;
  const day = today.today ?? today.plan.days[0] ?? null;
  const decision = today.decision;
  const coach = coachingFromDecision(decision, today.plan);

  const revision = buildBlock(
    day,
    ["NEAR_REVISION", "FAR_REVISION"],
    "revision",
    "المراجعة",
    "/session/revision"
  );
  const newMemorization = buildBlock(
    day,
    ["NEW_HIFZ"],
    "new_hifz",
    "الحفظ الجديد",
    "/plans/new"
  );

  // Deduplicate revision rows by content (near-carry + SRS twin can collide)
  const seenRev = new Set<string>();
  const revisionRows: DashboardRevisionRow[] = (day?.items ?? [])
    .filter((i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION")
    .filter((i) => {
      const key = `${i.type}:${i.surah ?? i.sourceRange?.surah ?? ""}:${i.sourceRange?.fromAyah ?? ""}:${i.sourceRange?.toAyah ?? ""}:${itemLabel(i)}`;
      if (seenRev.has(key)) return false;
      seenRev.add(key);
      return true;
    })
    .map((i) => ({
      label: itemLabel(i),
      reason: i.priorityReasons?.[0] ?? "المراجعة",
      minutes: i.estimatedMinutes,
      priorityScore: i.priorityScore,
    }));

  const forgetSource = revisionRows.length
    ? revisionRows
    : (input.week?.plan.days[0]?.items ?? [])
        .filter((i) => i.type === "FAR_REVISION" || i.type === "NEAR_REVISION")
        .map((i) => ({
          label: itemLabel(i),
          reason: i.priorityReasons?.[0] ?? "",
          minutes: i.estimatedMinutes,
          priorityScore: i.priorityScore,
        }));

  const maxPri = Math.max(
    1,
    ...forgetSource.map((r) => r.priorityScore ?? 1)
  );
  const forgetRows: DashboardForgetRow[] = forgetSource
    .slice(0, 6)
    .map((r, idx) => ({
      key: `${r.label}-${idx}`,
      title: r.label.startsWith("مراجعة") ? r.label : `مراجعة ${r.label}`,
      confidence: Math.max(
        0.25,
        1 - ((r.priorityScore ?? 0) / maxPri) * 0.7
      ),
    }));

  const weekPlan = input.week?.plan ?? today.plan;
  const monthPlan = input.month?.plan ?? input.week?.plan ?? today.plan;

  const totalMinutes =
    day?.totalMinutes ??
    (day?.items.reduce((s, i) => s + i.estimatedMinutes, 0) ?? 0);

  return {
    asOfDate: today.asOfDate,
    fromCache: today.fromCache,
    hifzEnabled: decision.newHifzEnabled && !decision.revisionOnly,
    revisionOnly: decision.revisionOnly,
    coachingMessage: coach.coachingMessage,
    coachIntro: coach.coachIntro,
    balanceNote: coach.balanceNote,
    totalMinutes,
    appliedRules: today.appliedRules,
    steps: buildSteps(day),
    revision,
    newMemorization,
    revisionRows,
    forgetRows,
    weekly: mapWeekly(weekPlan),
    monthly: mapMonthly(monthPlan),
    miniRevisionLabel:
      revision.items[0]?.label?.replace(/^مراجعة\s*/, "") || "—",
    miniNewHifzLabel:
      newMemorization.items[0]?.label ||
      (decision.newHifzEnabled ? "حسب المسار" : "متوقّف"),
  };
}
