"use client";

/**
 * First-time wow: personalized plan reveal after onboarding.
 * Data only from @/application (refreshLearningState / generateJourneyPlan).
 * True Kiswa visual language — no redesign of the design system.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Compass,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import {
  generateJourneyPlan,
  getLearningSnapshot,
  refreshLearningState,
  type Decision,
  type JourneyPlanResult,
  type TodayPlanResult,
} from "@/application";
import {
  mapOrchestrationToDashboard,
  type DashboardPlanView,
} from "@/application/mappers/plan-to-dashboard";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  displayName,
  summarizeMemorization,
} from "@/lib/user-profile";
import { FadeIn } from "@/components/motion/fade-in";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatArabicNumber } from "@/lib/utils";
import { SHINE_GOLD_TEXT } from "@/lib/ui-active";

function trackLabelAr(decision: Decision): string {
  switch (decision.track) {
    case "bottom_up":
      return "مسار التأسيس — من جزء عمّ (الناس صعوداً)";
    case "continue_from_last_surah":
      return "مسار المتابعة — من آخر سورة محفوظة";
    case "fragmented_revision_only":
      return "مسار الترتيب — مراجعة أولاً لأن المحفوظ متفرّق";
    default:
      return "مسار متوازن حسب حالتك";
  }
}

function strategyBullets(decision: Decision): string[] {
  const bullets: string[] = [];
  bullets.push(trackLabelAr(decision));

  if (decision.revisionOnly || !decision.newHifzEnabled) {
    bullets.push("الحفظ الجديد متوقّف مؤقتاً — الأولوية لتثبيت ما تحفظ.");
  } else {
    bullets.push("الحفظ الجديد مفعّل ضمن سعة يومك، مع مراجعة تحمي البناء.");
  }

  if (decision.lockProgression) {
    bullets.push("التقدّم مقفول حتى يستقر الحفظ (أمان تربوي).");
  }
  if (decision.recoveryRequired) {
    bullets.push("هناك محتوى يحتاج استرجاعاً قبل التوسّع.");
  }
  if (decision.additionalListeningPractice) {
    bullets.push("زيادة الاستماع ضمن الخطة.");
  }
  if (decision.additionalMistakeReview) {
    bullets.push("مراجعة أخطاء إضافية مفعّلة.");
  }
  if (decision.dailyCapacity.minutes != null) {
    bullets.push(
      `سقف يومك ≈ ${formatArabicNumber(decision.dailyCapacity.minutes)} دقيقة.`
    );
  }
  return bullets;
}

function explainDecision(decision: Decision, appliedRules: readonly string[]): string[] {
  const why: string[] = [];

  // Mother-friendly explanations — no internal rule codes
  if (appliedRules.includes("S-001")) {
    why.push("نركّز أولاً على تثبيت ما تحفظينه قبل التوسّع.");
  }
  if (appliedRules.includes("S-002")) {
    why.push("لأنكِ في البداية: نبدأ من جزء عم بلطف.");
  }
  if (appliedRules.includes("S-003")) {
    why.push(
      decision.track === "fragmented_revision_only"
        ? "محفوظك في أكثر من موضع — نثبّت أولاً ثم نكمل بلطف."
        : "نكمل من موضع حفظك الحالي في المصحف."
    );
  }
  if (appliedRules.includes("S-004")) {
    why.push("نلتزم بوقت يومك ولا نحمّلك فوق طاقتك.");
  }
  if (appliedRules.includes("P-001")) {
    why.push(
      decision.allowNewHifz
        ? "الحفظ الجديد مفتوح ضمن قدرتك اليوم."
        : "نثبّت المحفوظ أولاً قبل الحفظ الجديد."
    );
  }
  if (appliedRules.includes("P-004") || decision.lockProgression) {
    why.push("نبطئ قليلاً حتى يستقرّ الحفظ.");
  }
  if (appliedRules.includes("R-003") || decision.recoveryRequired) {
    why.push("هناك مواضع تحتاج استرجاعاً قبل التوسّع.");
  }
  if (appliedRules.includes("R-001") || decision.revisionPriority) {
    why.push("المراجعة اليوم أهم من التوسّع في الحفظ.");
  }

  // Soft Arabic messages from rules (strip technical ids)
  for (const r of decision.reasons.slice(0, 3)) {
    if (r.message && r.message.length > 12 && !/^[A-Z]-\d{3}/.test(r.message)) {
      const msg = r.message.slice(0, 140);
      if (!why.some((w) => w.includes(msg.slice(0, 40)))) {
        why.push(msg);
      }
    }
  }

  if (why.length === 0) {
    why.push(
      "الخطة مبنية على ما أدخلتِه من محفوظك، ووقت يومك، وهدف إكمال القرآن."
    );
  }
  return why.slice(0, 8);
}

export function PlanRevealView() {
  const { profile, ready: profileReady } = useHafizProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<TodayPlanResult | null>(null);
  const [week, setWeek] = useState<JourneyPlanResult | null>(null);
  const [view, setView] = useState<DashboardPlanView | null>(null);
  const [pathReason, setPathReason] = useState<string>("");

  useEffect(() => {
    if (!profileReady) return;
    try {
      // Force today once from the new profile. Week/month must NOT force-wipe
      // today's :1 cache (that was the Journey-entry thrash path).
      const refreshed = refreshLearningState({ force: true });
      const weekPlan = generateJourneyPlan({ days: 7, force: false });
      const monthPlan = generateJourneyPlan({ days: 30, force: false });
      const mapped = mapOrchestrationToDashboard({
        today: refreshed.today,
        week: weekPlan,
        month: monthPlan,
      });
      setToday(refreshed.today);
      setWeek(weekPlan);
      setView(mapped);
      try {
        const snap = getLearningSnapshot();
        setPathReason(
          snap.lastPathResolution?.reasonAr ||
            snap.architecture?.lastPath?.reasonAr ||
            ""
        );
      } catch {
        setPathReason("");
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر بناء خطتك");
    } finally {
      setLoading(false);
    }
  }, [profileReady, profile.onboardingComplete, profile.completedAt]);

  if (!profileReady || loading || !view || !today) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <Skeleton className="h-10 w-2/3 mx-auto" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <p className={cn("text-center text-sm", SHINE_GOLD_TEXT)}>
          جاري صياغة خطتك الشخصية من محرّك حافظ…
        </p>
      </div>
    );
  }

  const name = displayName(profile);
  const decision = today.decision;
  const firstAction = view.steps.find((s) => s.kind !== "finish") ?? view.steps[0];
  const strategy = strategyBullets(decision);
  const why = explainDecision(decision, today.appliedRules);
  const weekCards = view.weekly;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:py-12">
      <FadeIn>
        <div className="text-center space-y-3">
          <div className={cn("inline-flex items-center gap-2 text-sm", SHINE_GOLD_TEXT)}>
            <Sparkles className="h-4 w-4" />
            <span>خُطّتك جاهزة</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white leading-snug">
            {name}، هذه خطتك مع القرآن
          </h1>
          <p className="text-sm text-[#CBD5E1]/80 max-w-xl mx-auto leading-relaxed">
            بُنيت للتو من إجاباتك — قرار تربوي واضح، ثم ورد اليوم والأسبوع.
          </p>
        </div>
      </FadeIn>

      {error && (
        <p className="text-center text-sm text-red-400/90 border border-red-400/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {/* Profile summary */}
      <FadeIn delay={0.05}>
        <Card className="border-[#D4AF37]/25 bg-[#0A0F1A]/90 backdrop-blur-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className={cn("h-4 w-4", SHINE_GOLD_TEXT)} />
              ملخص ملفك
            </CardTitle>
            <CardDescription>ما سجّلناه لنبني الخطة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {profile.memorizationSelection && (
                <Badge variant="success">
                  {summarizeMemorization(profile.memorizationSelection)}
                </Badge>
              )}
              <Badge variant="outline">
                {formatArabicNumber(profile.dailyMinutes)} د / يوم
              </Badge>
              <Badge variant="outline">
                {profile.pagesPerDay === 0
                  ? "مراجعة فقط"
                  : `${formatArabicNumber(profile.pagesPerDay)} ص حفظ`}
              </Badge>
              <Badge variant="warning">
                ثبات: {formatArabicNumber(profile.memorizationStrength)}/٥
              </Badge>
              {profile.goals?.[0] && (
                <Badge variant="secondary">{profile.goals[0]}</Badge>
              )}
            </div>
            {pathReason ? (
              <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2.5">
                <p className={cn("text-[11px] font-semibold mb-1", SHINE_GOLD_TEXT)}>
                  أين نكمل الحفظ الجديد؟
                </p>
                <p className="text-sm text-white leading-relaxed">{pathReason}</p>
                <p className="text-[11px] text-[#CBD5E1]/70 mt-1">
                  التثبيت (المراجعة) لما تحفظينه أصلاً · الحفظ الجديد لما لم يُحفظ بعد
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Mini label="الأسلوب" value={styleLabel(profile.learningStyle)} />
              <Mini label="المراجعة" value={revStyleLabel(profile.revisionStyle)} />
              <Mini
                label="المسار"
                value={
                  profile.progressionMode === "from_start"
                    ? "من البداية"
                    : "متابعة"
                }
              />
              <Mini
                label="القواعد"
                value={formatArabicNumber(today.appliedRules.length)}
              />
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Strategy */}
      <FadeIn delay={0.1}>
        <Card className="border-[#D4AF37]/25">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Compass className={cn("h-4 w-4", SHINE_GOLD_TEXT)} />
              استراتيجيتك الشخصية
            </CardTitle>
            <CardDescription>
              كيف سيتعامل حافظ مع حفظك ومراجعتك
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {strategy.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-[#CBD5E1]/90 leading-relaxed"
                >
                  <CheckCircle2
                    className={cn("h-4 w-4 mt-0.5 shrink-0", SHINE_GOLD_TEXT)}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Why this plan */}
      <FadeIn delay={0.12}>
        <Card className="border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/8 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className={cn("h-4 w-4", SHINE_GOLD_TEXT)} />
              لماذا هذه الخطة؟
            </CardTitle>
            <CardDescription>
              شرح قرار المحرّك (Logic Bible) — بشفافية
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {why.map((line, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#D4AF37]/15 bg-[#020408]/50 px-3 py-2.5 text-sm text-[#CBD5E1]/90 leading-relaxed"
              >
                {line}
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {today.appliedRules.map((id) => (
                <Badge key={id} variant="outline" className="text-[10px]">
                  {id}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* First week */}
      <FadeIn delay={0.15}>
        <Card className="border-[#D4AF37]/25">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className={cn("h-4 w-4", SHINE_GOLD_TEXT)} />
              نظرة على أسبوعك الأول
            </CardTitle>
            <CardDescription>
              سبعة أيام من محرّك الخطة — مراجعة وحفظ بمقاييس المصحف
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
              {weekCards.map((d, i) => (
                <div
                  key={d.day + i}
                  className={cn(
                    "rounded-xl border bg-[#0A0F1A]/70 p-3",
                    d.isAnchor
                      ? "border-[#D4AF37] shadow-[0_0_16px_rgba(212,175,55,0.35)]"
                      : "border-[#D4AF37]/15"
                  )}
                >
                  <p className={cn("text-xs mb-2", SHINE_GOLD_TEXT)}>{d.day}</p>
                  <p className="text-[11px] text-white font-medium leading-snug">
                    🔄 {d.revision}
                  </p>
                  <p className="text-[11px] text-[#CBD5E1]/70 mt-1.5 leading-snug">
                    📖 {d.newHifz}
                  </p>
                </div>
              ))}
            </div>
            {week && (
              <p className="text-[11px] text-[#CBD5E1]/60 mt-3 text-center">
                {formatArabicNumber(week.plan.days.length)} أيام · سعة تقريبية{" "}
                {formatArabicNumber(decision.dailyCapacity.minutes ?? 0)} د/يوم
              </p>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Today's first action */}
      <FadeIn delay={0.18}>
        <Card className="border-[#D4AF37]/40 overflow-hidden shadow-[0_0_40px_rgba(212,175,55,0.15)]">
          <CardHeader className="bg-gradient-to-l from-[#D4AF37]/15 via-[#D4AF37]/5 to-transparent">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className={cn("h-4 w-4", SHINE_GOLD_TEXT)} />
              أول خطوة اليوم
            </CardTitle>
            <CardDescription>
              ابدأ من هنا — باقي الورد ينتظرك في الرحلة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {firstAction ? (
              <div className="flex items-start gap-3 rounded-2xl border border-[#D4AF37]/25 bg-[#020408]/60 px-4 py-4">
                <span className="text-2xl">{firstAction.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-white">
                    {firstAction.titleAr}
                  </p>
                  <p className="text-sm text-[#CBD5E1]/80 mt-1 leading-relaxed">
                    {firstAction.subtitleAr}
                  </p>
                  <p className="text-xs text-[#D4AF37]/90 mt-2">
                    ≈ {formatArabicNumber(firstAction.minutes)} دقيقة
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#CBD5E1]/70">
                افتح رحلة اليوم لعرض وردك الكامل.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                href={firstAction?.href || "/plans/journey"}
                className="gold-cta flex-1 inline-flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold"
              >
                ابدأ أول خطوة
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="flex-1 inline-flex h-12 items-center justify-center rounded-2xl border border-[#D4AF37]/30 text-sm font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
              >
                إلى لوحة التحكم
              </Link>
            </div>
            <p className="text-center text-[11px] text-[#CBD5E1]/55">
              {view.balanceNote}
            </p>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#D4AF37]/15 bg-[#020408]/50 px-3 py-2">
      <p className="text-[10px] text-[#CBD5E1]/60">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5 line-clamp-2">
        {value}
      </p>
    </div>
  );
}

function styleLabel(s?: string): string {
  switch (s) {
    case "LISTENING":
      return "استماع";
    case "READING":
      return "قراءة";
    case "WRITING":
      return "كتابة";
    case "WITH_TEACHER":
      return "مع معلّم";
    case "LISTEN_AND_READ":
    default:
      return "استماع+قراءة";
  }
}

function revStyleLabel(s?: string): string {
  switch (s) {
    case "intensive":
      return "مكثّفة";
    case "light":
      return "خفيفة";
    default:
      return "متوازنة";
  }
}
