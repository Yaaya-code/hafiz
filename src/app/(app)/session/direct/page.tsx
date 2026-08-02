"use client";

/**
 * Direct recitation — Phase C
 * Word-by-word via onInterim. Mic silence never auto-fails the ayah.
 * Sticky bottom: start / continue / next ayah.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Mic, MicOff, ChevronLeft } from "lucide-react";
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
  matchLive,
  type LiveDisplayWord,
} from "@/lib/quran/live-recitation";
import { formatArabicNumber, cn } from "@/lib/utils";
import { saveSurahRecitationProgress } from "@/lib/quran/recitation-progress";

type Phase = "idle" | "listening" | "paused" | "ayah_done" | "range_done";

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

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveWords, setLiveWords] = useState<LiveDisplayWord[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const speechRef = useRef<ArabicSpeechSession | null>(null);
  const transcriptRef = useRef("");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const ayah = range[index];
  const progressPct = range.length
    ? Math.round((index / range.length) * 100)
    : 0;

  const wordStream = useMemo(
    () => (ayah ? buildLiveWordStream([ayah]) : []),
    [ayah]
  );

  const applyTranscript = useCallback(
    (text: string, interim: boolean) => {
      transcriptRef.current = text;
      if (!wordStream.length) return;
      const result = matchLive(wordStream, text, { interim });
      setLiveWords(result.display);
      setAccuracy(result.stats.accuracy);
      if (result.stats.lastMessage) setHint(result.stats.lastMessage);

      // Full ayah correct while still interim/final — offer next
      if (
        result.display.length > 0 &&
        result.display.every((w) => w.status === "correct")
      ) {
        // Soft complete — do not auto-fail anything
        if (phaseRef.current === "listening") {
          try {
            speechRef.current?.stop();
          } catch {
            /* ignore */
          }
          setPhase("ayah_done");
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

  // Reset display when ayah changes
  useEffect(() => {
    transcriptRef.current = "";
    setLiveWords([]);
    setAccuracy(null);
    setHint(null);
    setSpeechError(null);
    setPhase("idle");
    killSpeech();
  }, [index, ayah?.ayahNumber, killSpeech]);

  function speechHandlers() {
    return {
      onInterim: (t: string) => applyTranscript(t, true),
      onFinal: (t: string) => applyTranscript(t, true), // keep soft — never force-fail
      onError: (msg: string) => {
        if (/ميكروفون|اسمح|غير مدعوم|لا يوجد/.test(msg)) {
          setSpeechError(msg);
          setPhase("paused");
        } else {
          // network / soft — keep buffer, pause UI
          setHint(msg);
        }
      },
      onListeningChange: (listening: boolean) => {
        if (listening) setPhase("listening");
      },
      onEnd: () => {
        // Silence ended mic — NEVER mark ayah wrong
        if (phaseRef.current === "ayah_done" || phaseRef.current === "range_done") {
          return;
        }
        setPhase("paused");
        setHint(
          "توقّف الاستماع (صمت أو نفس). اضغط «متابعة التسميع» — لا يُحسب خطأ."
        );
      },
    };
  }

  function startListening(preserve: boolean) {
    setSpeechError(null);
    setHint(null);
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
    // Prefer resume() to keep buffer without full restart wipe
    if (speechRef.current) {
      setSpeechError(null);
      setHint(null);
      // Re-bind handlers (resume keeps buffer)
      speechRef.current.start(speechHandlers(), {
        allowSoftResume: false,
        preserveBuffer: true,
      });
      setPhase("listening");
      return;
    }
    startListening(true);
  }

  function stopListening() {
    speechRef.current?.stop();
    setPhase("paused");
  }

  function goNextAyah() {
    killSpeech();
    transcriptRef.current = "";
    if (index >= range.length - 1) {
      setPhase("range_done");
      if (ayah) {
        saveSurahRecitationProgress({
          surahNumber,
          lastCompletedAyah: ayah.ayahNumber,
          continueFromAyah: Math.min(toAyah, ayah.ayahNumber + 1),
          totalAyahs: toAyah,
          lastSessionAt: new Date().toISOString(),
          accuracy: accuracy ?? undefined,
          mistakesCount: 0,
        });
      }
      return;
    }
    setIndex((i) => i + 1);
  }

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
        : phase === "ayah_done"
          ? index >= range.length - 1
            ? "إنهاء المقطع"
            : "الآية التالية"
          : phase === "range_done"
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
    if (phase === "ayah_done") {
      goNextAyah();
      return;
    }
    if (phase === "range_done") {
      router.push("/dashboard");
      return;
    }
    startListening(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-36 sm:pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3 sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/40 py-3 -mx-1 px-1">
        <div>
          <BackButton href="/dashboard" />
          <h1 className="mt-2 text-lg font-bold">
            تسميع مباشر · {surah.nameAr}
          </h1>
          <p className="text-xs text-muted-foreground">
            الآيات {formatArabicNumber(fromAyah)}–{formatArabicNumber(toAyah)}
          </p>
        </div>
        {phase === "listening" && (
          <Badge variant="danger" className="gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            يستمع
          </Badge>
        )}
      </div>

      <Progress value={progressPct} className="h-2" />
      <p className="text-center text-xs text-muted-foreground">
        الآية {formatArabicNumber(index + 1)} من{" "}
        {formatArabicNumber(range.length)}
        {accuracy != null && phase !== "idle" && (
          <> · تطابق تقريبي {formatArabicNumber(Math.round(accuracy))}٪</>
        )}
      </p>

      <Card className="border-[#D4AF37]/20">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-sm font-medium text-[#D4AF37]")}>
              آية {formatArabicNumber(ayah.ayahNumber)}
            </p>
            {phase === "ayah_done" && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                أتممت الآية
              </span>
            )}
          </div>

          {/* Word-by-word live strip */}
          <div
            dir="rtl"
            className="min-h-[120px] rounded-xl bg-muted/30 p-4 text-center leading-[2.2] text-xl sm:text-2xl font-[family-name:var(--font-quran)]"
          >
            {liveWords.length === 0 ? (
              <span className="text-muted-foreground/45 select-none">
                {ayah.text}
              </span>
            ) : (
              liveWords.map((w) => (
                <span
                  key={w.globalIndex}
                  className={cn(
                    "mx-0.5 inline-block transition-colors duration-150",
                    w.status === "correct" &&
                      "text-emerald-600 dark:text-emerald-400 font-semibold",
                    (w.status === "partial" || w.status === "current") &&
                      "text-[#D4AF37] underline decoration-[#D4AF37]/60 font-medium",
                    w.status === "incorrect" && "text-red-500",
                    w.status === "missing" && "text-amber-600/80",
                    (w.status === "pending" || w.status === "hidden") &&
                      "text-muted-foreground/40"
                  )}
                >
                  {w.text}
                </span>
              ))
            )}
          </div>

          {hint && (
            <p className="text-xs text-center text-muted-foreground">{hint}</p>
          )}
          {speechError && (
            <p className="text-xs text-center text-[#D4AF37]">{speechError}</p>
          )}

          {phase === "range_done" && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-center space-y-2">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                أتممت المقطع — بارك الله فيك
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard")}
              >
                الرئيسية
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-center text-muted-foreground px-2">
        الصمت أو أخذ نفس يوقف المايك فقط — لا يُحسب خطأ. اضغط متابعة للاستمرار
        بنفس تقدّمك.
      </p>

      {/* Sticky bottom control — huge touch target */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D4AF37]/25 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-2xl flex gap-2">
          {phase === "listening" ? (
            <Button
              type="button"
              variant="outline"
              className="h-16 flex-1 text-base font-bold gap-2 rounded-2xl border-[#D4AF37]/50"
              onClick={onSticky}
            >
              <MicOff className="h-5 w-5" />
              {stickyLabel}
            </Button>
          ) : (
            <Button
              type="button"
              variant="premium"
              className="h-16 flex-1 text-base font-bold gap-2 rounded-2xl shadow-[0_8px_30px_-8px_rgba(212,175,55,0.55)]"
              onClick={onSticky}
            >
              {phase === "ayah_done" || phase === "range_done" ? (
                <ChevronLeft className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              {stickyLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
