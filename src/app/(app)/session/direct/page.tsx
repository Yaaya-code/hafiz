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
  ContinuousArabicSpeech,
  pickSpeechEngine,
} from "@/lib/quran/continuous-speech";
import {
  isSpeechRecognitionSupported,
  isMobileSpeechEnvironment,
} from "@/lib/quran/speech-recognition";
import { isWasmSpeechSupported } from "@/lib/quran/wasm-whisper-session";
import {
  buildLiveWordStream,
  finalFeedbackAr,
  matchLive,
  resolveMatchProfile,
  type LiveDisplayWord,
  type MatchProfile,
} from "@/lib/quran/live-recitation";
import { formatArabicNumber, cn } from "@/lib/utils";
import { saveSurahRecitationProgress } from "@/lib/quran/recitation-progress";

type Phase =
  | "idle"
  | "listening"
  | "paused"
  | "done"
  | "loading_model"
  | "requesting_mic";

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
  const [modelPct, setModelPct] = useState(0);
  const [modelStatus, setModelStatus] = useState<string | null>(null);
  const [engineLabel, setEngineLabel] = useState("");

  const speechRef = useRef<ContinuousArabicSpeech | null>(null);
  const transcriptRef = useRef("");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const pickMax = useMemo(
    () => getSurah(pickSurah)?.ayahCount ?? 7,
    [pickSurah]
  );

  /** Desktop → webspeech profile (classic match). Mobile → whisper profile. */
  const matchProfile: MatchProfile = useMemo(
    () =>
      resolveMatchProfile(
        pickSpeechEngine() === "wasm-whisper" ? "whisper" : "webspeech"
      ),
    []
  );

  useEffect(() => {
    if (!wordStream.length) return;
    const seed = matchLive(wordStream, "", {
      interim: true,
      strict: true,
      profile: matchProfile,
    });
    setLiveWords(seed.display);
    setCurrentAyah(seed.currentAyah || fromAyah);
  }, [wordStream, fromAyah, matchProfile]);

  const progressPct = useMemo(() => {
    if (!liveWords.length) return 0;
    const done = liveWords.filter((w) => w.status === "correct").length;
    return Math.round((done / liveWords.length) * 100);
  }, [liveWords]);

  /** Internal match cursor (next expected word). Never used for premature visual reveal. */
  const [matchCursor, setMatchCursor] = useState(0);
  const matchCursorRef = useRef(0);

  /** Build Whisper initial_prompt from upcoming expected words (local bias). */
  const buildExpectedPrompt = useCallback(
    (cursor: number) => {
      const flat = wordStream.flatMap((a) => a.displayWords);
      if (!flat.length) return "";
      const from = Math.max(0, cursor);
      // ~12–18 words ahead is enough context without bloating the decoder
      return flat.slice(from, from + 16).join(" ");
    },
    [wordStream]
  );

  const applyTranscript = useCallback(
    (text: string) => {
      transcriptRef.current = text;
      if (!wordStream.length) return;
      const result = matchLive(wordStream, text, {
        interim: true,
        strict: true,
        profile: matchProfile,
      });
      setLiveWords(result.display);
      setAccuracy(result.stats.accuracy);
      setCurrentAyah(result.currentAyah);
      setMatchCursor(result.cursor);
      // Keep decoder bias on the words the user is about to recite (Whisper only)
      speechRef.current?.setExpectedPrompt(buildExpectedPrompt(result.cursor));
      // Auto-clear one-shot hint when user advances past the hinted word
      if (hintOn && result.cursor > matchCursorRef.current) {
        setHintOn(false);
      }
      matchCursorRef.current = result.cursor;

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
    [
      wordStream,
      toAyah,
      surahNumber,
      fromAyah,
      hintOn,
      buildExpectedPrompt,
      matchProfile,
    ]
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
    // Show which free engine will be used
    const eng = pickSpeechEngine();
    setEngineLabel(
      eng === "wasm-whisper"
        ? "محرك مجاني مستمر (Whisper داخل المتصفح)"
        : "محرك المتصفح (Web Speech)"
    );
  }, []);

  useEffect(() => {
    const hardKill = () => killSpeech();
    window.addEventListener("pagehide", hardKill);
    return () => {
      window.removeEventListener("pagehide", hardKill);
      hardKill();
    };
  }, [killSpeech]);

  /**
   * Safety watchdog: never leave the user on loading_model / requesting_mic forever.
   * Engine-level timeouts should fire first; this is a last-resort UI unlock.
   */
  useEffect(() => {
    if (phase !== "loading_model" && phase !== "requesting_mic") return;
    const ms = phase === "requesting_mic" ? 35_000 : 210_000;
    const t = window.setTimeout(() => {
      if (
        phaseRef.current !== "loading_model" &&
        phaseRef.current !== "requesting_mic"
      ) {
        return;
      }
      try {
        speechRef.current?.dispose();
      } catch {
        /* ignore */
      }
      speechRef.current = null;
      setSpeechError(
        phase === "requesting_mic"
          ? "انتهت مهلة الميكروفون من الواجهة. اسمح بالإذن إن طُلب، ثم أعد «ابدأ التسميع»."
          : "انتهت مهلة تحميل المحرك من الواجهة. غالباً شبكة بطيئة أو ذاكرة منخفضة. أعد المحاولة بعد إغلاق تبويبات أخرى."
      );
      setPhase("idle");
      setModelStatus(null);
    }, ms);
    return () => window.clearTimeout(t);
  }, [phase]);

  function speechHandlers() {
    return {
      onInterim: (t: string) => applyTranscript(t),
      onFinal: (t: string) => applyTranscript(t),
      onError: (msg: string) => {
        // ALWAYS surface real error text — never leave user on infinite loading
        const busyPhase =
          phaseRef.current === "loading_model" ||
          phaseRef.current === "requesting_mic";
        const hard =
          busyPhase ||
          /ميكروفون|اسمح|غير مدعوم|لا يوجد|مهلة|فشل|خطأ|memory|OOM|رفض/i.test(
            msg
          );
        if (hard) {
          setSpeechError(msg);
          setStatusMsg(null);
          if (busyPhase) {
            setPhase("idle");
            setModelStatus(null);
          } else if (phaseRef.current === "listening") {
            setPhase("paused");
          }
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

  /** Hard cancel during mic/model prep — frees locks and leaves idle with message */
  function cancelPreparing() {
    try {
      speechRef.current?.dispose();
    } catch {
      /* ignore */
    }
    speechRef.current = null;
    setPhase("idle");
    setModelStatus(null);
    setModelPct(0);
    setSpeechError(
      "أُلغي التحضير. إن تكرّر التعليق: أعد تحميل الصفحة، أغلق تبويبات أخرى لتوفير الذاكرة، ثم اضغط «ابدأ» مرة واحدة."
    );
  }

  async function startListening(preserve: boolean) {
    // Prevent double-tap stacking another start while first is mid-flight
    if (
      phaseRef.current === "loading_model" ||
      phaseRef.current === "requesting_mic"
    ) {
      setStatusMsg(
        "التحضير جارٍ… لا تضغط مراراً. استخدم «إلغاء» إن طال الانتظار."
      );
      return;
    }

    setSpeechError(null);
    setStatusMsg(null);
    setReport(null);

    const eng = pickSpeechEngine();
    if (eng === "webspeech" && !isSpeechRecognitionSupported()) {
      if (!isWasmSpeechSupported()) {
        setSpeechError(
          "التعرّف على الصوت غير مدعوم على هذا الجهاز/المتصفح."
        );
        return;
      }
    }
    if (eng === "wasm-whisper" && !isWasmSpeechSupported()) {
      setSpeechError(
        "محرك التعرّف المجاني يحتاج متصفحاً حديثاً واتصالاً آمناً (HTTPS)."
      );
      return;
    }

    if (!speechRef.current) speechRef.current = new ContinuousArabicSpeech();

    // Mic first phase is inside wasm start; show requesting_mic immediately
    setPhase("requesting_mic");
    setModelStatus("طلب إذن الميكروفون…");
    // Keep last known % if model already partially loaded (preload / prior attempt)
    setModelPct((p) => (eng === "wasm-whisper" && p > 0 ? p : 0));

    try {
      const r = await speechRef.current.start(speechHandlers(), {
        preserveBuffer: preserve,
        expectedPrompt: buildExpectedPrompt(matchCursorRef.current),
        onPhase: (p) => {
          if (p === "mic") {
            setPhase("requesting_mic");
            setModelStatus("طلب إذن الميكروفون…");
          } else if (p === "model") {
            setPhase("loading_model");
            setModelStatus("تحميل/تجهيز النموذج في الخلفية…");
          } else if (p === "ready") {
            setModelStatus("المايك جاهز…");
            setModelPct(100);
          }
        },
        onModelProgress: (pct, status) => {
          setPhase("loading_model");
          setModelPct(pct);
          setModelStatus(status);
        },
      });

      if (!r.ok) {
        setSpeechError(
          r.error ||
            "تعذّر بدء التسميع. التفاصيل: فشل غير معروف — أعد التحميل."
        );
        setPhase("idle");
        setModelStatus(null);
        return;
      }

      setEngineLabel(
        r.engine === "wasm-whisper"
          ? "محرك مجاني مستمر (Whisper داخل المتصفح)"
          : "محرك المتصفح (Web Speech)"
      );
      setModelStatus(null);
      setModelPct(100);
      setPhase("listening");
      if (r.engine === "wasm-whisper") {
        setStatusMsg(
          "المايك مفتوح باستمرار. التعرّف يعمل داخل جهازك مجاناً (نوافذ قصيرة)."
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "انهيار صامت أثناء التشغيل (التفاصيل غير متاحة)";
      setSpeechError("خطأ: " + msg);
      setPhase("idle");
      setModelStatus(null);
      try {
        speechRef.current?.dispose();
      } catch {
        /* ignore */
      }
      speechRef.current = null;
    }
  }

  async function continueListening() {
    if (
      phaseRef.current === "loading_model" ||
      phaseRef.current === "requesting_mic"
    ) {
      return;
    }
    setSpeechError(null);
    setStatusMsg(null);
    if (!speechRef.current) {
      await startListening(true);
      return;
    }
    setPhase("requesting_mic");
    setModelStatus("إعادة فتح الميكروفون…");
    try {
      const r = await speechRef.current.resume();
      if (!r.ok) {
        setSpeechError(
          r.error || "فشل الاستئناف — سيعاد التشغيل الكامل."
        );
        await startListening(true);
        return;
      }
      setPhase("listening");
      setModelStatus(null);
    } catch (e) {
      setSpeechError(
        "فشل الاستئناف: " +
          (e instanceof Error ? e.message : String(e))
      );
      setPhase("paused");
      setModelStatus(null);
    }
  }

  /** Explicit user pause */
  function stopListening() {
    speechRef.current?.pause();
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
      profile: matchProfile,
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

  const busy =
    phase === "loading_model" || phase === "requesting_mic";

  function onPrimaryAction() {
    if (busy) return;
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
    phase === "requesting_mic"
      ? "طلب الميكروفون…"
      : phase === "loading_model"
        ? "تحميل المحرك…"
        : phase === "listening"
          ? "إيقاف"
          : phase === "paused"
            ? "متابعة التسميع"
            : phase === "done"
              ? "العودة للرئيسية"
              : "ابدأ التسميع";

  function renderWord(w: LiveDisplayWord) {
    /**
     * Strict UX:
     * - Never auto-reveal or gold-highlight the next word just because prior matched.
     * - Reveal only after the user spoke that word (correct green / incorrect red).
     * - Explicit «تلميح» may peek the single next expected word only.
     */
    const isJudged =
      w.status === "correct" ||
      w.status === "incorrect" ||
      w.status === "missing";
    const showHint = hintOn && w.globalIndex === matchCursor && !isJudged;
    const visible = showAllText || isJudged || showHint;

    if (!visible) {
      // Hidden / watermark placeholder — no cursor gold on unspoken words
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
          showHint && "text-[#D4AF37] underline decoration-[#D4AF37]/50",
          (w.status === "incorrect" || w.status === "missing") &&
            "text-red-500 font-medium",
          showAllText &&
            !isJudged &&
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
            {busy && (
              <Button
                type="button"
                variant="ghost"
                className="h-12 px-3 text-xs shrink-0 text-red-500"
                onClick={cancelPreparing}
              >
                إلغاء
              </Button>
            )}
            <Button
              type="button"
              variant={phase === "listening" ? "outline" : "premium"}
              disabled={busy}
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
            {phase === "listening" && engineLabel && (
              <> · {engineLabel}</>
            )}
          </p>
          {(phase === "loading_model" || phase === "requesting_mic") && (
            <div className="space-y-1 rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-2 py-2">
              <Progress
                value={
                  phase === "requesting_mic"
                    ? 8
                    : Math.max(5, Math.min(100, modelPct))
                }
                className="h-2"
              />
              <p className="text-center text-[11px] text-[#D4AF37] font-medium">
                {modelStatus ||
                  (phase === "requesting_mic"
                    ? "طلب إذن الميكروفون…"
                    : "تحميل المحرك…")}
                {phase === "loading_model" ? ` · ${modelPct}%` : ""}
              </p>
              <p className="text-center text-[10px] text-muted-foreground">
                لا تغلق الصفحة. النسبة لا تتراجع. إن طال الانتظار اضغط «إلغاء».
              </p>
            </div>
          )}
          {statusMsg && !speechError && (
            <p className="text-center text-[11px] text-muted-foreground break-words px-1">
              {statusMsg}
            </p>
          )}
          {speechError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-2 space-y-1">
              <p className="text-center text-[11px] text-red-600 dark:text-red-400 break-words font-medium">
                {speechError}
              </p>
              <p className="text-center text-[10px] text-muted-foreground">
                هذه رسالة الخطأ الحقيقية من المحرك — ليس تعليقاً صامتاً.
              </p>
            </div>
          )}
          {engineLabel && phase === "idle" && (
            <p className="text-center text-[10px] text-muted-foreground">
              {isMobileSpeechEnvironment()
                ? "على الموبايل: محرك Whisper مجاني داخل المتصفح (بدون سحابة مدفوعة وبدون نغمة إعادة تشغيل)."
                : engineLabel}
            </p>
          )}
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
