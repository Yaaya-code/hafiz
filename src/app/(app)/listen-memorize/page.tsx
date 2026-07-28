"use client";

/**
 * Structured listening-based memorization journey (Arabic-first).
 * Steps: choose range → listen → with text → without text → recite → test
 *
 * Seeded from today's orchestrated NEW_HIFZ item (or URL params when
 * navigating from plans/new). User can override any field in the setup step.
 * No longer imports getNextMemorizationTarget from daily-plans.ts.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Headphones,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getSurahAyahs,
  getSurah,
  getAvailableQaris,
  ayahAudioUrl,
  SURAHS,
} from "@/lib/quran";
import {
  recordListen,
  loadAyahProgress,
  ayahKey,
  markMastered,
  recordTest,
} from "@/lib/memorization-store";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { useOrchestratedPlan } from "@/hooks/use-orchestrated-plan";
import { formatArabicNumber, cn } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/layout/back-button";
import {
  playGlobalAudio,
  stopGlobalAudio,
} from "@/lib/audio/global-audio";

type Phase =
  | "setup"
  | "listen"
  | "with_text"
  | "no_text"
  | "recite"
  | "test"
  | "done";

const PHASE_LABELS: Record<Phase, string> = {
  setup: "١ · اختيار المقطع",
  listen: "٢ · استماع متكرر",
  with_text: "٣ · استماع مع النظر",
  no_text: "٤ · استماع بلا نظر",
  recite: "٥ · سمّع من حفظك",
  test: "٦ · اختبار سريع",
  done: "أتممت المقطع",
};

const ORDER: Phase[] = [
  "setup",
  "listen",
  "with_text",
  "no_text",
  "recite",
  "test",
  "done",
];

export default function ListenMemorizePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[70vh] max-w-4xl" />}>
      <ListenMemorizeInner />
    </Suspense>
  );
}

function ListenMemorizeInner() {
  const { profile } = useHafizProfile();
  const { ready: planReady, today } = useOrchestratedPlan();
  const params = useSearchParams();

  // ── Resolve seed values ─────────────────────────────────────────────────
  // Priority: URL params → orchestrated NEW_HIFZ item → safe defaults
  const seedSurah = useMemo(() => {
    const p = Number(params.get("surah"));
    if (p >= 1 && p <= 114) return p;

    if (planReady && today?.today?.items) {
      const hifz = today.today.items.find((i) => i.type === "NEW_HIFZ");
      if (hifz?.surah) return hifz.surah;
      if (hifz?.sourceRange?.surah) return hifz.sourceRange.surah;
    }
    return 1;
  }, [planReady, today, params]);

  const seedFrom = useMemo(() => {
    const p = Number(params.get("from"));
    if (p >= 1) return p;

    if (planReady && today?.today?.items) {
      const hifz = today.today.items.find((i) => i.type === "NEW_HIFZ");
      if (hifz?.sourceRange?.fromAyah) return hifz.sourceRange.fromAyah;
    }
    return 1;
  }, [planReady, today, params]);

  const seedTo = useMemo(() => {
    const p = Number(params.get("to"));
    if (p >= seedFrom) return p;

    if (planReady && today?.today?.items) {
      const hifz = today.today.items.find((i) => i.type === "NEW_HIFZ");
      if (hifz?.sourceRange?.toAyah) return hifz.sourceRange.toAyah;
    }
    const meta = getSurah(seedSurah);
    return Math.min(seedFrom + 9, meta?.ayahCount ?? seedFrom);
  }, [planReady, today, params, seedFrom, seedSurah]);

  // ── Component state ─────────────────────────────────────────────────────
  const [surahNumber, setSurahNumber] = useState(seedSurah);
  const [fromAyah, setFromAyah] = useState(seedFrom);
  const [toAyah, setToAyah] = useState(seedTo);
  const [qariId, setQariId] = useState(profile.preferredQariId || "alafasy");
  const [repsTarget, setRepsTarget] = useState(7);
  const [phase, setPhase] = useState<Phase>("setup");
  const [index, setIndex] = useState(0);
  const [sessionListens, setSessionListens] = useState(0);
  const [sectionListens, setSectionListens] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [progressMap, setProgressMap] = useState<
    ReturnType<typeof loadAyahProgress>
  >({});
  const [testChoice, setTestChoice] = useState<number | null>(null);

  // Re-seed once the plan is ready (only if no URL params override)
  useEffect(() => {
    if (!planReady) return;
    if (params.get("surah")) return; // URL param wins — don't overwrite
    if (!today?.today?.items) return;

    const hifz = today.today.items.find((i) => i.type === "NEW_HIFZ");
    if (!hifz) return;

    const s = hifz.surah ?? hifz.sourceRange?.surah;
    const f = hifz.sourceRange?.fromAyah ?? 1;
    const t = hifz.sourceRange?.toAyah ?? f;
    if (s && s >= 1 && s <= 114) {
      setSurahNumber(s);
      setFromAyah(f);
      setToAyah(t);
    }
  }, [planReady, today, params]);

  const surah = getSurah(surahNumber);
  const range = useMemo(() => {
    return getSurahAyahs(surahNumber).filter(
      (a) => a.ayahNumber >= fromAyah && a.ayahNumber <= toAyah
    );
  }, [surahNumber, fromAyah, toAyah]);

  const ayah = range[index] || range[0];
  const phaseIdx = ORDER.indexOf(phase);
  const progressPct = Math.round((phaseIdx / (ORDER.length - 1)) * 100);

  useEffect(() => {
    setProgressMap(loadAyahProgress());
  }, []);

  useEffect(() => {
    setIndex(0);
    setSessionListens(0);
    setSectionListens(0);
    setTestChoice(null);
    stopGlobalAudio();
    setPlaying(false);
  }, [surahNumber, fromAyah, toAyah]);

  const playOnce = useCallback(() => {
    if (!ayah) return;
    const url = ayahAudioUrl(qariId, ayah.surahNumber, ayah.ayahNumber);
    setPlaying(true);
    playGlobalAudio(url, {
      onEnded: () => {
        setPlaying(false);
        recordListen(ayah.surahNumber, ayah.ayahNumber);
        setProgressMap(loadAyahProgress());
        setSessionListens((n) => n + 1);
        setSectionListens((n) => n + 1);
      },
      onError: () => setPlaying(false),
    });
  }, [ayah, qariId]);

  const playSectionLoop = useCallback(() => {
    if (!range.length) return;
    let i = 0;
    const playNext = () => {
      if (i >= range.length) {
        setPlaying(false);
        setSectionListens((n) => n + 1);
        return;
      }
      const a = range[i];
      setIndex(i);
      setPlaying(true);
      playGlobalAudio(ayahAudioUrl(qariId, a.surahNumber, a.ayahNumber), {
        onEnded: () => {
          recordListen(a.surahNumber, a.ayahNumber);
          setProgressMap(loadAyahProgress());
          setSessionListens((n) => n + 1);
          i++;
          playNext();
        },
        onError: () => setPlaying(false),
      });
    };
    playNext();
  }, [range, qariId]);

  function stopAudio() {
    stopGlobalAudio();
    setPlaying(false);
  }

  function goPhase(p: Phase) {
    stopAudio();
    setPhase(p);
    setTestChoice(null);
  }

  function nextPhase() {
    const i = ORDER.indexOf(phase);
    if (i < ORDER.length - 1) goPhase(ORDER[i + 1]);
  }

  const showText =
    phase === "setup" ||
    phase === "listen" ||
    phase === "with_text" ||
    phase === "test" ||
    phase === "done";

  const completedInRange = range.filter((a) => {
    const s = progressMap[ayahKey(a.surahNumber, a.ayahNumber)];
    return s && (s.listenCount || 0) >= 3;
  }).length;

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6 pb-16">
      <FadeIn>
        <PageHeader
          title={
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Headphones className="h-6 w-6 text-primary" />
              الحفظ بالاستماع
            </h1>
          }
          description="منهج متكامل: استمع كثيراً ثم انظر ثم غيّب ثم سمّع — كطريقة أهل التلقين"
          backHref="/plans/journey"
        />
      </FadeIn>

      <Progress value={progressPct} className="h-2" />
      <div className="flex flex-wrap gap-1.5">
        {ORDER.filter((p) => p !== "done").map((p) => (
          <Badge
            key={p}
            variant={phase === p ? "success" : "muted"}
            className={cn(
              "text-[10px] transition-all duration-300",
              phase === p &&
                "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/50"
            )}
          >
            {PHASE_LABELS[p]}
          </Badge>
        ))}
      </div>

      {/* Setup */}
      {phase === "setup" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">اختر المقطع والقارئ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">السورة</span>
                <select
                  className="w-full h-10 rounded-xl border bg-background px-2 text-sm"
                  value={surahNumber}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setSurahNumber(n);
                    setFromAyah(1);
                    setToAyah(Math.min(10, getSurah(n)?.ayahCount || 10));
                  }}
                >
                  {SURAHS.map((s) => (
                    <option key={s.number} value={s.number}>
                      {s.number}. {s.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">القارئ</span>
                <select
                  className="w-full h-10 rounded-xl border bg-background px-2 text-sm"
                  value={qariId}
                  onChange={(e) => setQariId(e.target.value)}
                >
                  {getAvailableQaris().map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">من آية</span>
                <input
                  type="number"
                  min={1}
                  max={surah?.ayahCount || 1}
                  className="w-full h-10 rounded-xl border bg-background px-3 text-sm"
                  value={fromAyah}
                  onChange={(e) => setFromAyah(Number(e.target.value) || 1)}
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">إلى آية</span>
                <input
                  type="number"
                  min={fromAyah}
                  max={surah?.ayahCount || 1}
                  className="w-full h-10 rounded-xl border bg-background px-3 text-sm"
                  value={toAyah}
                  onChange={(e) =>
                    setToAyah(Number(e.target.value) || fromAyah)
                  }
                />
              </label>
              <label className="text-xs space-y-1 sm:col-span-2">
                <span className="text-muted-foreground">
                  هدف التكرار لكل آية: {formatArabicNumber(repsTarget)}
                </span>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={repsTarget}
                  onChange={(e) => setRepsTarget(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              المقطع: {surah?.nameAr}{" "}
              {formatArabicNumber(fromAyah)}–{formatArabicNumber(toAyah)} ·{" "}
              {formatArabicNumber(range.length)} آية
            </p>
            <Button
              type="button"
              variant="premium"
              className="w-full"
              onClick={() => goPhase("listen")}
              disabled={!range.length}
            >
              ابدأ منهج الاستماع
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active learning phases */}
      {phase !== "setup" && phase !== "done" && ayah && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{PHASE_LABELS[phase]}</CardTitle>
              <Badge variant="muted">
                آية {formatArabicNumber(ayah.ayahNumber)} /{" "}
                {formatArabicNumber(range.length)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              استماعات هذه الجلسة: {formatArabicNumber(sessionListens)} ·
              للمقطع: {formatArabicNumber(sectionListens)} · مكتمل سابقاً:{" "}
              {formatArabicNumber(completedInRange)}/
              {formatArabicNumber(range.length)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {showText ? (
              <p
                className="font-quran text-center text-2xl leading-[2.2]"
                dir="rtl"
              >
                {ayah.text}
              </p>
            ) : (
              <div className="py-10 text-center rounded-xl border border-dashed">
                <EyeOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {phase === "no_text"
                    ? "استمع بلا نظر — ثبّت الصوت في أذنك"
                    : "سمّع من حفظك ثم صحّح"}
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index <= 0}
                onClick={() => {
                  stopAudio();
                  setIndex((i) => i - 1);
                  setSessionListens(0);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={playing ? "outline" : "premium"}
                className="gap-2 min-w-[7rem]"
                onClick={() => (playing ? stopAudio() : void playOnce())}
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {playing ? "إيقاف" : "استمع للآية"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index >= range.length - 1}
                onClick={() => {
                  stopAudio();
                  setIndex((i) => i + 1);
                  setSessionListens(0);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            {(phase === "listen" ||
              phase === "with_text" ||
              phase === "no_text") && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => void playSectionLoop()}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  تشغيل المقطع كاملاً
                </Button>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={autoNext}
                    onChange={(e) => setAutoNext(e.target.checked)}
                  />
                  تكرار تلقائي للمقطع
                </label>
              </div>
            )}

            {phase === "listen" && (
              <p className="text-xs text-center text-muted-foreground">
                الهدف: {formatArabicNumber(repsTarget)} استماعات لكل آية قبل
                الانتقال. الحالي لهذه الآية:{" "}
                {formatArabicNumber(sessionListens)}
              </p>
            )}

            {phase === "test" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-center">
                  هل أتممت تسميع هذه الآية من حفظك؟
                </p>
                <div className="flex justify-center gap-2">
                  <Button
                    type="button"
                    variant={testChoice === 1 ? "premium" : "outline"}
                    onClick={() => {
                      setTestChoice(1);
                      recordTest(
                        ayah.surahNumber,
                        ayah.ayahNumber,
                        true
                      );
                      markMastered(ayah.surahNumber, ayah.ayahNumber);
                      setProgressMap(loadAyahProgress());
                    }}
                  >
                    <Check className="h-4 w-4 me-1" />
                    نعم أتقنتها
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTestChoice(0);
                      recordTest(
                        ayah.surahNumber,
                        ayah.ayahNumber,
                        false
                      );
                      setProgressMap(loadAyahProgress());
                    }}
                  >
                    أحتاج مزيد استماع
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {phaseIdx > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => goPhase(ORDER[phaseIdx - 1])}
                >
                  الخطوة السابقة
                </Button>
              )}
              <Button
                type="button"
                variant="premium"
                className="flex-1"
                onClick={() => {
                  if (phase === "test" && index < range.length - 1) {
                    setIndex((i) => i + 1);
                    setSessionListens(0);
                    setTestChoice(null);
                    return;
                  }
                  if (phase === "test") {
                    goPhase("done");
                    return;
                  }
                  nextPhase();
                }}
              >
                {phase === "test"
                  ? index < range.length - 1
                    ? "الآية التالية في الاختبار"
                    : "إنهاء المنهج"
                  : "الخطوة التالية"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "done" && (
        <Card className="border-[#D4AF37]/30 bg-[#D4AF37]/5 text-center">
          <CardContent className="py-10 space-y-3">
            <p className="text-4xl">✨</p>
            <h2 className="text-xl font-bold">أتممت منهج الاستماع</h2>
            <p className="text-sm text-muted-foreground">
              {surah?.nameAr} {formatArabicNumber(fromAyah)}–
              {formatArabicNumber(toAyah)} ·{" "}
              {formatArabicNumber(sessionListens)} استماع في الجلسة
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="premium"
                onClick={() => goPhase("setup")}
              >
                مقطع جديد
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIndex(0);
                  goPhase("listen");
                }}
              >
                أعد المقطع
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
