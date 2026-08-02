"use client";

/**
 * Talqeen (Listen & Repeat) — Phase D
 * Per-ayah cycle: listen N reps → big "سمّع الآن" → mic once → score → next.
 * Replaces the old 6-phase listen-memorize flow as the default path.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Headphones,
  Mic,
  MicOff,
  ChevronLeft,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/layout/back-button";
import {
  getSurah,
  getSurahAyahs,
  getAvailableQaris,
  ayahAudioUrl,
  resolvePlayableQariId,
} from "@/lib/quran";
import {
  playGlobalAudio,
  stopGlobalAudio,
} from "@/lib/audio/global-audio";
import {
  ArabicSpeechSession,
  isSpeechRecognitionSupported,
} from "@/lib/quran/speech-recognition";
import {
  buildLiveWordStream,
  matchLive,
  type LiveDisplayWord,
} from "@/lib/quran/live-recitation";
import { recordListen } from "@/lib/memorization-store";
import { formatArabicNumber, cn } from "@/lib/utils";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";

type Phase =
  | "listen"
  | "prompt"
  | "recite"
  | "score"
  | "range_done";

export default function TalqeenSessionPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[70vh] max-w-2xl" />}>
      <TalqeenInner />
    </Suspense>
  );
}

function TalqeenInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile } = useHafizProfile();

  const surahNumber = Math.max(
    1,
    Math.min(114, Number(params.get("surah") || 2))
  );
  const fromAyah = Math.max(1, Number(params.get("from") || 1));
  const toParam = Number(params.get("to") || 0);
  const repsTarget = Math.max(1, Math.min(10, Number(params.get("reps") || 3)));
  const qariId = resolvePlayableQariId(
    params.get("qari") || profile.preferredQariId || "alafasy"
  );

  const surah = getSurah(surahNumber);
  const allAyahs = useMemo(() => getSurahAyahs(surahNumber), [surahNumber]);
  const toAyah =
    toParam >= fromAyah
      ? Math.min(toParam, allAyahs.length || toParam)
      : Math.min(fromAyah + 9, allAyahs.length || fromAyah);

  const range = useMemo(
    () =>
      allAyahs.filter(
        (a) => a.ayahNumber >= fromAyah && a.ayahNumber <= toAyah
      ),
    [allAyahs, fromAyah, toAyah]
  );

  const qariName =
    getAvailableQaris().find((q) => q.id === qariId)?.nameAr || qariId;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("listen");
  const [repDone, setRepDone] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [liveWords, setLiveWords] = useState<LiveDisplayWord[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);

  const speechRef = useRef<ArabicSpeechSession | null>(null);
  const cancelledRef = useRef(false);
  const phaseRef = useRef<Phase>("listen");
  phaseRef.current = phase;

  const ayah = range[index];
  const progressPct = range.length
    ? Math.round((index / range.length) * 100)
    : 0;

  const wordStream = useMemo(
    () => (ayah ? buildLiveWordStream([ayah]) : []),
    [ayah]
  );

  const killSpeech = useCallback(() => {
    try {
      speechRef.current?.dispose();
    } catch {
      /* ignore */
    }
    speechRef.current = null;
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    const hardKill = () => {
      cancelledRef.current = true;
      stopGlobalAudio();
      killSpeech();
    };
    window.addEventListener("pagehide", hardKill);
    return () => {
      hardKill();
      window.removeEventListener("pagehide", hardKill);
    };
  }, [killSpeech]);

  // Reset on ayah change
  useEffect(() => {
    stopGlobalAudio();
    killSpeech();
    setRepDone(0);
    setLiveWords([]);
    setAccuracy(null);
    setPassed(false);
    setSpeechError(null);
    setPhase("listen");
    setAutoPlay(true);
  }, [index, ayah?.ayahNumber, killSpeech]);

  // Auto-start listen reps when entering listen phase
  useEffect(() => {
    if (phase !== "listen" || !ayah || !autoPlay) return;
    let cancelled = false;
    let rep = 0;

    const playNext = () => {
      if (cancelled || cancelledRef.current) return;
      if (rep >= repsTarget) {
        setPlaying(false);
        setPhase("prompt");
        return;
      }
      const url = ayahAudioUrl(qariId, ayah.surahNumber, ayah.ayahNumber);
      setPlaying(true);
      playGlobalAudio(url, {
        onEnded: () => {
          if (cancelled || cancelledRef.current) return;
          try {
            recordListen(ayah.surahNumber, ayah.ayahNumber);
          } catch {
            /* ignore */
          }
          rep += 1;
          setRepDone(rep);
          playNext();
        },
        onError: () => {
          setPlaying(false);
          setPhase("prompt");
        },
      });
    };

    playNext();
    return () => {
      cancelled = true;
      stopGlobalAudio();
      setPlaying(false);
    };
  }, [phase, ayah, qariId, repsTarget, autoPlay, index]);

  function replayListen() {
    stopGlobalAudio();
    killSpeech();
    setRepDone(0);
    setLiveWords([]);
    setAccuracy(null);
    setPassed(false);
    setAutoPlay(true);
    setPhase("listen");
  }

  function startRecite() {
    stopGlobalAudio();
    setPlaying(false);
    setSpeechError(null);
    setLiveWords([]);
    setAccuracy(null);

    if (!isSpeechRecognitionSupported()) {
      setSpeechError(
        "التعرّف على الصوت غير مدعوم. استخدم Chrome على Android أو سطح المكتب."
      );
      return;
    }

    if (!speechRef.current) speechRef.current = new ArabicSpeechSession();
    const started = speechRef.current.start(
      {
        onInterim: (t) => {
          if (!wordStream.length) return;
          const r = matchLive(wordStream, t, {
            interim: true,
            strict: true,
          });
          setLiveWords(r.display);
          setAccuracy(r.stats.accuracy);
        },
        onFinal: (t) => {
          if (!wordStream.length) return;
          const r = matchLive(wordStream, t, {
            interim: true,
            strict: true,
          });
          setLiveWords(r.display);
          setAccuracy(r.stats.accuracy);
        },
        onError: (msg) => {
          if (/ميكروفون|اسمح|غير مدعوم|لا يوجد/.test(msg)) {
            setSpeechError(msg);
            setPhase("prompt");
          }
        },
        onListeningChange: (on) => {
          if (on) setPhase("recite");
        },
        onEnd: () => {
          // Mic ended after one ayah attempt → score (soft)
          finishScore();
        },
      },
      { allowSoftResume: false, preserveBuffer: false }
    );

    if (!started.ok) {
      setSpeechError(started.error || "تعذّر بدء الميكروفون");
      setPhase("prompt");
      return;
    }
    setPhase("recite");
  }

  function finishScore() {
    const text = speechRef.current?.getTranscript() || "";
    try {
      speechRef.current?.stop();
    } catch {
      /* ignore */
    }
    if (!wordStream.length) {
      setPhase("score");
      return;
    }
    // Final soft score — incomplete is not catastrophic fail
    const r = matchLive(wordStream, text, {
      interim: false,
      strict: true,
    });
    setLiveWords(r.display);
    setAccuracy(r.stats.accuracy);
    const ok =
      r.stats.accuracy >= 70 ||
      (r.display.length > 0 &&
        r.display.filter((w) => w.status === "correct").length >=
          Math.ceil(r.display.length * 0.7));
    setPassed(ok);
    setPhase("score");
  }

  function stopReciteManual() {
    finishScore();
  }

  function goNext() {
    killSpeech();
    if (index >= range.length - 1) {
      setPhase("range_done");
      return;
    }
    setIndex((i) => i + 1);
  }

  if (!surah || !range.length || !ayah) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center space-y-3">
        <p className="font-semibold">تعذّر فتح جلسة التلقين</p>
        <Link href="/dashboard" className="text-primary text-sm underline">
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  const sticky =
    phase === "listen"
      ? {
          label: playing
            ? `يستمع… ${formatArabicNumber(repDone)}/${formatArabicNumber(repsTarget)}`
            : "تخطي للاستماع لاحقاً",
          action: () => {
            stopGlobalAudio();
            setPlaying(false);
            setAutoPlay(false);
            setPhase("prompt");
          },
          premium: false,
        }
      : phase === "prompt"
        ? {
            label: "سمّع الآن",
            action: startRecite,
            premium: true,
            icon: "mic" as const,
          }
        : phase === "recite"
          ? {
              label: "إنهاء التسميع",
              action: stopReciteManual,
              premium: false,
              icon: "micOff" as const,
            }
          : phase === "score"
            ? {
                label:
                  index >= range.length - 1 ? "إنهاء المقطع" : "الآية التالية",
                action: goNext,
                premium: true,
                icon: "next" as const,
              }
            : {
                label: "العودة للرئيسية",
                action: () => router.push("/dashboard"),
                premium: true,
                icon: "next" as const,
              };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-36 sm:pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3 sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/40 py-3 -mx-1 px-1">
        <div>
          <BackButton href="/dashboard" />
          <h1 className="mt-2 text-lg font-bold">
            تلقين · {surah.nameAr}
          </h1>
          <p className="text-xs text-muted-foreground">
            {qariName} · تكرار {formatArabicNumber(repsTarget)} · الآيات{" "}
            {formatArabicNumber(fromAyah)}–{formatArabicNumber(toAyah)}
          </p>
        </div>
        {phase === "recite" && (
          <Badge variant="danger" className="gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            سمّع
          </Badge>
        )}
        {phase === "listen" && playing && (
          <Badge variant="success" className="gap-1">
            <Volume2 className="h-3 w-3" />
            استماع
          </Badge>
        )}
      </div>

      <Progress value={progressPct} className="h-2" />
      <p className="text-center text-xs text-muted-foreground">
        الآية {formatArabicNumber(index + 1)} من{" "}
        {formatArabicNumber(range.length)}
      </p>

      {/* Phase chips */}
      <div className="flex flex-wrap justify-center gap-2 text-[11px]">
        {(
          [
            ["listen", "استماع"],
            ["prompt", "جاهز"],
            ["recite", "تسميع"],
            ["score", "نتيجة"],
          ] as const
        ).map(([id, label]) => (
          <span
            key={id}
            className={cn(
              "rounded-full px-2.5 py-1 border",
              phase === id ||
                (id === "listen" && phase === "listen") ||
                (["prompt", "recite", "score"].includes(phase) &&
                  id === "listen" &&
                  repDone >= repsTarget)
                ? phase === id
                  ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]"
                  : "border-border text-muted-foreground"
                : "border-border/50 text-muted-foreground/60"
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <Card className="border-[#D4AF37]/20">
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm font-medium text-[#D4AF37]">
            آية {formatArabicNumber(ayah.ayahNumber)}
          </p>

          {/* Show text during listen & score; hide during recite by default */}
          <div
            dir="rtl"
            className="min-h-[100px] rounded-xl bg-muted/30 p-4 text-center leading-[2.2] text-xl sm:text-2xl font-[family-name:var(--font-quran)]"
          >
            {phase === "recite" || phase === "score" ? (
              liveWords.length > 0 ? (
                liveWords.map((w) => (
                  <span
                    key={w.globalIndex}
                    className={cn(
                      "mx-0.5 inline-block",
                      w.status === "correct" &&
                        "text-emerald-600 dark:text-emerald-400 font-semibold",
                      (w.status === "partial" || w.status === "current") &&
                        "text-[#D4AF37]",
                      w.status === "incorrect" && "text-red-500",
                      (w.status === "pending" || w.status === "hidden") &&
                        "text-muted-foreground/30"
                    )}
                  >
                    {w.revealed ||
                    w.status === "correct" ||
                    w.status === "partial" ||
                    w.status === "current"
                      ? w.text
                      : "…"}
                  </span>
                ))
              ) : phase === "recite" ? (
                <span className="text-muted-foreground text-base">
                  اقرأ الآية… الكلمات تظهر مع صوتك
                </span>
              ) : (
                <span>{ayah.text}</span>
              )
            ) : (
              <span>{ayah.text}</span>
            )}
          </div>

          {phase === "listen" && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Headphones className="h-4 w-4 text-[#D4AF37]" />
              تكرار {formatArabicNumber(repDone)} /{" "}
              {formatArabicNumber(repsTarget)}
            </div>
          )}

          {phase === "prompt" && (
            <p className="text-center text-sm text-muted-foreground">
              انتهى الاستماع — اضغط «سمّع الآن» عندما تكون مستعداً
            </p>
          )}

          {phase === "score" && (
            <div
              className={cn(
                "rounded-xl p-4 text-center space-y-1 border",
                passed
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-amber-500/10 border-amber-500/30"
              )}
            >
              <p className="font-semibold flex items-center justify-center gap-2">
                {passed ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    أحسنت — تقدّم للآية التالية
                  </>
                ) : (
                  "حاول مرة أخرى أو انتقل للتالية"
                )}
              </p>
              {accuracy != null && (
                <p className="text-xs text-muted-foreground">
                  تطابق تقريبي {formatArabicNumber(Math.round(accuracy))}٪
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={replayListen}
              >
                أعد الاستماع ثم سمّع
              </Button>
            </div>
          )}

          {phase === "range_done" && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-center">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                أتممت مقطع التلقين — بارك الله فيك
              </p>
            </div>
          )}

          {speechError && (
            <p className="text-xs text-center text-[#D4AF37]">{speechError}</p>
          )}
        </CardContent>
      </Card>

      {/* Sticky bottom */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D4AF37]/25 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button
            type="button"
            variant={sticky.premium ? "premium" : "outline"}
            className={cn(
              "h-16 w-full text-base font-bold gap-2 rounded-2xl",
              sticky.premium &&
                "shadow-[0_8px_30px_-8px_rgba(212,175,55,0.55)]"
            )}
            onClick={sticky.action}
          >
            {sticky.icon === "mic" && <Mic className="h-5 w-5" />}
            {sticky.icon === "micOff" && <MicOff className="h-5 w-5" />}
            {sticky.icon === "next" && <ChevronLeft className="h-5 w-5" />}
            {!sticky.icon && phase === "listen" && (
              <Headphones className="h-5 w-5" />
            )}
            {sticky.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
