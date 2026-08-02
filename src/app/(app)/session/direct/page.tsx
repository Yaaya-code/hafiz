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
        if (listening) setPhase("listening");
      },
      onEnd: () => {
        if (phaseRef.current === "done") return;
        setPhase("paused");
        setStatusMsg(
          "توقّف المايك (صمت أو نفس). اضغط «متابعة التسميع» — السياق محفوظ."
        );
      },
    };
  }

  function startListening(preserve: boolean) {
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
    setStatusMsg(null);
    if (!speechRef.current) {
      startListening(true);
      return;
    }
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
    <div className="mx-auto max-w-2xl space-y-4 pb-40 sm:pb-32">
      <div className="flex flex-wrap items-start justify-between gap-3 sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/40 py-3 -mx-1 px-1">
        <div>
          <BackButton href="/dashboard" />
          <h1 className="mt-2 text-lg font-bold">
            تسميع مباشر · {surah.nameAr}
          </h1>
          <p className="text-xs text-muted-foreground">
            {formatArabicNumber(fromAyah)}–{formatArabicNumber(toAyah)} · نص
            مخفي · مطابقة صارمة
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === "listening" && (
            <Badge variant="danger" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              يستمع
            </Badge>
          )}
          {phase === "paused" && (
            <Badge variant="warning">متوقف — السياق محفوظ</Badge>
          )}
        </div>
      </div>

      <Progress value={progressPct} className="h-2" />
      <p className="text-center text-xs text-muted-foreground">
        آية {formatArabicNumber(currentAyah || fromAyah)}
        {accuracy != null && phase !== "idle" && (
          <> · {formatArabicNumber(Math.round(accuracy * 100))}٪</>
        )}
      </p>

      {/* Controls: hint + show text */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button
          type="button"
          size="sm"
          variant={hintOn ? "premium" : "outline"}
          className="gap-1"
          onClick={() => setHintOn((v) => !v)}
          disabled={phase === "done"}
        >
          <Eye className="h-3.5 w-3.5" />
          {hintOn ? "إخفاء التلميح" : "تلميح (الكلمة الحالية)"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1"
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
          className="inline-flex h-8 items-center text-xs text-muted-foreground underline px-2"
        >
          تغيير النطاق
        </Link>
      </div>

      {/* Hidden-text range block — fixed layout */}
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

      <p className="text-[11px] text-center text-muted-foreground px-2">
        النص مخفي افتراضياً. الكلمات الصحيحة تظهر خضراء لحظة التعرّف. المطابقة
        صارمة — لا قفز عشوائي بين الكلمات.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D4AF37]/25 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-2xl flex gap-2">
          {(phase === "listening" || phase === "paused") && (
            <Button
              type="button"
              variant="ghost"
              className="h-14 px-3 text-xs shrink-0"
              onClick={endSession}
            >
              إنهاء
            </Button>
          )}
          <Button
            type="button"
            variant={phase === "listening" ? "outline" : "premium"}
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
