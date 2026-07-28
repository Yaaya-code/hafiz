"use client";

/**
 * Dashboard — focused progress hub (True Kiswa).
 * Critical planning path: @/application orchestration (getTodayPlan).
 * All chrome uses real local stores / LearningSnapshot (no mock-data).
 */

import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Flame,
  Heart,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  computeLocalHafizScore,
  localScoreHistoryBars,
  scoreTier,
  type LocalScoreMemoryHint,
} from "@/lib/hafiz-score";
import {
  computeDailyGoalProgress,
  computeMushafStatusCounts,
  computeWeeklyReviewCount,
  type MushafStatusCounts,
} from "@/lib/dashboard-local-stats";
import { cn, formatArabicNumber } from "@/lib/utils";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  displayName,
  summarizeMemorization,
} from "@/lib/user-profile";
import { FadeIn } from "@/components/motion/fade-in";
import { ManualWirdCard } from "@/components/track/manual-wird-card";
import { CreatePlanCta } from "@/components/track/create-plan-cta";
import { useEffect, useMemo, useState } from "react";
import { SHINE_GOLD_TEXT } from "@/lib/ui-active";
import { useOrchestratedPlan } from "@/hooks/use-orchestrated-plan";
import {
  loadAchievements,
  loadMistakes,
  loadStreak,
  type MistakeItem,
} from "@/lib/user-activity";
import { getSurah } from "@/lib/quran";
import {
  getLearningSnapshot,
  LEARNING_SNAPSHOT_EVENT,
} from "@/application";

type AchievementRow = ReturnType<typeof loadAchievements>[number];

const emptyMushaf: MushafStatusCounts = {
  mastered: 0,
  good: 0,
  needsReview: 0,
  weak: 0,
  notMemorized: 0,
};

export function DashboardView() {
  const { profile, ready: profileReady } = useHafizProfile();
  const {
    ready: planReady,
    error: planError,
    view,
    today: todayResult,
  } = useOrchestratedPlan();

  const [streakDisplay, setStreakDisplay] = useState(0);
  const [longestDisplay, setLongestDisplay] = useState(0);
  const [hafizScore, setHafizScore] = useState(0);
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  const [recentMistakes, setRecentMistakes] = useState<MistakeItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementRow[]>([]);
  const [weekReviews, setWeekReviews] = useState(0);
  const [pageStats, setPageStats] = useState<MushafStatusCounts>(emptyMushaf);
  const [goalTick, setGoalTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      const s = loadStreak();
      setStreakDisplay(s.current);
      setLongestDisplay(s.longest);
      let snap = null as ReturnType<typeof getLearningSnapshot> | null;
      let memory: LocalScoreMemoryHint[] | undefined;
      try {
        snap = getLearningSnapshot();
        memory = snap.revisionMemory as LocalScoreMemoryHint[];
      } catch {
        snap = null;
        memory = undefined;
      }
      const score = computeLocalHafizScore(memory);
      setHafizScore(score);
      setScoreHistory(localScoreHistoryBars(score));
      setRecentMistakes(
        [...loadMistakes()]
          .sort(
            (a, b) =>
              b.frequency - a.frequency ||
              (b.updatedAt || b.createdAt).localeCompare(
                a.updatedAt || a.createdAt
              )
          )
          .slice(0, 4)
      );
      setAchievements(loadAchievements().slice(0, 6));
      setWeekReviews(computeWeeklyReviewCount(snap));
      setPageStats(computeMushafStatusCounts(snap));
      setGoalTick((n) => n + 1);
    };
    refresh();
    window.addEventListener("hafiz-activity", refresh);
    window.addEventListener("hafiz-mem-updated", refresh);
    window.addEventListener("hafiz-journey-updated", refresh);
    window.addEventListener("hafiz-quiz-completed", refresh);
    window.addEventListener("hafiz-achievements-updated", refresh);
    window.addEventListener(LEARNING_SNAPSHOT_EVENT, refresh);
    return () => {
      window.removeEventListener("hafiz-activity", refresh);
      window.removeEventListener("hafiz-mem-updated", refresh);
      window.removeEventListener("hafiz-journey-updated", refresh);
      window.removeEventListener("hafiz-quiz-completed", refresh);
      window.removeEventListener("hafiz-achievements-updated", refresh);
      window.removeEventListener(LEARNING_SNAPSHOT_EVENT, refresh);
    };
  }, []);

  const tier = scoreTier(hafizScore);

  const name = profileReady ? displayName(profile) : "صديق القرآن";
  const welcome = profile.plan?.welcomeMessage;
  const plan = profile.plan;
  const [macroTab, setMacroTab] = useState<"week" | "month">("week");

  const ready = profileReady && planReady;

  const dailyGoal = useMemo(() => {
    if (!view) return { current: 0, target: 1 };
    const plannedSteps = view.steps.filter((s) => s.kind !== "finish").length;
    return computeDailyGoalProgress({
      plannedStepCount: plannedSteps,
      plannedRevisionItems: view.revision.items.length,
      profileDailyRevisionPages: plan?.dailyRevisionPages,
    });
    // goalTick forces recompute when journey / activity updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, plan?.dailyRevisionPages, goalTick]);

  if (!ready || !view) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <p className="text-center text-xs text-[#CBD5E1]/60">
          جاري بناء خطتك من محرّك حافظ…
        </p>
      </div>
    );
  }

  const totalMinutes = view.totalMinutes;
  const revisionList =
    view.revisionRows.length > 0
      ? view.revisionRows
      : view.revision.items.map((i) => ({
          label: i.label,
          reason: i.reason || "",
          minutes: 0,
        }));

  return (
    <div className="w-full space-y-6">
      {/* Track-specific entry points (non-automatic paths) */}
      {profile.usageTrack === "FREE_EXPLORER" && (
        <FadeIn>
          <CreatePlanCta compact />
        </FadeIn>
      )}
      {profile.usageTrack === "EXTERNAL_TRACKER" && (
        <FadeIn>
          <ManualWirdCard compact />
        </FadeIn>
      )}

      {/* Welcome */}
      <FadeIn>
        <Card className="overflow-hidden border-[#D4AF37]/25 bg-[#0A0F1A]/90 backdrop-blur-xl shadow-xl shadow-black/40">
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2 min-w-0">
                <div className={cn("flex items-center gap-2", SHINE_GOLD_TEXT)}>
                  <Heart className="h-4 w-4" />
                  <span className="text-xs tracking-wide">
                    {profile.onboardingComplete
                      ? "خطتك الشخصية نشطة"
                      : "مرحباً بك في حافظ"}
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold leading-snug text-white">
                  {welcome?.greeting || `أهلاً ${name} 🌿`}
                </h1>
                <p className="text-sm text-[#CBD5E1]/80 leading-relaxed max-w-2xl whitespace-pre-line line-clamp-4">
                  {view.coachingMessage ||
                    welcome?.body ||
                    "أكمل الإعداد لنبني خطة مراجعة تليق برحلتك مع القرآن."}
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {profile.memorizationSelection && (
                    <Badge variant="success">
                      {summarizeMemorization(profile.memorizationSelection)}
                    </Badge>
                  )}
                  <Badge variant={view.hifzEnabled ? "warning" : "success"}>
                    {view.hifzEnabled
                      ? "حفظ جديد مفعّل"
                      : "تأسيس — إيقاف مؤقت للجديد"}
                  </Badge>
                  {todayResult?.fromCache && (
                    <Badge variant="outline">من الذاكرة المحلية</Badge>
                  )}
                </div>
                {planError && (
                  <p className="text-xs text-red-400/90 mt-1">{planError}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {!profile.onboardingComplete && (
                  <Link
                    href="/onboarding"
                    className="gold-cta inline-flex h-8 items-center rounded-lg px-3 text-xs font-bold"
                  >
                    أكمل الإعداد
                  </Link>
                )}
                <Link
                  href="/plans/journey"
                  className="gold-cta inline-flex h-9 items-center gap-1 rounded-xl px-4 text-xs font-bold"
                >
                  رحلة اليوم
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="مراجعة اليوم" value={view.miniRevisionLabel} />
              <MiniStat label="حفظ جديد" value={view.miniNewHifzLabel} />
              <MiniStat
                label="عناصر اليوم"
                value={formatArabicNumber(view.steps.filter((s) => s.kind !== "finish").length)}
              />
              <MiniStat
                label="وقت تقديري"
                value={`${formatArabicNumber(totalMinutes)} د`}
              />
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Daily journey strip — from orchestration */}
      <Card className="border-[#D4AF37]/25 overflow-hidden">
        <CardHeader className="bg-gradient-to-l from-[#D4AF37]/12 via-[#D4AF37]/5 to-transparent">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className={cn("h-4 w-4", SHINE_GOLD_TEXT)} />
                رحلة اليوم في القرآن
              </CardTitle>
              <CardDescription className="mt-1 max-w-xl leading-relaxed">
                {view.coachIntro}
              </CardDescription>
            </div>
            <Link
              href="/plans/journey"
              className="gold-cta inline-flex h-9 items-center rounded-xl px-3 text-xs font-bold shrink-0"
            >
              افتح الرحلة كاملة
            </Link>
          </div>
          <p className="text-[11px] text-[#CBD5E1]/70 mt-2">
            {view.balanceNote} · ~{formatArabicNumber(view.totalMinutes)} دقيقة
          </p>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {view.steps.slice(0, 6).map((step) => (
            <Link
              key={step.id}
              href={step.kind === "finish" ? "/plans/journey" : step.href}
              className="flex items-start gap-3 rounded-xl border border-[#D4AF37]/15 bg-[#0A0F1A]/50 px-3 py-2.5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:border-[#D4AF37]/40 hover:shadow-[0_0_20px_rgba(212,175,55,0.35)]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-xs font-bold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]">
                {formatArabicNumber(step.order)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">
                  <span className="me-1">{step.emoji}</span>
                  {step.titleAr}
                </p>
                <p className="text-[11px] text-[#CBD5E1]/70 mt-0.5 line-clamp-1">
                  {step.subtitleAr}
                </p>
              </div>
              <span className="text-[10px] text-[#CBD5E1]/60 shrink-0">
                {formatArabicNumber(step.minutes)} د
              </span>
            </Link>
          ))}
          {view.steps.length === 0 && (
            <p className="text-sm text-[#CBD5E1]/70 text-center py-4">
              لا عناصر مخطّطة اليوم — تحقق من سعة الوقت في الإعداد.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Core stats — all from local stores / LearningSnapshot */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="overflow-hidden border-[#D4AF37]/20 bg-gradient-to-br from-[#D4AF37]/10 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[#CBD5E1]/70">درجة الحافظ</p>
                <p className={cn("mt-1 text-3xl font-bold", SHINE_GOLD_TEXT)}>
                  {formatArabicNumber(hafizScore)}
                </p>
                <p className="mt-1 text-xs text-[#CBD5E1]/60">{tier.label}</p>
              </div>
              <div className="rounded-xl bg-[#D4AF37]/15 p-2.5 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex gap-1">
              {scoreHistory.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-[#D4AF37]/30"
                  style={{
                    height: `${12 + (Math.max(0, Math.min(1000, v)) / 1000) * 28}px`,
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[#CBD5E1]/70">السلسلة اليومية</p>
                <p className={cn("mt-1 text-3xl font-bold", SHINE_GOLD_TEXT)}>
                  🔥 {formatArabicNumber(streakDisplay)}
                </p>
                <p className="mt-1 text-xs text-[#CBD5E1]/60">
                  أطول سلسلة: {formatArabicNumber(longestDisplay)} يوماً
                </p>
              </div>
              <div className="rounded-xl bg-[#D4AF37]/15 p-2.5 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]">
                <Flame className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="w-full">
                <p className="text-sm text-[#CBD5E1]/70">هدف اليوم</p>
                <p className="mt-1 text-3xl font-bold text-white">
                  {formatArabicNumber(dailyGoal.current)}
                  <span className="text-lg text-[#CBD5E1]/60">
                    /{formatArabicNumber(dailyGoal.target)}
                  </span>
                </p>
                <Progress
                  className="mt-3"
                  value={
                    (dailyGoal.current / Math.max(1, dailyGoal.target)) * 100
                  }
                />
              </div>
              <div className="rounded-xl bg-[#D4AF37]/15 p-2.5 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] ms-3">
                <Target className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[#CBD5E1]/70">مراجعات الأسبوع</p>
                <p className="mt-1 text-3xl font-bold text-white">
                  {formatArabicNumber(weekReviews)}
                </p>
                <p className="mt-1 text-xs text-[#CBD5E1]/60">وحدة مكتملة</p>
              </div>
              <div className="rounded-xl bg-[#D4AF37]/15 p-2.5 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly / Monthly — from orchestration horizons */}
      <Card className="border-[#D4AF37]/25">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className={cn("h-4 w-4", SHINE_GOLD_TEXT)} />
                الخطة الأسبوعية والشهرية
              </CardTitle>
              <CardDescription>
                من محرّك القرار والخطة — سورة بمقاييس المصحف
              </CardDescription>
            </div>
            <div className="flex rounded-xl border border-[#D4AF37]/20 p-1 bg-[#020408]/60">
              <button
                type="button"
                onClick={() => setMacroTab("week")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300",
                  macroTab === "week"
                    ? "bg-[#D4AF37]/10 border border-[#D4AF37] text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] shadow-[0_0_20px_rgba(212,175,55,0.5)] ring-1 ring-[#D4AF37]/50"
                    : "text-[#CBD5E1]/70 hover:text-[#D4AF37]"
                )}
              >
                الخطة الأسبوعية
              </button>
              <button
                type="button"
                onClick={() => setMacroTab("month")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300",
                  macroTab === "month"
                    ? "bg-[#D4AF37]/10 border border-[#D4AF37] text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] shadow-[0_0_20px_rgba(212,175,55,0.5)] ring-1 ring-[#D4AF37]/50"
                    : "text-[#CBD5E1]/70 hover:text-[#D4AF37]"
                )}
              >
                الخطة الشهرية
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {macroTab === "week" ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
              {view.weekly.map((d, i) => (
                <div
                  key={d.day + "-" + i}
                  className={cn(
                    "rounded-xl border bg-[#0A0F1A]/70 p-3 transition-all duration-500 hover:-translate-y-1 hover:border-[#D4AF37]/40 hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]",
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
                  {d.note && (
                    <p className="text-[10px] text-[#D4AF37]/80 mt-1.5 leading-snug">
                      {d.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {view.monthly.map((w) => (
                <div
                  key={w.week}
                  className="rounded-2xl border border-[#D4AF37]/20 bg-[#0A0F1A]/70 p-4 transition-all duration-500 hover:border-[#D4AF37]/40 hover:shadow-[0_0_20px_rgba(212,175,55,0.35)]"
                >
                  <p className={cn("text-xs mb-1", SHINE_GOLD_TEXT)}>
                    الأسبوع {formatArabicNumber(w.week)}
                  </p>
                  <p className="text-sm font-bold text-white">{w.focusAr}</p>
                  <p className="mt-1 text-xs text-[#CBD5E1]/70 leading-relaxed">
                    {w.detailAr}
                  </p>
                  {w.days && w.days.length > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-[#D4AF37]/10 pt-3">
                      {w.days.map((day) => (
                        <li
                          key={day.dayIndex}
                          className="text-[11px] text-[#CBD5E1]/80 leading-snug"
                        >
                          <span className={cn("me-1", SHINE_GOLD_TEXT)}>
                            يوم {formatArabicNumber(day.dayIndex)}:
                          </span>
                          {day.revision}
                          {day.newHifz && day.newHifz !== "—"
                            ? " · " + day.newHifz
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's revision — from plan items */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>مراجعة اليوم</CardTitle>
              <CardDescription>
                {view.miniRevisionLabel !== "—"
                  ? view.miniRevisionLabel
                  : "سورة مركّزة"}{" "}
                · حوالي {formatArabicNumber(view.revision.minutes || totalMinutes)}{" "}
                دقيقة
              </CardDescription>
            </div>
            <Link
              href="/plans/journey"
              className="gold-cta inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-bold"
            >
              ابدأ
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {revisionList.length === 0 ? (
              <p className="text-sm text-[#CBD5E1]/70 py-3 text-center">
                لا مراجعة مخطّطة اليوم — قد يكون التركيز على الحفظ أو الراحة.
              </p>
            ) : (
              revisionList.map((item, i) => (
                <div
                  key={"rev-" + i + (item.label || "")}
                  className="flex items-center justify-between rounded-xl border border-[#D4AF37]/15 bg-[#0A0F1A]/50 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-sm font-bold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]">
                      📖
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.label}
                      </p>
                      <p className="text-xs text-[#CBD5E1]/60">
                        {item.reason || ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success">اليوم</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* قبل النسيان — from SRS-ranked revision */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">قبل النسيان</CardTitle>
            <CardDescription>
              أولويات المراجعة من محرّك التثبيت
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {view.forgetRows.length === 0 ? (
              <p className="text-xs text-[#CBD5E1]/60 py-2">
                لا عناصر عالية الأولوية الآن.
              </p>
            ) : (
              view.forgetRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-lg border border-[#D4AF37]/10 bg-[#0A0F1A]/50 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-white">{row.title}</span>
                  <span className="text-xs text-[#CBD5E1]/60">
                    أولوية{" "}
                    {formatArabicNumber(Math.round((1 - row.confidence) * 100))}
                    %
                  </span>
                </div>
              ))
            )}
            <Button variant="soft" className="mt-2 w-full" size="sm">
              <Link href="/plans/journey">راجع الآن</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Compact status row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">حالة المصحف</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: "متقن",
                count: pageStats.mastered,
                color: "bg-[#D4AF37]",
              },
              {
                label: "جيد",
                count: pageStats.good,
                color: "bg-[#D4AF37]/80",
              },
              {
                label: "يحتاج مراجعة",
                count: pageStats.needsReview,
                color: "bg-[#D4AF37]/50",
              },
              {
                label: "ضعيف",
                count: pageStats.weak,
                color: "bg-[#D4AF37]/30",
              },
              {
                label: "غير محفوظ",
                count: pageStats.notMemorized,
                color: "bg-muted-foreground/30",
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 text-sm">
                <div className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
                <span className="flex-1 text-[#CBD5E1]/70">{row.label}</span>
                <span className="font-semibold text-white">
                  {formatArabicNumber(row.count)}
                </span>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full">
              <Link href="/stats">عرض التقدم</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">أخطاء حديثة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentMistakes.length === 0 ? (
              <p className="text-xs text-[#CBD5E1]/60 py-2 text-center">
                لا أخطاء مسجّلة بعد — أحسنت.
              </p>
            ) : (
              recentMistakes.map((m) => {
                const surahName =
                  getSurah(m.surahNumber)?.nameAr ||
                  "سورة " + formatArabicNumber(m.surahNumber);
                return (
                  <div
                    key={m.id}
                    className="rounded-xl border border-[#D4AF37]/10 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-white">
                        {surahName}
                        {m.ayahNumber
                          ? " : " + formatArabicNumber(m.ayahNumber)
                          : ""}
                      </span>
                      <Badge variant="warning">
                        ×{formatArabicNumber(m.frequency)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#CBD5E1]/60">
                      {m.note || m.type}
                    </p>
                  </div>
                );
              })
            )}
            <Button variant="outline" size="sm" className="w-full">
              <Link href="/mistakes">كل الأخطاء</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">الإنجازات</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            {achievements.length === 0 ? (
              <p className="col-span-3 text-xs text-[#CBD5E1]/60 text-center py-2">
                ابدأ رحلتك لفتح الإنجازات
              </p>
            ) : (
              achievements.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border p-2 text-center ${
                    a.unlocked
                      ? "border-[#D4AF37]/30 bg-[#D4AF37]/5 shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                      : "border-border/40 opacity-50 grayscale"
                  }`}
                  title={a.title}
                >
                  <div className="text-xl">{a.icon}</div>
                  <p className="mt-1 truncate text-[10px] font-medium">
                    {a.title}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#D4AF37]/15 bg-[#020408]/50 px-3 py-2">
      <p className="text-[10px] text-[#CBD5E1]/60">{label}</p>
      <p className="text-sm font-semibold mt-0.5 text-white line-clamp-2">
        {value}
      </p>
    </div>
  );
}
