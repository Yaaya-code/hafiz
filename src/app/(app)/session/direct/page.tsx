"use client";

/**
 * Direct recitation — full range as one continuous block.
 * Mic silence → pause + sticky «متابعة التسميع» (context preserved).
 * Streaming word alignment via matchLive onInterim.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/layout/back-button";
import { getSurah, getSurahAyahs } from "@/lib/quran";
import {
  ArabicSpeechSession,
  isSpeechRecognitionSupported,
} from "@/lib/quran/speech-recognition";
import {
  buildLiveWordStream,
  finalFeedbackAr,
  matchLive,
  type LiveDisplayWord,
} from "@/lib/quran/live-recitation";
import { formatArabicNumber, cn } from "@/lib/utils";
import { saveSurahRecitationProgress } from "@/lib/quran/recitation-progress";

type Phase = "idle" | "listening" | "paused" | "done";

export default function DirectSessionPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[70vh] max-w-2xl" />}>
      <DirectSessionInner />
    </Suspense>
  );
}

function DirectSessionInner() {
  const params = useSearchParams();
  const router = useRouter();

  const surahNumber = Math.max(
    1,
    Math.min(114, Number(params.get("surah") || 2))
  );
  const fromAyah = Math.max(1, Number(params.get("from") || 1));
  const toParam = Number(params.get("to") || 0);

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

  /** Full range stream — one continuous recitation block */
  const wordStream = useMemo(() => buildLiveWordStream(range), [range]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [liveWords, setLiveWords] = useState<LiveDisplayWord[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [currentAyah, setCurrentAyah] = useState(fromAyah);
  const [lastCompleted, setLastCompleted] = useState(0);

  const speechRef = useRef<ArabicSpeechSession | null>(null);
  const transcriptRef = useRef("");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  // Seed full range as pending words (visible block)
  useEffect(() => {
    if (!wordStream.length) return;
    const seed = matchLive(wordStream, "", { interim: true, streaming: true });
    setLiveWords(seed.display);
  }, [wordStream]);

  const progressPct = useMemo(() => {
    if (!liveWords.length) return 0;
    const done = liveWords.filter(
      (w) =>
        w.status === "correct" ||
        w.status === "incorrect" ||
        w.status === "missing"
    ).length;
    return Math.round((done / liveWords.length) * 100);
  }, [liveWords]);

  const applyTranscript = useCallback(
    (text: string) => {
      transcriptRef.current = text;
      if (!wordStream.length) return;
      const result = matchLive(wordStream, text, {
        interim: true,
        streaming: true,
      });
      setLiveWords(result.display);
      setAccuracy(result.stats.accuracy);
      setCurrentAyah(result.currentAyah);
      setLastCompleted(result.lastCompletedAyah);
      if (result.stats.lastMessage) setHint(result.stats.lastMessage);

      // Full range completed
      if (
        result.display.length > 0 &&
        result.display.every((w) => w.status === "correct")
      ) {
        if (phaseRef.current === "listening") {
          try {
            speechRef.current?.stop();
          } catch {
            /* ignore */
          }
          finishRange(result.lastCompletedAyah, result.stats.accuracy);
        }
      }
    },
    [wordStream]
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
    const hardKill = () => killSpeech();
    window.addEventListener("pagehide", hardKill);
    window.addEventListener("beforeunload", hardKill);
    return () => {
      window.removeEventListener("pagehide", hardKill);
      window.removeEventListener("beforeunload", hardKill);
      hardKill();
    };
  }, [killSpeech]);

  function finishRange(lastAyah: number, acc: number) {
    setPhase("done");
    setReport(
      finalFeedbackAr(
        {
          matched: liveWords.filter((w) => w.status === "correct").length,
          missing: 0,
          incorrect: liveWords.filter((w) => w.status === "incorrect").length,
          extra: 0,
          repeated: 0,
          total: liveWords.length,
          accuracy: acc,
        },
        lastAyah || lastCompleted,
        toAyah
      )
    );
    saveSurahRecitationProgress({
      surahNumber,
      lastCompletedAyah: lastAyah || lastCompleted,
      continueFromAyah: Math.min(
        toAyah,
        (lastAyah || lastCompleted || fromAyah) + 1
      ),
      totalAyahs: toAyah,
      lastSessionAt: new Date().toISOString(),
      accuracy: acc,
      mistakesCount: liveWords.filter((w) => w.status === "incorrect").length,
    });
  }

  function speechHandlers() {
    return {
      onInterim: (t: string) => applyTranscript(t),
      onFinal: (t: string) => applyTranscript(t),
      onError: (msg: string) => {
        if (/ميكروفون|اسمح|غير مدعوم|لا يوجد/.test(msg)) {
          setSpeechError(msg);
          setPhase("paused");
        } else {
          setHint(msg);
        }
      },
      onListeningChange: (listening: boolean) => {
        if (listening) setPhase("listening");
      },
      onEnd: () => {
        // Silence closed mic — pause only, NEVER destroy range context
        if (phaseRef.current === "done") return;
        setPhase("paused");
        setHint(
          "توقّف المايك (صمت أو نفس). اضغط «متابعة التسميع» — السياق محفوظ."
        );
      },
    };
  }

  function startListening(preserve: boolean) {
    setSpeechError(null);
    setHint(null);
    setReport(null);
    if (!isSpeechRecognitionSupported()) {
      setSpeechError(
        "التعرّف على الصوت غير مدعوم. استخدم Chrome على Android أو سطح المكتب."
      );
      return;
    }
    if (!speechRef.current) speechRef.current = new ArabicSpeechSession();
    const r = speechRef.current.start(speechHandlers(), {
      allowSoftResume: false,
      preserveBuffer: preserve,
    });
    if (!r.ok) {
      setSpeechError(r.error || "تعذّر بدء الميكروفون");
      setPhase("idle");
      return;
    }
    setPhase("listening");
  }

  function continueListening() {
    setSpeechError(null);
    setHint(null);
    if (!speechRef.current) {
      startListening(true);
      return;
    }
    // Re-bind handlers + keep transcript buffer
    speechRef.current.start(speechHandlers(), {
      allowSoftResume: false,
      preserveBuffer: true,
    });
    setPhase("listening");
  }

  function stopListening() {
    speechRef.current?.stop();
    setPhase("paused");
  }

  function endSession() {
    const finalText =
      speechRef.current?.stop() || transcriptRef.current || "";
    killSpeech();
    const result = matchLive(wordStream, finalText, {
      interim: false,
      streaming: true,
    });
    setLiveWords(result.display);
    setAccuracy(result.stats.accuracy);
    finishRange(result.lastCompletedAyah, result.stats.accuracy);
  }

  // Group words by ayah for block display
  const byAyah = useMemo(() => {
    const map = new Map<number, LiveDisplayWord[]>();
    for (const w of liveWords) {
      if (!map.has(w.ayahNumber)) map.set(w.ayahNumber, []);
      map.get(w.ayahNumber)!.push(w);
    }
    return map;
  }, [liveWords]);

  if (!surah || !range.length) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center space-y-3">
        <p className="font-semibold">تعذّر فتح جلسة التسميع</p>
        <Link href="/dashboard" className="text-primary text-sm underline">
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  const stickyLabel =
    phase === "listening"
      ? "إيقاف مؤقت"
      : phase === "paused"
        ? "متابعة التسميع"
        : phase === "done"
          ? "العودة للرئيسية"
          : "ابدأ التسميع";

  function onSticky() {
    if (phase === "listening") {
      stopListening();
      return;
    }
    if (phase === "paused") {
      continueListening();
      return;
    }
    if (phase === "done") {
      router.push("/dashboard");
      return;
    }
    startListening(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-40 sm:pb-32">
      <div className="flex flex-wrap items-start justify-between gap-3 sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/40 py-3 -mx-1 px-1">
        <div>
          <BackButton href="/dashboard" />
          <h1 className="mt-2 text-lg font-bold">
            تسميع مباشر · {surah.nameAr}
          </h1>
          <p className="text-xs text-muted-foreground">
            النطاق كامل: {formatArabicNumber(fromAyah)}–
            {formatArabicNumber(toAyah)} · كتلة واحدة متصلة
          </p>
        </div>
        {phase === "listening" && (
          <Badge variant="danger" className="gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            يستمع
          </Badge>
        )}
        {phase === "paused" && (
          <Badge variant="warning" className="gap-1">
            متوقف — السياق محفوظ
          </Badge>
        )}
      </div>

      <Progress value={progressPct} className="h-2" />
      <p className="text-center text-xs text-muted-foreground">
        موضع التتبع: آية {formatArabicNumber(currentAyah)}
        {accuracy != null && phase !== "idle" && (
          <> · تطابق {formatArabicNumber(Math.round(accuracy * 100))}٪</>
        )}
      </p>

      {/* Full range block */}
      <div className="space-y-3">
        {range.map((a) => {
          const words = byAyah.get(a.ayahNumber) || [];
          const isCurrent = a.ayahNumber === currentAyah && phase !== "idle";
          return (
            <Card
              key={a.ayahNumber}
              className={cn(
                "border-border/50 transition-colors",
                isCurrent && "border-[#D4AF37]/50 bg-[#D4AF37]/5"
              )}
            >
              <CardContent className="pt-4 pb-4 space-y-2">
                <p className="text-[11px] font-medium text-[#D4AF37]">
                  آية {formatArabicNumber(a.ayahNumber)}
                </p>
                <div
                  dir="rtl"
                  className="text-center leading-[2.15] text-lg sm:text-xl font-[family-name:var(--font-quran)]"
                >
                  {words.length === 0
                    ? a.text
                    : words.map((w) => (
                        <span
                          key={w.globalIndex}
                          className={cn(
                            "mx-0.5 inline-block transition-colors duration-100",
                            w.status === "correct" &&
                              "text-emerald-600 dark:text-emerald-400 font-semibold",
                            (w.status === "partial" ||
                              w.status === "current") &&
                              "text-[#D4AF37] underline decoration-[#D4AF37]/50 font-medium",
                            (w.status === "incorrect" ||
                              w.status === "missing") &&
                              "text-red-500 font-medium",
                            (w.status === "pending" ||
                              w.status === "hidden") &&
                              "text-foreground/70"
                          )}
                        >
                          {w.text}
                        </span>
                      ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hint && (
        <p className="text-xs text-center text-muted-foreground px-2">{hint}</p>
      )}
      {speechError && (
        <p className="text-xs text-center text-[#D4AF37]">{speechError}</p>
      )}

      {phase === "done" && report && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm whitespace-pre-line">
          <p className="font-semibold flex items-center gap-2 mb-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            انتهى التسميع
          </p>
          {report}
        </div>
      )}

      <p className="text-[11px] text-center text-muted-foreground px-2">
        الكلمات تُضيء مع صوتك مباشرة. الصمت يوقف المايك فقط — اضغط متابعة
        للاستئناف من حيث توقفت.
      </p>

      {/* Sticky bottom */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D4AF37]/25 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-2xl flex gap-2">
          {phase === "listening" || phase === "paused" ? (
            <Button
              type="button"
              variant="ghost"
              className="h-14 px-3 text-xs shrink-0"
              onClick={endSession}
            >
              إنهاء
            </Button>
          ) : null}
          <Button
            type="button"
            variant={
              phase === "listening" ? "outline" : "premium"
            }
            className={cn(
              "h-16 flex-1 text-base font-bold gap-2 rounded-2xl",
              phase !== "listening" &&
                "shadow-[0_8px_30px_-8px_rgba(212,175,55,0.55)]"
            )}
            onClick={onSticky}
          >
            {phase === "listening" ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
            {stickyLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
