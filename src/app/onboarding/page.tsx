"use client";

/**
 * حافظ — 4-step luxury onboarding (True Kiswa & Silver).
 * Desktop-wide responsive layout with glass quote coaching.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Flame,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatArabicNumber } from "@/lib/utils";
import { ACTIVE_GOLD, INACTIVE_SURFACE } from "@/lib/ui-active";
import { saveOnboardingAction } from "@/lib/actions/onboarding";
import type { OnboardingPayload } from "@/lib/onboarding-types";
import { FadeIn } from "@/components/motion/fade-in";
import {
  loadProfile,
  saveProfile,
  type HafizProfile,
  type StoredPlan,
} from "@/lib/user-profile";
import {
  UnifiedMemorizationTree,
  memorizationCoachCopy,
} from "@/components/onboarding/unified-memorization-tree";
import type { LearningStyle, MemorizationSelection } from "@/lib/quran/types";
import { resetLearningForNewProfile } from "@/application";

const STEPS = [
  {
    id: "track",
    title: "كيف تريد استخدام حافظ؟",
    subtitle: "اختر المسار المناسب لك — يمكن تغييره لاحقاً",
    icon: Sparkles,
  },
  {
    id: "memorized",
    title: "المحفوظ الحالي",
    subtitle: "حدّد ما تحفظه من الأجزاء والسور",
    icon: BookOpen,
  },
  {
    id: "amount_time",
    title: "المقدار والوقت اليومي",
    subtitle: "كم تحفظ جديداً وكم وقتاً متاحاً؟",
    icon: Clock,
  },
  {
    id: "level_style",
    title: "مستوى الحفظ وأسلوب التعلّم",
    subtitle: "كيف ثباتك؟ وكيف تتعلّم أفضل؟",
    icon: Flame,
  },
  {
    id: "goal_plan",
    title: "ماذا تريد أن تحقق مع حافظ؟",
    subtitle: "هدفك الأكبر + خطتك المباركة",
    icon: Target,
  },
] as const;

const TRACK_OPTS = [
  {
    id: "AUTOMATIC_PLAN" as const,
    title: "خطة تلقائية من حافظ",
    desc: "التطبيق يدير ورد الحفظ والمراجعة يومياً حسب قدرتك",
  },
  {
    id: "EXTERNAL_TRACKER" as const,
    title: "متابعة حرة / مع شيخ",
    desc: "تحفظ خارج التطبيق — هنا تتسمّع وتتابع فقط بدون جدول مفروض",
  },
  {
    id: "FREE_EXPLORER" as const,
    title: "استخدام حر بدون خطة",
    desc: "تخطي التخطيط — ادخل للوحة التحكم واستخدم الأدوات متى شئت",
  },
] as const;

const START_PREF_OPTS = [
  {
    id: "CONTINUE_FORWARD" as const,
    title: "نكمل من بعد محفوظي",
    desc: "بعد أبعد سورة معلنة (موصى به للمحفوظ المتّصل)",
  },
  {
    id: "START_FROM_BEGINNING" as const,
    title: "من أول المصحف (البقرة…)",
    desc: "تخطي الصفحات المحفوظة تلقائياً",
  },
  {
    id: "START_FROM_REVERSE" as const,
    title: "من جزء عم صعوداً",
    desc: "من قصار السور نحو الأعلى",
  },
  {
    id: "START_FROM_CUSTOM_SURAH" as const,
    title: "سورة أحدّدها أنا",
    desc: "اختر رقم السورة لنقطة انطلاق الحفظ الجديد",
  },
] as const;

const NEW_AMOUNT = [
  { pages: 0, label: "مراجعة فقط", desc: "بدون حفظ جديد" },
  { pages: 0.5, label: "آيات قليلة", desc: "نصف صفحة تقريباً" },
  { pages: 1, label: "صفحة", desc: "مقدار يومي معتدل" },
  { pages: 2, label: "صفحتان", desc: "همّة أعلى" },
];

const TIME_OPTS = [
  { minutes: 15, label: "١٥ د" },
  { minutes: 30, label: "٣٠ د" },
  { minutes: 45, label: "٤٥ د" },
  { minutes: 60, label: "٦٠ د+" },
];

const LEVEL_OPTS = [
  {
    value: 4 as const,
    key: "solid",
    title: "متقن وثابت",
    desc: "أخطاء قليلة — أحتاج دوام التثبيت",
  },
  {
    value: 3 as const,
    key: "medium",
    title: "يحتاج تثبيتاً",
    desc: "أراجع بانتظام حتى لا يتفلّت",
  },
  {
    value: 2 as const,
    key: "weak",
    title: "ضعيف ويتفلّت",
    desc: "أنسى بسرعة وأحتاج دعماً أكبر",
  },
];

const LEARN_OPTS: { key: LearningStyle; title: string; desc: string }[] = [
  {
    key: "LISTENING",
    title: "الاستماع للقارئ",
    desc: "أثبّت بالحفظ السمعي أولاً",
  },
  {
    key: "READING",
    title: "القراءة والتكرار الذاتي",
    desc: "أقرأ وأكرر حتى يثبت",
  },
  {
    key: "LISTEN_AND_READ",
    title: "استماع + قراءة",
    desc: "أجمع بين الأذن والعين",
  },
];

const GOALS = [
  {
    id: "revision_only",
    label: "التركيز على مراجعة المحفوظ وتثبيته",
    emoji: "🔄",
    learningGoalId: "revision_only" as const,
  },
  {
    id: "complete_quran",
    label: "إتمام حفظ القرآن كاملاً",
    emoji: "📖",
    learningGoalId: "complete_quran" as const,
  },
  {
    id: "selected_surahs",
    label: "حفظ سور أو أجزاء مختارة",
    emoji: "🎯",
    learningGoalId: "selected_surahs" as const,
  },
];

const HABIT_TIMES = [
  { ar: "بعد الفجر", emoji: "🌅" },
  { ar: "صباحاً", emoji: "☀️" },
  { ar: "بعد العمل", emoji: "🌇" },
  { ar: "قبل النوم", emoji: "🌙" },
  { ar: "مرن", emoji: "🍃" },
];

const REVISION_AMOUNT = [
  { pages: 1, label: "صفحة مراجعة", desc: "حد أدنى" },
  { pages: 2, label: "صفحتان", desc: "متوازن" },
  { pages: 3, label: "٣ صفحات", desc: "موصى به" },
  { pages: 5, label: "٥ صفحات+", desc: "تثبيت قوي" },
];

const QARI_OPTS = [
  { id: "alafasy", label: "مشاري العفاسي" },
  { id: "sudais", label: "عبد الرحمن السديس" },
  { id: "maher", label: "ماهر المعيقلي" },
  { id: "husary", label: "محمود خليل الحصري" },
];

/** Soft guidance when revision << new memorization */
function revisionCapacityHint(newPages: number, revPages: number): string | null {
  if (newPages <= 0) return null;
  if (revPages >= newPages * 2) return null;
  if (revPages < newPages) {
    return "ثبات الحفظ يعتمد على المراجعة. نوصي برفع مقدار المراجعة إلى ضعفي الحفظ الجديد على الأقل.";
  }
  return "للثبات الأمثل: اجعل المراجعة أكبر من الحفظ الجديد.";
}

type PlanResult = Awaited<ReturnType<typeof saveOnboardingAction>>["plan"];

function timeCoach(minutes: number): string {
  if (minutes <= 30) {
    return "«أحبّ الأعمال إلى الله أدومها وإن قلّ» — القليل المنتظم يبني جبالاً من الحفظ.";
  }
  return "همّة عالية! «من سلك طريقاً يلتمس فيه علماً سهّل الله له به طريقاً إلى الجنة».";
}

function levelCoach(level: number): string {
  if (level <= 2) {
    return "أبشر! قال ﷺ: «والذي يقرأ القرآن وهو يشتدّ عليه وله أجران» — تعبك مضاعف الأجر.";
  }
  return "ما شاء الله! قال ﷺ: «تعاهدوا هذا القرآن» — هدفنا دوام التثبيت والارتقاء.";
}

function CoachQuote({ text }: { text: string }) {
  return (
    <div className="quote-glass rounded-2xl px-4 py-4 md:px-6 md:py-5">
      <div className="flex items-start gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-[#D4AF37] shrink-0 mt-0.5" />
        <span className="text-[11px] font-semibold tracking-wide text-[#D4AF37]/90">
          وحيّ وتشجيع
        </span>
      </div>
      <p className="font-quran text-lg md:text-xl lg:text-2xl leading-loose text-white/95 text-center">
        {text}
      </p>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  const [mem, setMem] = useState<MemorizationSelection>({
    mode: "SURAH",
    juzSelections: [],
    surahSelections: [],
  });

  const [form, setForm] = useState({
    usageTrack: "AUTOMATIC_PLAN" as
      | "AUTOMATIC_PLAN"
      | "EXTERNAL_TRACKER"
      | "FREE_EXPLORER",
    pagesPerDay: 1,
    revisionPagesPerDay: 3,
    minutes: 45,
    strength: 3 as 1 | 2 | 3 | 4 | 5,
    learningStyle: "LISTEN_AND_READ" as LearningStyle,
    goalId: "complete_quran",
    habitTime: "بعد الفجر",
    preferredQariId: "alafasy",
    progressionMode: "continue_forward" as
      | "continue_forward"
      | "from_start"
      | "bottom_up"
      | "complete_nearby",
    hifzStartPreference: "CONTINUE_FORWARD" as
      | "CONTINUE_FORWARD"
      | "START_FROM_BEGINNING"
      | "START_FROM_REVERSE"
      | "START_FROM_CUSTOM_SURAH",
    customStartSurah: 2,
  });

  const meta = STEPS[step];
  const Icon = meta.icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  const coach = useMemo(() => {
    if (meta.id === "memorized") return memorizationCoachCopy(mem);
    if (meta.id === "amount_time") return timeCoach(form.minutes);
    if (meta.id === "level_style") return levelCoach(form.strength);
    return "اختر ما يحرّك قلبك — وسنبني الخطة عليه.";
  }, [meta.id, mem, form.minutes, form.strength]);

  function buildPayload(): OnboardingPayload {
    const goal = GOALS.find((g) => g.id === form.goalId) || GOALS[1];
    const goalLabel = goal.label;
    const isAuto = form.usageTrack === "AUTOMATIC_PLAN";
    const pagesPerDay = !isAuto
      ? 0
      : goal.learningGoalId === "revision_only"
        ? 0
        : form.pagesPerDay;

    const startPref = form.hifzStartPreference;
    const progressionMode =
      startPref === "START_FROM_BEGINNING"
        ? ("from_start" as const)
        : startPref === "START_FROM_REVERSE"
          ? ("bottom_up" as const)
          : (mem.surahSelections?.length || 0) === 0 &&
              (mem.juzSelections?.length || 0) === 0
            ? ("from_start" as const)
            : form.progressionMode;

    return {
      pagesPerDay,
      revisionPagesPerDay: isAuto ? form.revisionPagesPerDay : 0,
      revisionSessionsPerDay:
        form.minutes >= 60 ? 3 : form.minutes >= 45 ? 2 : 1,
      dailyMinutes: form.minutes,
      memorizationStrength: form.strength,
      revisionStyle:
        form.strength <= 2
          ? "intensive"
          : form.strength >= 4
            ? "light"
            : "balanced",
      goals: [goalLabel],
      learningGoalId: goal.learningGoalId,
      preferredQariId: form.preferredQariId,
      usageTrack: form.usageTrack,
      hasActivePlan: isAuto,
      hifzStartPreference: startPref,
      customStartSurah:
        startPref === "START_FROM_CUSTOM_SURAH"
          ? form.customStartSurah
          : undefined,
      memorizationSelection: {
        ...mem,
        mode:
          mem.mode === "JUZ" || mem.mode === "SURAH" || mem.mode === "RANGE"
            ? mem.mode
            : (mem.surahSelections?.length || 0) > 0
              ? "SURAH"
              : (mem.juzSelections?.length || 0) > 0
                ? "JUZ"
                : mem.range
                  ? "RANGE"
                  : "SURAH",
      },
      learningStyle: form.learningStyle,
      progressionMode,
      journey: {
        habitTime: form.habitTime,
        motivation: goalLabel,
        progressionMode,
      },
    };
  }

  function persist(
    payload: OnboardingPayload,
    planData: PlanResult | StoredPlan
  ) {
    // Prefer journey display name or existing profile name — never invent progress data
    const existingName = loadProfile().name?.trim();
    const journeyName = payload.journey?.displayName?.trim();
    const profile: HafizProfile = {
      version: 2,
      completedAt: new Date().toISOString(),
      name: journeyName || existingName || "",
      pagesPerDay: payload.pagesPerDay,
      revisionPagesPerDay: payload.revisionPagesPerDay ?? 3,
      revisionSessionsPerDay: payload.revisionSessionsPerDay,
      dailyMinutes: payload.dailyMinutes,
      memorizationStrength: payload.memorizationStrength,
      revisionStyle: payload.revisionStyle,
      goals: payload.goals,
      learningGoalId: payload.learningGoalId,
      journey: payload.journey,
      plan: planData as StoredPlan,
      onboardingComplete: true,
      preferredQariId: payload.preferredQariId || form.preferredQariId || "alafasy",
      memorizationSelection: payload.memorizationSelection,
      learningStyle: payload.learningStyle,
      progressionMode:
        payload.progressionMode || payload.journey?.progressionMode,
      usageTrack: payload.usageTrack ?? "AUTOMATIC_PLAN",
      hasActivePlan: payload.hasActivePlan !== false,
      hifzStartPreference: payload.hifzStartPreference,
      customStartSurah: payload.customStartSurah,
    };
    saveProfile(profile);
    // Immediate verify — never navigate if write failed / was overwritten mid-write
    const saved = loadProfile();
    if (!saved.onboardingComplete) {
      // Force sticky write once more
      saveProfile({ ...saved, ...profile, onboardingComplete: true });
    }
    // Drop pre-onboarding learning state so the engine bootstraps from selection
    // (avoids stale Fatiha pointer / empty far queue)
    try {
      resetLearningForNewProfile();
    } catch {
      /* ignore */
    }
  }

  function generateAndShowPlan() {
    const data = buildPayload();
    startTransition(async () => {
      try {
        const res = await saveOnboardingAction(data);
        setPlan(res.plan);
        persist(data, res.plan);
        // Hard gate: only leave onboarding if local profile is complete
        if (!loadProfile().onboardingComplete) {
          setError("تعذّر حفظ الملف الشخصي. حاول مرة أخرى.");
          return;
        }
        setError(null);
        // Wow flow: personalized plan reveal (orchestration), not raw dashboard
        router.push("/plan-reveal");
      } catch {
        setError("تعذّر إنشاء الخطة. حاول مرة أخرى.");
      }
    });
  }

  function finishFreeExplorer() {
    const data = buildPayload();
    data.usageTrack = "FREE_EXPLORER";
    data.hasActivePlan = false;
    data.pagesPerDay = 0;
    startTransition(async () => {
      try {
        // Minimal plan shell for free track
        const planData = {
          dailyNewPages: 0,
          dailyRevisionPages: 0,
          sessions: 0,
          sessionLengthMinutes: 0,
          revisionMinutes: 0,
          newMinutes: 0,
          memorizedUnits: 0,
          estimatedDaysToFirstFullPass: 0,
          strengthSummary: "",
          styleSummary: "استخدام حر",
          goals: data.goals,
          focus: [],
          scheduleHint: ["لا خطة تلقائية — ابدأ الاستخدام الحر"],
          welcomeMessage: {
            greeting: "مرحباً بك",
            body: "يمكنك استخدام التسميع والقارئ بحرية، وإنشاء خطة لاحقاً من الإعدادات.",
            closing: "وفقك الله",
          },
        } as StoredPlan;
        persist(data, planData);
        if (!loadProfile().onboardingComplete) {
          setError("تعذّر حفظ الملف الشخصي. حاول مرة أخرى.");
          return;
        }
        router.push("/dashboard");
      } catch {
        setError("تعذّر الحفظ. حاول مرة أخرى.");
      }
    });
  }

  function next() {
    setError(null);
    // FREE_EXPLORER: after track (+ optional mem), skip to dashboard
    if (meta.id === "track" && form.usageTrack === "FREE_EXPLORER") {
      finishFreeExplorer();
      return;
    }
    // EXTERNAL: skip amount_time — jump from memorized to level or finish lighter
    if (
      meta.id === "memorized" &&
      form.usageTrack === "EXTERNAL_TRACKER"
    ) {
      // still collect mem then go level → goal with pages 0
      if (step < STEPS.length - 1) setStep((s) => s + 1);
      return;
    }
    if (
      meta.id === "amount_time" &&
      form.usageTrack === "EXTERNAL_TRACKER"
    ) {
      // skip amount for external
      setStep(STEPS.findIndex((s) => s.id === "level_style"));
      return;
    }
    if (meta.id === "goal_plan" && !showPlan) {
      generateAndShowPlan();
      return;
    }
    if (showPlan) {
      router.push(
        form.usageTrack === "AUTOMATIC_PLAN" ? "/plan-reveal" : "/dashboard"
      );
      return;
    }
    if (step < STEPS.length - 1) {
      // Skip amount_time for EXTERNAL
      if (
        STEPS[step + 1]?.id === "amount_time" &&
        form.usageTrack === "EXTERNAL_TRACKER"
      ) {
        setStep(step + 2);
        return;
      }
      setStep((s) => s + 1);
    }
  }

  function back() {
    if (showPlan) {
      setShowPlan(false);
      return;
    }
    if (step > 0) setStep((s) => s - 1);
  }

  const selectClass = (active: boolean) =>
    cn(
      "group cursor-pointer rounded-2xl border p-3 text-start transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-[1.02]",
      active
        ? ACTIVE_GOLD
        : cn(
            INACTIVE_SURFACE,
            "hover:shadow-[0_15px_50px_-12px_rgba(212,175,55,0.35)]"
          )
    );

  return (
    <div className="min-h-dvh luxury-mesh text-foreground">
      <div className="w-full max-w-6xl xl:max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10 page-enter">
        <FadeIn>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9a7b2c] via-[#D4AF37] to-[#D4AF37] text-2xl font-bold text-white shadow-xl shadow-[0_0_25px_rgba(212,175,55,0.35)] ring-2 ring-[#D4AF37]/30 transition-transform duration-300 hover:scale-110">
              ح
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              مرحباً بك في{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#D4AF37] to-[#f0d78c]">
                حافظ
              </span>
            </h1>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              خطوات سريعة لمسارك مع حافظ
            </p>
          </div>

          {!showPlan && (
            <>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[#0A0F1A]/80">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-[#D4AF37] to-[#D4AF37] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mb-6 text-center text-[11px] text-muted-foreground">
                الخطوة {formatArabicNumber(step + 1)} من{" "}
                {formatArabicNumber(STEPS.length)}
              </p>
            </>
          )}

          <Card
            interactive={false}
            className="border-[#D4AF37]/25 bg-card/60 backdrop-blur-xl shadow-2xl shadow-[#0A0F1A]/50 transition-all duration-300"
          >
            <CardHeader className="pb-3 border-b border-[#D4AF37]/10">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#D4AF37] ring-1 ring-[#D4AF37]/20">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg md:text-xl">
                    {showPlan
                      ? plan?.titleAr || "خطتك القرآنية المباركة"
                      : meta.title}
                  </CardTitle>
                  {!showPlan && (
                    <CardDescription className="mt-0.5">
                      {meta.subtitle}
                    </CardDescription>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-5">
              {!showPlan && meta.id === "track" && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-3">
                    {TRACK_OPTS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, usageTrack: opt.id }))
                        }
                        className={selectClass(form.usageTrack === opt.id)}
                      >
                        <p className="font-semibold text-sm">{opt.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {opt.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                  {form.usageTrack === "FREE_EXPLORER" && (
                    <p className="text-xs text-[#CBD5E1]/80 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-2">
                      اضغط «متابعة» للدخول مباشرة — يمكنك إنشاء خطة لاحقاً من
                      الإعدادات.
                    </p>
                  )}
                </div>
              )}

              {!showPlan && meta.id === "memorized" && (
                <div className="space-y-5">
                  <UnifiedMemorizationTree value={mem} onChange={setMem} />
                  {form.usageTrack === "AUTOMATIC_PLAN" &&
                    ((mem.surahSelections?.length || 0) > 0 ||
                      (mem.juzSelections?.length || 0) > 0) && (
                      <div className="space-y-3 rounded-2xl border border-[#D4AF37]/20 bg-[#0A0F1A]/60 p-4">
                        <p className="text-sm font-semibold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]">
                          نقطة انطلاق الحفظ الجديد
                        </p>
                        <p className="text-xs text-[#CBD5E1]/80 leading-relaxed">
                          محفوظ متفرّق؟ اختر من أين نبدأ الحفظ — الصفحات المحفوظة
                          تُتخطّى تلقائياً.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {START_PREF_OPTS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  hifzStartPreference: opt.id,
                                  progressionMode:
                                    opt.id === "START_FROM_BEGINNING"
                                      ? "from_start"
                                      : opt.id === "START_FROM_REVERSE"
                                        ? "bottom_up"
                                        : "continue_forward",
                                }))
                              }
                              className={selectClass(
                                form.hifzStartPreference === opt.id
                              )}
                            >
                              <p className="font-semibold text-sm">
                                {opt.title}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {opt.desc}
                              </p>
                            </button>
                          ))}
                        </div>
                        {form.hifzStartPreference ===
                          "START_FROM_CUSTOM_SURAH" && (
                          <div className="flex items-center gap-2 pt-1">
                            <label className="text-xs text-[#CBD5E1]/90">
                              رقم السورة (1–114)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={114}
                              value={form.customStartSurah}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  customStartSurah: Math.min(
                                    114,
                                    Math.max(1, Number(e.target.value) || 1)
                                  ),
                                }))
                              }
                              className="w-20 rounded-lg border border-[#D4AF37]/30 bg-[#020408] px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  {(mem.surahSelections?.length || 0) === 0 &&
                    form.usageTrack === "AUTOMATIC_PLAN" && (
                      <p className="text-xs text-[#CBD5E1]/70 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/5 px-3 py-2">
                        مبتدئ؟ ممتاز — نبدأ معك من{" "}
                        <strong className="text-[#D4AF37]">الفاتحة</strong> ثم{" "}
                        <strong className="text-[#D4AF37]">البقرة</strong>{" "}
                        بالترتيب العثماني (مع تخطّي أي محفوظ معلن).
                      </p>
                    )}
                </div>
              )}

              {!showPlan && meta.id === "amount_time" && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#f0d78c]">
                      الحفظ الجديد
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {NEW_AMOUNT.map((a) => (
                        <button
                          key={a.pages}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, pagesPerDay: a.pages }))
                          }
                          className={selectClass(form.pagesPerDay === a.pages)}
                        >
                          <p className="font-semibold text-sm">{a.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {a.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#f0d78c]">
                      سعة المراجعة اليومية
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {REVISION_AMOUNT.map((a) => (
                        <button
                          key={a.pages}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              revisionPagesPerDay: a.pages,
                            }))
                          }
                          className={selectClass(
                            form.revisionPagesPerDay === a.pages
                          )}
                        >
                          <p className="font-semibold text-sm">{a.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {a.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                    {revisionCapacityHint(
                      form.pagesPerDay,
                      form.revisionPagesPerDay
                    ) && (
                      <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90 leading-relaxed">
                        {revisionCapacityHint(
                          form.pagesPerDay,
                          form.revisionPagesPerDay
                        )}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#f0d78c]">
                      الوقت المتاح يومياً
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {TIME_OPTS.map((t) => (
                        <button
                          key={t.minutes}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, minutes: t.minutes }))
                          }
                          className={cn(
                            "rounded-xl border py-4 text-center text-sm font-bold transition-all",
                            form.minutes === t.minutes
                              ? "bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/50"
                              : "border-[#D4AF37]/15 hover:border-[#D4AF37]/30"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!showPlan && meta.id === "level_style" && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#f0d78c]">
                      تقييم حفظك
                    </p>
                    <div className="space-y-2">
                      {LEVEL_OPTS.map((l) => (
                        <button
                          key={l.key}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, strength: l.value }))
                          }
                          className={cn(
                            "flex w-full flex-col",
                            selectClass(form.strength === l.value)
                          )}
                        >
                          <span className="font-semibold text-sm">
                            {l.title}
                          </span>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {l.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#f0d78c]">
                      أسلوب التعلّم
                    </p>
                    <div className="space-y-2">
                      {LEARN_OPTS.map((l) => (
                        <button
                          key={l.key}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              learningStyle: l.key,
                            }))
                          }
                          className={cn(
                            "flex w-full flex-col",
                            selectClass(form.learningStyle === l.key)
                          )}
                        >
                          <span className="font-semibold text-sm">
                            {l.title}
                          </span>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {l.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mb-2 mt-5 text-sm font-semibold text-[#f0d78c]">
                      القارئ المفضّل
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {QARI_OPTS.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              preferredQariId: q.id,
                            }))
                          }
                          className={cn(
                            "rounded-xl border px-2 py-2 text-xs font-medium transition-all",
                            form.preferredQariId === q.id
                              ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                              : "border-[#D4AF37]/15 text-muted-foreground"
                          )}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!showPlan && meta.id === "goal_plan" && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#f0d78c]">
                      الهدف الأكبر
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {GOALS.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, goalId: g.id }))
                          }
                          className={cn(
                            "flex flex-col items-start gap-2 min-h-[7rem]",
                            selectClass(form.goalId === g.id)
                          )}
                        >
                          <span className="text-2xl">{g.emoji}</span>
                          <span className="text-sm font-medium leading-relaxed">
                            {g.label}
                          </span>
                          {form.goalId === g.id && (
                            <CheckCircle2 className="h-4 w-4 text-[#D4AF37]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#f0d78c]">
                      الموعد المفضّل للجلسة
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {HABIT_TIMES.map((h) => (
                        <button
                          key={h.ar}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, habitTime: h.ar }))
                          }
                          className={cn(
                            "rounded-xl border py-3 text-sm font-medium transition-all",
                            form.habitTime === h.ar
                              ? "bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/50"
                              : "border-[#D4AF37]/15 hover:border-[#D4AF37]/30"
                          )}
                        >
                          {h.emoji} {h.ar}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {showPlan && plan && <PlanSummaryCard plan={plan} />}

              {!showPlan && <CoachQuote text={coach} />}

              {error && (
                <p className="text-sm text-[#D4AF37] bg-[#D4AF37]/10 rounded-xl px-3 py-2 border border-[#D4AF37]/20">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row pt-2">
                {(step > 0 || showPlan) && (
                  <Button
                    variant="outline"
                    className="flex-1 border-[#D4AF37]/25 hover:bg-[#0A0F1A]/80"
                    onClick={back}
                    disabled={pending}
                  >
                    رجوع
                  </Button>
                )}
                {showPlan ? (
                  <button
                    type="button"
                    onClick={() => router.push("/plan-reveal")}
                    className="gold-cta flex-1 h-13 md:h-14 rounded-2xl text-base md:text-lg font-bold"
                  >
                    اكشف خطتي الشخصية ←
                  </button>
                ) : (
                  <Button
                    className="flex-1 gold-cta h-11 border-0"
                    onClick={next}
                    disabled={pending}
                  >
                    {pending
                      ? "جاري إعداد خطتك..."
                      : meta.id === "goal_plan"
                        ? "أنشئ خطتي المباركة"
                        : "التالي"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}

function PlanSummaryCard({ plan }: { plan: PlanResult }) {
  const cards = plan.dailyCards;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
      {/* Right (RTL first): welcome + goal + hadith */}
      <div className="space-y-4 order-1">
        <div className="quote-glass rounded-2xl p-5 md:p-6 text-center">
          <p className="text-[11px] font-semibold tracking-wide text-[#D4AF37] mb-2">
            🌿 خطتك القرآنية المباركة
          </p>
          <p className="text-xl md:text-2xl font-bold text-white">
            {plan.welcomeMessage.greeting}
          </p>
          <p className="mt-4 font-quran text-xl md:text-2xl leading-loose text-white/95">
            «وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ»
          </p>
          <p className="mt-1 text-[11px] text-[#D4AF37]/80">القمر: ١٧</p>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {plan.welcomeMessage.body}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#0A0F1A]/70 p-4">
            <p className="text-[11px] text-[#D4AF37]/90 font-medium">
              المحفوظ الحالي
            </p>
            <p className="mt-1.5 text-sm font-semibold leading-relaxed text-white">
              {plan.memorizationSummary}
            </p>
          </div>
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-4">
            <p className="text-[11px] text-[#D4AF37]/90 font-medium">
              هدف الرحلة
            </p>
            <p className="mt-1.5 text-sm font-semibold leading-relaxed text-white">
              {plan.primaryGoal || plan.goals[0]}
            </p>
          </div>
        </div>

        {plan.motivationQuotes?.[1] && (
          <div className="quote-glass rounded-2xl px-4 py-4 text-center">
            <p className="font-quran text-lg md:text-xl leading-loose text-white">
              «{plan.motivationQuotes[1].text}»
            </p>
            <p className="mt-1 text-[11px] text-[#D4AF37]/80">
              {plan.motivationQuotes[1].source}
            </p>
          </div>
        )}
      </div>

      {/* Left: daily plan cards */}
      <div className="space-y-3 order-2">
        <p className="text-sm font-semibold text-[#f0d78c] flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D4AF37]/80" />
          جدولك اليومي
        </p>
        {cards && (
          <div className="space-y-3">
            <DayCard
              emoji="🔄"
              title={cards.revision.title}
              detail={cards.revision.detail}
              minutes={cards.revision.minutes}
            />
            <DayCard
              emoji="📖"
              title={cards.newHifz.title}
              detail={cards.newHifz.detail}
              minutes={cards.newHifz.minutes}
            />
            <DayCard
              emoji="⏱️"
              title={cards.time.title}
              detail={cards.time.detail}
              minutes={cards.time.minutes}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed px-1">
          {plan.welcomeMessage.closing}
        </p>
      </div>
    </div>
  );
}

function DayCard({
  emoji,
  title,
  detail,
  minutes,
}: {
  emoji: string;
  title: string;
  detail: string;
  minutes: number;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-l from-[#0A0F1A]/50 to-transparent p-4 shadow-lg shadow-[#0A0F1A]/30">
      <span className="text-2xl">{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm text-white">{title}</p>
          {minutes > 0 && (
            <span className="gold-badge rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0">
              ~{formatArabicNumber(minutes)} د
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {detail}
        </p>
      </div>
    </div>
  );
}
