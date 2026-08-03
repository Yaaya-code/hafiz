"use client";

/**
 * Direct recitation — fixed single shell:
 * 1) Range picker if URL has no explicit surah/from/to
 * 2) Hidden text (reveal on match + optional hint)
 * 3) Strict matchLive — no random word skips
 * 4) Full-range continuous block; mic silence → pause + resume
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
import { CheckCircle2, Eye, EyeOff, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/layout/back-button";
import { SURAHS, getSurah, getSurahAyahs } from "@/lib/quran";
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

  // Explicit range only — no silent Baqarah 1–10 default
  const hasExplicitRange =
    params.has("surah") && params.has("from") && params.has("to");

  const surahQ = Number(params.get("surah") || 0);
  const fromQ = Number(params.get("from") || 0);
  const toQ = Number(params.get("to") || 0);

  // Picker state (used when no explicit range)
  const [pickSurah, setPickSurah] = useState(1);
  const [pickFrom, setPickFrom] = useState(1);
  const [pickTo, setPickTo] = useState(7);

  const surahNumber = hasExplicitRange
    ? Math.max(1, Math.min(114, surahQ))
    : 0;
  const fromAyah = hasExplicitRange ? Math.max(1, fromQ) : 0;
  const allAyahs = useMemo(
    () => (surahNumber ? getSurahAyahs(surahNumber) : []),
    [surahNumber]
  );
  const toAyah = hasExplicitRange
    ? Math.min(
        Math.max(fromAyah, toQ),
        allAyahs.length || toQ
      )
    : 0;

  const surah = surahNumber ? getSurah(surahNumber) : null;
  const range = useMemo(
    () =>
      allAyahs.filter(
        (a) => a.ayahNumber >= fromAyah && a.ayahNumber <= toAyah
      ),
    [allAyahs, fromAyah, toAyah]
  );

  const wordStream = useMemo(() => buildLiveWordStream(range), [range]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [liveWords, setLiveWords] = useState<LiveDisplayWord[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [currentAyah, setCurrentAyah] = useState(fromAyah);
  const [hintOn, setHintOn] = useState(false);
  /** Force-reveal all text (user toggle) */
  const [showAllText, setShowAllText] = useState(false);

  const speechRef = useRef<ArabicSpeechSession | null>(null);
  const transcriptRef = useRef("");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const pickMax = useMemo(
    () => getSurah(pickSurah)?.ayahCount ?? 7,
    [pickSurah]
  );

  useEffect(() => {
    if (!wordStream.length) return;
    const seed = matchLive(wordStream, "", { interim: true, strict: true });
    setLiveWords(seed.display);
    setCurrentAyah(seed.currentAyah || fromAyah);
  }, [wordStream, fromAyah]);

  const progressPct = useMemo(() => {
    if (!liveWords.length) return 0;
    const done = liveWords.filter((w) => w.status === "correct").length;
    return Math.round((done / liveWords.length) * 100);
  }, [liveWords]);

  const cursorWord = useMemo(
    () => liveWords.find((w) => w.status === "current" || w.status === "partial"),
    [liveWords]
  );

  const applyTranscript = useCallback(
    (text: string) => {
      transcriptRef.current = text;
      if (!wordStream.length) return;
      const result = matchLive(wordStream, text, {
        interim: true,
        strict: true,
      });
      setLiveWords(result.display);
      setAccuracy(result.stats.accuracy);
      setCurrentAyah(result.currentAyah);
      // Auto-clear one-shot hint when user advances past it
      if (hintOn && result.cursor > (cursorWord?.globalIndex ?? -1)) {
        setHintOn(false);
      }

      if (
        result.display.length > 0 &&
        result.display.every((w) => w.status === "correct") &&
        phaseRef.current === "listening"
      ) {
        try {
          speechRef.current?.stop();
        } catch {
          /* ignore */
        }
        setPhase("done");
        setReport(
          finalFeedbackAr(result.stats, result.lastCompletedAyah, toAyah)
        );
        saveSurahRecitationProgress({
          surahNumber,
          lastCompletedAyah: result.lastCompletedAyah,
          continueFromAyah: Math.min(
            toAyah,
            (result.lastCompletedAyah || fromAyah) + 1
          ),
          totalAyahs: toAyah,
          lastSessionAt: new Date().toISOString(),
          accuracy: result.stats.accuracy,
          mistakesCount: result.stats.incorrect,
        });
      }
    },
    [wordStream, toAyah, surahNumber, fromAyah, hintOn, cursorWord?.globalIndex]
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
    return () => {
      window.removeEventListener("pagehide", hardKill);
      hardKill();
    };
  }, [killSpeech]);

  function speechHandlers() {
    return {
      onInterim: (t: string) => applyTranscript(t),
      onFinal: (t: string) => applyTranscript(t),
      onError: (msg: string) => {
        if (/ميكروفون|اسمح|غير مدعوم|لا يوجد/.test(msg)) {
          setSpeechError(msg);
          setPhase("paused");
        } else {
          setStatusMsg(msg);
        }
      },
      onListeningChange: (listening: boolean) => {
        // With continuousAutoResume, brief false→true is normal; stay "listening"
        if (listening) setPhase("listening");
      },
      onEnd: () => {
        // Only reached when continuousAutoResume is off or user stopped
        if (phaseRef.current === "done") return;
        if (phaseRef.current === "listening") {
          // Soft browser end without continuous flag — show resume
          setPhase("paused");
          setStatusMsg(
            "توقّف المايك. اضغط «متابعة التسميع» — السياق محفوظ."
          );
        }
      },
    };
  }

  async function startListening(preserve: boolean) {
    setSpeechError(null);
    setStatusMsg(null);
    setReport(null);
    if (!isSpeechRecognitionSupported()) {
      setSpeechError(
        "التعرّف على الصوت غير مدعوم. استخدم Chrome على Android أو سطح المكتب."
      );
      return;
    }
    if (!speechRef.current) speechRef.current = new ArabicSpeechSession();
    // MediaStream Audio Lock first — hardware stays open (no Android beep)
    const r = await speechRef.current.startWithMicLock(speechHandlers(), {
      continuousAutoResume: true,
      preserveBuffer: preserve,
    });
    if (!r.ok) {
      setSpeechError(r.error || "تعذّر بدء الميكروفون");
      setPhase("idle");
      return;
    }
    setPhase("listening");
  }

  async function continueListening() {
    setSpeechError(null);
    setStatusMsg(null);
    if (!speechRef.current) {
      await startListening(true);
      return;
    }
    // Re-use held MediaStream lock — no second getUserMedia if still live
    const r = await speechRef.current.startWithMicLock(speechHandlers(), {
      continuousAutoResume: true,
      preserveBuffer: true,
    });
    if (!r.ok) {
      setSpeechError(r.error || "تعذّر الاستئناف");
      setPhase("paused");
      return;
    }
    setPhase("listening");
  }

  /**
   * Explicit user pause — stops SpeechRecognition but keeps mic hardware lock
   * so «متابعة» does not re-open hardware (no beep).
   */
  function stopListening() {
    speechRef.current?.pauseRecognition();
    setPhase("paused");
    setStatusMsg("أوقفتَ التسميع يدوياً. اضغط «متابعة» للاستئناف.");
  }

  function endSession() {
    const finalText =
      speechRef.current?.stop() || transcriptRef.current || "";
    killSpeech();
    const result = matchLive(wordStream, finalText, {
      interim: false,
      strict: true,
    });
    setLiveWords(result.display);
    setAccuracy(result.stats.accuracy);
    setPhase("done");
    setReport(
      finalFeedbackAr(result.stats, result.lastCompletedAyah, toAyah)
    );
    saveSurahRecitationProgress({
      surahNumber,
      lastCompletedAyah: result.lastCompletedAyah,
      continueFromAyah: Math.min(
        toAyah,
        (result.lastCompletedAyah || fromAyah) + 1
      ),
      totalAyahs: toAyah,
      lastSessionAt: new Date().toISOString(),
      accuracy: result.stats.accuracy,
      mistakesCount: result.stats.incorrect,
    });
  }

  function confirmRange() {
    const max = getSurah(pickSurah)?.ayahCount ?? 1;
    const from = Math.max(1, Math.min(max, pickFrom || 1));
    const to = Math.max(from, Math.min(max, pickTo || from));
    router.replace(
      `/session/direct?surah=${pickSurah}&from=${from}&to=${to}`
    );
  }

  const byAyah = useMemo(() => {
    const map = new Map<number, LiveDisplayWord[]>();
    for (const w of liveWords) {
      if (!map.has(w.ayahNumber)) map.set(w.ayahNumber, []);
      map.get(w.ayahNumber)!.push(w);
    }
    return map;
  }, [liveWords]);

  // ── Range picker shell (no assumed range) ─────────────────────────────
  if (!hasExplicitRange) {
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-16">
        <BackButton href="/dashboard" />
        <h1 className="text-xl font-bold">تسميع مباشر</h1>
        <p className="text-sm text-muted-foreground">
          حدّد السورة والنطاق أولاً — لا نفترض مقطعاً افتراضياً.
        </p>
        <Card className="border-[#D4AF37]/25">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">اختيار النطاق</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ps">السورة</Label>
              <select
                id="ps"
                className="flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={pickSurah}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPickSurah(n);
                  const max = getSurah(n)?.ayahCount ?? 1;
                  setPickFrom(1);
                  setPickTo(Math.min(7, max));
                }}
              >
                {SURAHS.map((s) => (
                  <option key={s.number} value={s.number}>
                    {formatArabicNumber(s.number)}. {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pf">من الآية</Label>
                <Input
                  id="pf"
                  type="number"
                  min={1}
                  max={pickMax}
                  value={pickFrom}
                  onChange={(e) => setPickFrom(Number(e.target.value))}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt">إلى الآية</Label>
                <Input
                  id="pt"
                  type="number"
                  min={1}
                  max={pickMax}
                  value={pickTo}
                  onChange={(e) => setPickTo(Number(e.target.value))}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="premium"
              className="w-full h-12"
              onClick={confirmRange}
            >
              ابدأ التسميع
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!surah || !range.length) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center space-y-3">
        <p className="font-semibold">نطاق غير صالح</p>
        <Link href="/session/direct" className="text-primary text-sm underline">
          إعادة اختيار النطاق
        </Link>
      </div>
    );
  }

  function onPrimaryAction() {
    if (phase === "listening") {
      stopListening();
      return;
    }
    if (phase === "paused") {
      void continueListening();
      return;
    }
    if (phase === "done") {
      router.push("/dashboard");
      return;
    }
    void startListening(false);
  }

  const primaryLabel =
    phase === "listening"
      ? "إيقاف"
      : phase === "paused"
        ? "متابعة التسميع"
        : phase === "done"
          ? "العودة للرئيسية"
          : "ابدأ التسميع";

  function renderWord(w: LiveDisplayWord) {
    const isCursor =
      w.status === "current" || w.status === "partial";
    const showHint = hintOn && isCursor;
    const visible =
      showAllText ||
      w.status === "correct" ||
      w.status === "incorrect" ||
      w.status === "missing" ||
      showHint;

    if (!visible) {
      // Hidden / watermark placeholder
      return (
        <span
          key={w.globalIndex}
          className="mx-0.5 inline-block select-none text-muted-foreground/25 tracking-widest"
          aria-hidden
        >
          ░░░
        </span>
      );
    }

    return (
      <span
        key={w.globalIndex}
        className={cn(
          "mx-0.5 inline-block transition-colors duration-100 font-[family-name:var(--font-quran)]",
          w.status === "correct" &&
            "text-emerald-600 dark:text-emerald-400 font-semibold",
          isCursor && "text-[#D4AF37] underline decoration-[#D4AF37]/50",
          (w.status === "incorrect" || w.status === "missing") &&
            "text-red-500 font-medium",
          showAllText &&
            w.status === "pending" &&
            "text-muted-foreground/50"
        )}
      >
        {w.text}
      </span>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      {/*
        STICKY TOP CONTROL BAR — first thing user sees; stays under thumb while scrolling.
        sticky top-0 z-50 — NOT after 286 ayahs in the document flow.
      */}
      <div className="sticky top-0 z-50 -mx-1 border-b border-[#D4AF37]/30 bg-background/98 shadow-md backdrop-blur-md">
        <div className="space-y-2 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <BackButton href="/dashboard" />
              <h1 className="mt-1 text-base sm:text-lg font-bold truncate">
                تسميع · {surah.nameAr}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {formatArabicNumber(fromAyah)}–{formatArabicNumber(toAyah)}
                </span>
              </h1>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {phase === "listening" && (
                <Badge variant="danger" className="gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  يستمع
                </Badge>
              )}
              {phase === "paused" && <Badge variant="warning">متوقف</Badge>}
            </div>
          </div>

          {/* Tools row */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={hintOn ? "premium" : "outline"}
              className="gap-1 h-9"
              onClick={() => setHintOn((v) => !v)}
              disabled={phase === "done"}
            >
              <Eye className="h-3.5 w-3.5" />
              {hintOn ? "إخفاء التلميح" : "تلميح"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1 h-9"
              onClick={() => setShowAllText((v) => !v)}
            >
              {showAllText ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {showAllText ? "إخفاء النص" : "إظهار النص"}
            </Button>
            <Link
              href="/session/direct"
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              تغيير النطاق
            </Link>
          </div>

          {/* Primary actions — always on screen */}
          <div className="flex gap-2">
            {(phase === "listening" || phase === "paused") && (
              <Button
                type="button"
                variant="ghost"
                className="h-12 px-3 text-xs shrink-0"
                onClick={endSession}
              >
                إنهاء
              </Button>
            )}
            <Button
              type="button"
              variant={phase === "listening" ? "outline" : "premium"}
              className={cn(
                "h-12 flex-1 text-base font-bold gap-2 rounded-xl",
                phase !== "listening" &&
                  "shadow-[0_8px_24px_-8px_rgba(212,175,55,0.5)]"
              )}
              onClick={onPrimaryAction}
            >
              {phase === "listening" ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              {primaryLabel}
            </Button>
          </div>

          <Progress value={progressPct} className="h-1.5" />
          <p className="text-center text-[11px] text-muted-foreground">
            آية {formatArabicNumber(currentAyah || fromAyah)}
            {accuracy != null && phase !== "idle" && (
              <> · {formatArabicNumber(Math.round(accuracy * 100))}٪</>
            )}
            {phase === "listening" && (
              <> · المايك مقفول مفتوحاً (بدون نغمة إعادة تشغيل)</>
            )}
          </p>
        </div>
      </div>

      {/* Scrollable ayah content — controls never live below this */}
      <div className="space-y-3">
        {range.map((a) => {
          const words = byAyah.get(a.ayahNumber) || [];
          const isCurrent = a.ayahNumber === currentAyah && phase !== "idle";
          return (
            <Card
              key={a.ayahNumber}
              className={cn(
                "border-border/40",
                isCurrent && "border-[#D4AF37]/45 bg-[#D4AF37]/5"
              )}
            >
              <CardContent className="pt-4 pb-4 space-y-2">
                <p className="text-[11px] font-medium text-[#D4AF37]">
                  آية {formatArabicNumber(a.ayahNumber)}
                </p>
                <div
                  dir="rtl"
                  className="min-h-[3rem] text-center leading-[2.2] text-lg sm:text-xl"
                >
                  {words.length === 0
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <span
                          key={i}
                          className="mx-0.5 text-muted-foreground/20"
                        >
                          ░░░
                        </span>
                      ))
                    : words.map(renderWord)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {statusMsg && (
        <p className="text-xs text-center text-muted-foreground px-2">
          {statusMsg}
        </p>
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
    </div>
  );
}
