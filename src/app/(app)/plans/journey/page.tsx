"use client";

/**
 * رحلة اليوم — True Kiswa & Metallic Gold widescreen dashboard.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  GraduationCap,
  Headphones,
  Lock,
  Sparkles,
  Sprout,
} from "lucide-react";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { useOrchestratedPlan } from "@/hooks/use-orchestrated-plan";
import {
  completeSession,
  type DashboardJourneyStep,
} from "@/application";
import {
  getStepLockState,
  loadJourneyProgress,
  type JourneyProgress,
} from "@/lib/journey-progress";
import type { JourneyStep } from "@/lib/quran/types";
import { summarizeMemorization } from "@/lib/user-profile";
import { formatArabicNumber, cn } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { BackButton } from "@/components/layout/back-button";

function toJourneySteps(steps: DashboardJourneyStep[]): JourneyStep[] {
  return steps.map((s) => ({
    id: s.id,
    order: s.order,
    kind: s.kind,
    titleAr: s.titleAr,
    subtitleAr: s.subtitleAr,
    minutes: s.minutes,
    emoji: s.emoji,
    href: s.href,
    surahNumber: s.surahNumber,
    fromAyah: s.fromAyah,
    toAyah: s.toAyah,
    reason: s.reason,
  }));
}

const glass =
  "group cursor-pointer relative overflow-hidden backdrop-blur-2xl bg-[#0A0F1A]/90 border border-[#D4AF37]/15 shadow-xl shadow-black/50 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-2 hover:scale-[1.03] hover:border-[#D4AF37]/40 hover:shadow-[0_15px_40px_-10px_rgba(212,175,55,0.5)] hover:bg-gradient-to-br hover:from-[#0A0F1A] hover:to-[#D4AF37]/5 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-to-tr after:from-transparent after:via-white/5 after:to-transparent after:translate-x-[-100%] hover:after:translate-x-[100%] after:transition-transform after:duration-700";

export default function DailyJourneyPage() {
  const { profile, ready: profileReady } = useHafizProfile();
  const { ready: planReady, view, refresh } = useOrchestratedPlan();
  const [progress, setProgress] = useState<JourneyProgress>({
    date: "",
    completedStepIds: [],
    finished: false,
  });

  const steps = useMemo(
    () => toJourneySteps(view?.steps ?? []),
    [view?.steps]
  );

  useEffect(() => {
    setProgress(loadJourneyProgress());
    const onUp = () => setProgress(loadJourneyProgress());
    const onSnap = () => refresh(false);
    window.addEventListener("hafiz-journey-updated", onUp);
    window.addEventListener("hafiz-learning-snapshot-updated", onSnap);
    return () => {
      window.removeEventListener("hafiz-journey-updated", onUp);
      window.removeEventListener("hafiz-learning-snapshot-updated", onSnap);
    };
  }, [refresh]);

  if (!profileReady || !planReady) {
    return (
      <p className="p-8 text-sm text-muted-foreground">جاري تحميل رحلتك...</p>
    );
  }

  /**
   * Empty state for new users without a real daily plan —
   * never show "finish the journey" chrome on an empty shell.
   */
  const noRealPlan =
    !view ||
    steps.length === 0 ||
    profile.hasActivePlan === false;

  if (noRealPlan) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-10 px-4 text-center">
        <BackButton href="/dashboard" label="رجوع" />
        <div
          className={cn(
            glass,
            "rounded-3xl p-8 space-y-4 text-center cursor-default hover:translate-y-0 hover:scale-100"
          )}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D4AF37]/15 text-3xl">
            🌿
          </div>
          <h1 className="text-2xl font-bold text-white">ابدأ رحلة الحفظ</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            لا توجد خطة يومية مسجّلة بعد. أجب عن أسئلة قصيرة لنبنى لك ورداً
            يناسب مستواك ووقتك — أو ابدأ فوراً من التسميع والتلقين.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/onboarding"
              className="gold-cta inline-flex h-12 items-center justify-center rounded-xl px-6 text-sm font-bold"
            >
              بناء خطتي
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[#D4AF37]/30 px-6 text-sm text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              التسميع والتلقين
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const lock = getStepLockState(steps, progress);
  const doneSet = new Set(progress.completedStepIds);
  const doneCount = steps.filter((s) => doneSet.has(s.id)).length;
  const pct = Math.round((doneCount / Math.max(1, steps.length)) * 100);
  const current = steps.find((s) => s.id === lock.currentStepId);

  const revisionSteps = steps.filter((s) => s.kind === "revision");
  const revisionTags = revisionSteps
    .map((s) => s.subtitleAr || s.titleAr)
    .filter(Boolean)
    .slice(0, 8);

  function markFinish() {
    const result = completeSession({
      sessionKind: "reflect",
      planItemId: "finish",
      outcome: "success",
      quality: 4,
      autoReplan: true,
    });
    setProgress(loadJourneyProgress());
    if (result.replanRecommended) refresh(true);
  }

  return (
    <div className="w-full space-y-6">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <BackButton href="/dashboard" label="رجوع" />
            <div className="flex items-center gap-2 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
              <GraduationCap className="h-5 w-5" />
              <span className="text-xs font-semibold tracking-wide">
                خطة معلم — خطوات متسلسلة
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight">
              رحلة اليوم في{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#D4AF37] to-[#f0d78c]">
                القرآن
              </span>
            </h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
              {view.coachIntro}
            </p>
          </div>
          <div
            className={cn(
              glass,
              "rounded-2xl px-5 py-4 min-w-[9rem] text-center"
            )}
          >
            <p className="text-[11px] text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold font-medium">الوقت اليوم</p>
            <p className="mt-1 text-2xl font-bold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
              ~{formatArabicNumber(view.totalMinutes)}
              <span className="text-sm font-medium text-muted-foreground ms-1">
                د
              </span>
            </p>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* ─── Primary column (RTL first = right) ─── */}
        <div className="lg:col-span-7 space-y-5 order-1">
          {/* Progress ring card */}
          <div
            className={cn(glass, "rounded-3xl p-5 md:p-6")}
          >
            <div className="flex flex-wrap items-center gap-5">
              <ProgressRing pct={pct} done={doneCount} total={steps.length} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-white transition-colors duration-300 group-hover:text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
                    تقدمك اليوم
                  </h2>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold border",
                      lock.allDone
                        ? "border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold shadow-[0_0_20px_rgba(212,175,55,0.2)]"
                        : "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold"
                    )}
                  >
                    {lock.allDone
                      ? "مكتملة ✨"
                      : formatArabicNumber(pct) + "%"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {view.balanceNote}
                </p>
                <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                  <div
                    className="h-full rounded-full progress-metallic transition-[width] duration-1000 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {formatArabicNumber(doneCount)} /{" "}
                  {formatArabicNumber(steps.length)} خطوات · ~
                  {formatArabicNumber(view.totalMinutes)} دقيقة
                </p>
              </div>
            </div>
          </div>

          {/* Current step CTA */}
          {current && !lock.allDone && (
            <div
              className={cn(
                glass,
                "rounded-3xl p-5 md:p-6 border-[#D4AF37]/40 shadow-[0_0_30px_rgba(212,175,55,0.25)] animate-pulse-soft step-active-pulse ring-2 ring-[#D4AF37]/60"
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4AF37] opacity-40" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.6)]" />
                </span>
                <p className="text-xs font-semibold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold tracking-wide">
                  الخطوة الحالية — مفتوحة الآن
                </p>
              </div>
              <div className="flex items-start gap-4">
                <span className="text-4xl drop-shadow-lg animate-float-soft inline-block">
                  {current.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg md:text-xl font-bold text-white">
                    {formatArabicNumber(current.order)}. {current.titleAr}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {current.subtitleAr}
                  </p>
                  {current.surahNumber && (
                    <p className="text-xs text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold mt-2 font-medium">
                      الهدف: سورة رقم {formatArabicNumber(current.surahNumber)}
                      {current.fromAyah
                        ? " · آيات " +
                          formatArabicNumber(current.fromAyah) +
                          "–" +
                          formatArabicNumber(
                            current.toAyah || current.fromAyah
                          )
                        : ""}
                    </p>
                  )}
                  {current.teacherNote && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      💡 {current.teacherNote}
                    </p>
                  )}
                  <div className="mt-4">
                    {current.kind === "finish" ? (
                      <button
                        type="button"
                        onClick={markFinish}
                        className="gold-cta inline-flex h-11 items-center rounded-xl px-5 text-sm font-bold"
                      >
                        أنه الرحلة
                      </button>
                    ) : (
                      <Link
                        href={current.href}
                        className="gold-cta inline-flex h-11 items-center rounded-xl px-5 text-sm font-bold"
                      >
                        ابدأ هذه الخطوة ←
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {lock.allDone && (
            <div
              className={cn(
                glass,
                "rounded-3xl p-8 text-center border-[#D4AF37]/30 shadow-[0_0_40px_rgba(212,175,55,0.12)]"
              )}
            >
              <p className="text-5xl mb-3">✨</p>
              <h2 className="text-xl md:text-2xl font-bold text-white">
                أحسنت — أنهيت رحلة اليوم
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                ثبّت السلسلة وعد غداً بنفس الروح.
              </p>
            </div>
          )}

          {/* Timeline steps */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#f0d78c] px-1 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]/80 shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
              خطوات الرحلة
            </h2>
            {steps.map((step) => {
              const done = doneSet.has(step.id);
              const isCurrent = lock.currentStepId === step.id;
              const isLocked = lock.lockedIds.has(step.id);

              return (
                <div
                  key={step.id}
                  className={cn(
                    glass,
                    "rounded-2xl p-4",
                    done &&
                      "border-[#D4AF37]/35 bg-[#0A0F1A]/80 shadow-[0_0_20px_rgba(212,175,55,0.12)]",
                    isCurrent &&
                      "bg-[#D4AF37]/10 border border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.6)] ring-1 ring-[#D4AF37]/50 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold backdrop-blur-md step-active-pulse animate-pulse",
                    isLocked && "opacity-60 cursor-default hover:translate-y-0 hover:scale-100 hover:shadow-none hover:border-[#D4AF37]/15"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {done ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#9a7b2c] to-[#D4AF37] shadow-[0_0_16px_rgba(212,175,55,0.35)] transition-transform duration-500 group-hover:scale-110">
                          <CheckCircle2 className="h-5 w-5 text-[#020408]" />
                        </div>
                      ) : isLocked ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-800/60 backdrop-blur-sm">
                          <Lock className="h-4 w-4 text-slate-400" />
                        </div>
                      ) : isCurrent ? (
                        <div className="relative flex h-8 w-8 items-center justify-center step-active-pulse rounded-full ring-2 ring-[#D4AF37]/60 shadow-[0_0_20px_rgba(212,175,55,0.5)]">
                          <span className="absolute inset-0 animate-ping rounded-full bg-[#D4AF37]/30" />
                          <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#D4AF37]/70 bg-[#0A0F1A] animate-float-soft">
                            <Circle className="h-4 w-4 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold fill-[#D4AF37]/30" />
                          </span>
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-slate-900/50 transition-transform duration-500 group-hover:scale-110">
                          <Circle className="h-4 w-4 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-lg",
                            isCurrent && "animate-float-soft inline-block"
                          )}
                        >
                          {step.emoji}
                        </span>
                        <p className="font-semibold text-sm text-white">
                          {formatArabicNumber(step.order)}. {step.titleAr}
                        </p>
                        {done && (
                          <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-semibold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
                            مكتمل
                          </span>
                        )}
                        {isCurrent && (
                          <span className="rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/15 px-2 py-0.5 text-[10px] font-semibold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold shadow-[0_0_12px_rgba(212,175,55,0.25)]">
                            مفتوح
                          </span>
                        )}
                        {isLocked && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 backdrop-blur-sm">
                            مقفل
                          </span>
                        )}
                        <span className="rounded-full border border-[#D4AF37]/15 bg-slate-900/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {formatArabicNumber(step.minutes)} د
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {step.subtitleAr}
                      </p>
                      {step.surahNumber && (
                        <p className="text-[11px] text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.7)] font-semibold mt-0.5">
                          → سورة {formatArabicNumber(step.surahNumber)}
                          {step.fromAyah
                            ? " آيات " +
                              formatArabicNumber(step.fromAyah) +
                              "–" +
                              formatArabicNumber(
                                step.toAyah || step.fromAyah
                              )
                            : ""}
                        </p>
                      )}
                      <div className="mt-3">
                        {isLocked ? (
                          <span className="text-[11px] text-slate-500">
                            أكمل الخطوة السابقة أولاً
                          </span>
                        ) : done ? (
                          <span className="text-[11px] text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold font-medium">
                            ✔ مكتمل
                          </span>
                        ) : step.kind === "finish" ? (
                          <button
                            type="button"
                            onClick={markFinish}
                            className="inline-flex h-8 items-center rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 text-[11px] font-semibold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold transition-all duration-300 hover:scale-105 hover:bg-[#D4AF37]/20 hover:shadow-[0_0_15px_rgba(212,175,55,0.35)] active:scale-95"
                          >
                            أنه الرحلة
                          </button>
                        ) : (
                          <Link
                            href={step.href}
                            className={cn(
                              "inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-bold text-black transition-all duration-300 hover:scale-105 active:scale-95",
                              isCurrent
                                ? "bg-[#D4AF37] shadow-[0_0_16px_rgba(212,175,55,0.35)] hover:shadow-[0_0_25px_rgba(212,175,55,0.5)] hover:bg-[#f0d78c]"
                                : "bg-[#D4AF37]/90 text-white hover:bg-[#D4AF37] hover:text-black"
                            )}
                          >
                            ابدأ
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Side column (context) ─── */}
        <aside className="lg:col-span-5 space-y-4 order-2 lg:sticky lg:top-24">
          {/* Lesson plan breakdown */}
          <div className={cn(glass, "rounded-3xl p-5")}>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3 transition-colors duration-300 group-hover:text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
              <BookOpen className="h-4 w-4 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold transition-transform duration-300 group-hover:-translate-x-1" />
              خطّة الدرس
            </h3>
            <ul className="space-y-2.5 text-sm">
              <PlanRow
                icon={<BookOpen className="h-3.5 w-3.5" />}
                label="ورد المراجعة"
                value={
                  formatArabicNumber(
                    steps.filter((s) => s.kind === "revision").length
                  ) + " سور / مقاطع"
                }
              />
              <PlanRow
                icon={<Sprout className="h-3.5 w-3.5" />}
                label="ورد الحفظ"
                value={
                  steps.find((s) => s.kind === "new_hifz")?.titleAr ||
                  "—"
                }
              />
              <PlanRow
                icon={<Headphones className="h-3.5 w-3.5" />}
                label="استماع"
                value={
                  formatArabicNumber(
                    steps.filter((s) => s.kind === "listening").length
                  ) + " جلسة"
                }
              />
              <PlanRow
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="إجمالي الوقت"
                value={"~" + formatArabicNumber(view.totalMinutes) + " د"}
              />
            </ul>
          </div>

          {/* Revision tags */}
          {revisionTags.length > 0 && (
            <div className={cn(glass, "rounded-3xl p-5")}>
              <h3 className="text-sm font-bold text-white mb-3 transition-colors duration-300 group-hover:text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
                سور / مقاطع المراجعة اليوم
              </h3>
              <div className="flex flex-wrap gap-2">
                {revisionTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-medium text-[#f0d78c]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {profile.memorizationSelection && (
                <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold" />
                  من محفوظك: {summarizeMemorization(profile.memorizationSelection)}
                </p>
              )}
            </div>
          )}

          {/* Motivational ayah */}
          <div
            className={cn(
              glass,
              "rounded-3xl p-5 border-[#D4AF37]/25 shadow-[0_0_30px_rgba(212,175,55,0.08)]"
            )}
          >
            <p className="text-[11px] font-semibold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold mb-2 tracking-wide transition-colors duration-300 group-hover:text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
              آية اليوم
            </p>
            <p className="font-quran text-lg md:text-xl leading-loose text-center text-white">
              «وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ»
            </p>
            <p className="mt-2 text-center text-[11px] text-[#D4AF37] drop-shadow-[0_0_6px_rgba(212,175,55,0.6)]">
              القمر: ١٧
            </p>
          </div>

          {/* Quick actions */}
          <div className={cn(glass, "rounded-3xl p-5")}>
            <h3 className="text-sm font-bold text-white mb-3 transition-colors duration-300 group-hover:text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
              اختصارات سريعة
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickLink href="/plans/revision" label="ورد المراجعة" emoji="🔄" />
              <QuickLink href="/plans/new" label="ورد الحفظ" emoji="📖" />
              <QuickLink href="/listen-memorize" label="استماع" emoji="🎧" />
              <QuickLink href="/quran" label="المصحف" emoji="📗" />
            </div>
          </div>

          <p className="text-[11px] text-center text-slate-500 px-2">
            كل خطوة تفتح التالية بعد إكمالها — لا قفز عشوائي.
          </p>
        </aside>
      </div>
    </div>
  );
}

function ProgressRing({
  pct,
  done,
  total,
}: {
  pct: number;
  done: number;
  total: number;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0 transition-transform duration-500 group-hover:scale-105">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88">
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-slate-800"
        />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="url(#kiswaGold)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out drop-shadow-[0_0_16px_rgba(212,175,55,0.85)]"
        />
        <defs>
          <linearGradient id="kiswaGold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9a7b2c" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#f0d78c" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
          {formatArabicNumber(pct)}%
        </span>
        <span className="text-[9px] text-muted-foreground">
          {formatArabicNumber(done)}/{formatArabicNumber(total)}
        </span>
      </div>
    </div>
  );
}

function PlanRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="group/row flex items-start gap-2 rounded-xl border border-[#D4AF37]/10 bg-[#020408]/60 px-3 py-2.5 transition-all duration-500 ease-out hover:-translate-y-1 hover:border-[#D4AF37]/40 hover:bg-gradient-to-br hover:from-[#0A0F1A] hover:to-[#D4AF37]/5 hover:shadow-[0_0_20px_rgba(212,175,55,0.2)]">
      <span className="mt-0.5 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold shrink-0 transition-transform duration-300 group-hover/row:-translate-x-2">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium text-white truncate group-hover/row:text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold transition-colors duration-300">
          {value}
        </p>
      </div>
    </li>
  );
}

function QuickLink({
  href,
  label,
  emoji,
}: {
  href: string;
  label: string;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-1.5 rounded-2xl border border-[#D4AF37]/15 bg-[#020408]/60 px-3 py-3 text-center transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-[1.02] hover:border-[#D4AF37]/40 hover:bg-gradient-to-br hover:from-[#0A0F1A] hover:to-[#D4AF37]/5 hover:shadow-[0_15px_50px_-12px_rgba(212,175,55,0.45)] active:scale-95"
    >
      <span className="text-xl transition-transform duration-300 group-hover:scale-110">
        {emoji}
      </span>
      <span className="text-[11px] font-medium text-[#CBD5E1] transition-colors duration-300 group-hover:text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold">
        {label}
      </span>
    </Link>
  );
}
