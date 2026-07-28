"use client";

/**
 * Teacher-style revision/memorization session:
 * full surah, audio, meanings, SurahGuide (focused actions), live voice recitation.
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
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  StickyNote,
  Volume2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  getSurah,
  getSurahAyahs,
  ayahAudioUrl,
  getAvailableQaris,
  getQari,
  resolvePlayableQariId,
} from "@/lib/quran";
import { fetchSurahMeanings } from "@/lib/quran/meanings";
import {
  ArabicSpeechSession,
  isMobileSpeechEnvironment,
  isSpeechRecognitionSupported,
  requestMicrophonePermission,
} from "@/lib/quran/speech-recognition";
import {
  buildLiveWordStream,
  finalFeedbackAr,
  matchLive,
  type LiveDisplayWord,
} from "@/lib/quran/live-recitation";
import { SurahGuide } from "@/components/quran/surah-guide";
import {
  buildAyahReview,
  getSurahRecitationProgress,
  saveSurahRecitationProgress,
  type AyahReviewItem,
} from "@/lib/quran/recitation-progress";
import {
  isAyahBookmarked,
  notesForAyah,
  saveNote,
  toggleAyahBookmark,
} from "@/lib/user-activity";
import { completeSession, recordMistake } from "@/application";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { formatArabicNumber, cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/layout/back-button";
import {
  playGlobalAudio,
  stopGlobalAudio,
} from "@/lib/audio/global-audio";

export default function RevisionSessionPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[80vh] max-w-4xl" />}>
      <RevisionSession />
    </Suspense>
  );
}

function RevisionSession() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile } = useHafizProfile();

  const stepId = params.get("step") || "rev_0";
  const memoryId = params.get("memoryId") || params.get("mid") || undefined;
  const surahNumber = Math.max(
    1,
    Math.min(114, Number(params.get("surah") || 1))
  );
  const focusFrom = Math.max(1, Number(params.get("from") || 1));
  const focusToParam = Number(params.get("to") || 0);
  const mode = params.get("mode") === "memorize" ? "memorize" : "revision";

  const surah = getSurah(surahNumber);
  const allAyahs = useMemo(() => getSurahAyahs(surahNumber), [surahNumber]);
  const focusTo =
    focusToParam > 0
      ? Math.min(focusToParam, allAyahs.length || focusToParam)
      : Math.min(focusFrom + 15, allAyahs.length || focusFrom); // never default to full surah

  /**
   * Strict Range Rendering: ONLY the day's wird (StartAyah..EndAyah).
   * Never render the whole 286-ayah Baqarah for a 16-ayah task.
   */
  const ayahs = useMemo(
    () =>
      allAyahs.filter(
        (a) => a.ayahNumber >= focusFrom && a.ayahNumber <= focusTo
      ),
    [allAyahs, focusFrom, focusTo]
  );

  const ayahIndex = useCallback(
    (ayahNumber: number) =>
      ayahs.findIndex((a) => a.ayahNumber === ayahNumber),
    [ayahs]
  );

  /** surah = full memorization test; ayah = single-ayah practice */
  const [voiceMode, setVoiceMode] = useState<"surah" | "ayah">("surah");
  const [targetAyah, setTargetAyah] = useState<number | null>(null);

  const [meanings, setMeanings] = useState<Record<number, string>>({});
  const [expandedMeaning, setExpandedMeaning] = useState<Record<number, boolean>>(
    {}
  );
  const availableQaris = useMemo(() => getAvailableQaris(), []);
  const [qariId, setQariId] = useState(() =>
    resolvePlayableQariId(profile.preferredQariId)
  );
  // playIndex is 0-based index into scoped `ayahs` array
  const [playIndex, setPlayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playAll, setPlayAll] = useState(false);
  const [loopAyah, setLoopAyah] = useState(false);
  const [hideText] = useState(false);
  const playAllRef = useRef(false);
  const loopRef = useRef(false);

  // Voice / immersive recitation mode
  const [reciting, setReciting] = useState(false);
  const [reciteMode, setReciteMode] = useState(false);
  const [revealText, setRevealText] = useState(false);
  const [liveWords, setLiveWords] = useState<LiveDisplayWord[]>([]);
  const [liveStats, setLiveStats] = useState<ReturnType<
    typeof matchLive
  >["stats"] | null>(null);
  const [revealedUpToAyah, setRevealedUpToAyah] = useState(0);
  const [lastCompletedAyah, setLastCompletedAyah] = useState(0);
  const [currentReciteAyah, setCurrentReciteAyah] = useState(0);
  const [finalReport, setFinalReport] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [ayahReview, setAyahReview] = useState<AyahReviewItem[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [userRecordingUrl, setUserRecordingUrl] = useState<string | null>(null);
  const [continueFrom, setContinueFrom] = useState(focusFrom);
  const [errorCards, setErrorCards] = useState<
    {
      expected: string;
      heard: string;
      surahNumber: number;
      ayahNumber: number;
      kind: "incorrect" | "missing";
    }[]
  >([]);
  const [listenRepeat, setListenRepeat] = useState(false);
  const listenRepeatRef = useRef(false);
  const speechRef = useRef<ArabicSpeechSession | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Notes / bookmark for focused ayah
  const [focusAyah, setFocusAyah] = useState(focusFrom);
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState<{ id: string; content: string }[]>([]);
  const [bookmarked, setBookmarked] = useState(false);

  /** Active recitation target (ref so mic callbacks always see latest) */
  const targetRef = useRef<{
    mode: "surah" | "ayah";
    ayah: number | null;
    fromAyah: number;
  }>({ mode: "surah", ayah: null, fromAyah: focusFrom });

  /** Scoped engine: only words inside this wird (never full surah word count) */
  function getReciteAyahsList() {
    const t = targetRef.current;
    if (t.mode === "ayah" && t.ayah) {
      return ayahs.filter((a) => a.ayahNumber === t.ayah);
    }
    const start = Math.max(focusFrom, t.fromAyah || focusFrom);
    return ayahs.filter(
      (a) => a.ayahNumber >= start && a.ayahNumber <= focusTo
    );
  }

  // Load meanings
  useEffect(() => {
    let c = false;
    fetchSurahMeanings(surahNumber).then((m) => {
      if (!c) setMeanings(m);
    });
    return () => {
      c = true;
    };
  }, [surahNumber]);

  // Load saved recitation progress — clamp strictly inside today's wird
  useEffect(() => {
    const saved = getSurahRecitationProgress(surahNumber);
    const savedFrom = saved?.continueFromAyah;
    if (
      savedFrom &&
      savedFrom >= focusFrom &&
      savedFrom <= focusTo + 1
    ) {
      setContinueFrom(Math.min(focusTo, Math.max(focusFrom, savedFrom)));
      setLastCompletedAyah(
        Math.min(
          focusTo,
          Math.max(0, saved.lastCompletedAyah || 0)
        )
      );
    } else {
      setContinueFrom(focusFrom);
      setLastCompletedAyah(0);
    }
    setPlayIndex(0);
    setErrorCards([]);
  }, [surahNumber, focusFrom, focusTo]);

  useEffect(() => {
    setQariId(resolvePlayableQariId(profile.preferredQariId));
  }, [profile.preferredQariId]);

  useEffect(() => {
    setBookmarked(isAyahBookmarked(surahNumber, focusAyah));
    setNotes(
      notesForAyah(surahNumber, focusAyah).map((n) => ({
        id: n.id,
        content: n.content,
      }))
    );
  }, [surahNumber, focusAyah]);

  const stopAudio = useCallback(() => {
    stopGlobalAudio();
    setPlaying(false);
  }, []);

  useEffect(() => {
    loopRef.current = loopAyah;
  }, [loopAyah]);

  useEffect(() => {
    listenRepeatRef.current = listenRepeat;
  }, [listenRepeat]);

  const startReciteRef = useRef<
    ((opts?: {
      fromAyah?: number;
      mode?: "surah" | "ayah";
      ayah?: number;
    }) => void) | null
  >(null);

  const finishListenRepeatPlayback = useCallback(() => {
    setPlaying(false);
    setPlayAll(false);
    playAllRef.current = false;
    if (!listenRepeatRef.current) return;
    listenRepeatRef.current = false;
    setListenRepeat(false);
    // Defer so audio cleanup settles before mic session starts
    window.setTimeout(() => {
      if (!isSpeechRecognitionSupported()) return;
      startReciteRef.current?.({ mode: "surah", fromAyah: focusFrom });
    }, 350);
  }, [focusFrom]);

  const playAyahAt = useCallback(
    (idx: number) => {
      const a = ayahs[idx];
      if (!a) return;
      setPlayIndex(idx);
      setFocusAyah(a.ayahNumber);
      setPlaying(true);
      // Primary + built-in Alafasy fallback; offline soft-notice via global-audio
      const tryUrl = ayahAudioUrl(qariId, a.surahNumber, a.ayahNumber);
      const fallbackUrl =
        qariId !== "alafasy"
          ? ayahAudioUrl("alafasy", a.surahNumber, a.ayahNumber)
          : undefined;
      playGlobalAudio(tryUrl, {
        loop: loopRef.current,
        fallbackUrl,
        onEnded: () => {
          if (loopRef.current) {
            playAyahAt(idx);
            return;
          }
          // Surah-level qaris (e.g. Islam Sobhi): one file = whole surah — don't chain ayahs
          const surahMode = getQari(qariId)?.playbackMode === "surah";
          if (surahMode) {
            finishListenRepeatPlayback();
            return;
          }
          if (playAllRef.current && idx < ayahs.length - 1) {
            playAyahAt(idx + 1);
          } else {
            finishListenRepeatPlayback();
          }
        },
        onError: () => setPlaying(false),
      });
    },
    [ayahs, qariId, finishListenRepeatPlayback]
  );

  function applyLiveTranscript(text: string, interim: boolean) {
    setTranscript(text);
    const liveStream = buildLiveWordStream(getReciteAyahsList());
    const result = matchLive(liveStream, text, { interim });
    setLiveWords(result.display);
    setLiveStats(result.stats);
    setRevealedUpToAyah(result.revealedUpToAyah);
    setLastCompletedAyah(result.lastCompletedAyah);
    setCurrentReciteAyah(result.currentAyah);
    if (result.currentAyah) setFocusAyah(result.currentAyah);
  }

  async function startMicRecording() {
    try {
      const streamMic = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = streamMic;
      mediaChunksRef.current = [];
      const rec = new MediaRecorder(streamMic);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(mediaChunksRef.current, { type: "audio/webm" });
        if (userRecordingUrl) URL.revokeObjectURL(userRecordingUrl);
        setUserRecordingUrl(URL.createObjectURL(blob));
        streamMic.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      };
      rec.start(250);
    } catch {
      /* mic already used by speech API — optional */
    }
  }

  function stopMicRecording() {
    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
  }

  async function startRecite(opts?: {
    fromAyah?: number;
    mode?: "surah" | "ayah";
    ayah?: number;
  }) {
    const mode = opts?.mode || "surah";
    setVoiceMode(mode);
    if (mode === "ayah" && opts?.ayah) {
      setTargetAyah(opts.ayah);
      setCurrentReciteAyah(opts.ayah);
      setFocusAyah(opts.ayah);
      targetRef.current = {
        mode: "ayah",
        ayah: opts.ayah,
        fromAyah: opts.ayah,
      };
    } else {
      setTargetAyah(null);
      const startAt = opts?.fromAyah || continueFrom || focusFrom;
      setCurrentReciteAyah(startAt);
      setFocusAyah(startAt);
      if (opts?.fromAyah) setContinueFrom(opts.fromAyah);
      targetRef.current = {
        mode: "surah",
        ayah: null,
        fromAyah: startAt,
      };
    }

    setFinalReport(null);
    setSpeechError(null);
    setTranscript("");
    setLiveWords([]);
    setLiveStats(null);
    setAyahReview([]);
    setShowReview(false);
    setRevealedUpToAyah(0);
    setReciteMode(true);
    setRevealText(false);
    stopAudio();
    // Stop any prior optional recorder first — never compete with SpeechRecognition for mic
    stopMicRecording();

    const mobile = isMobileSpeechEnvironment();
    // Desktop only: optional MediaRecorder for playback review.
    // Mobile: dual getUserMedia + SpeechRecognition causes green-mic flicker + freezes.
    if (!mobile) {
      void startMicRecording();
    }

    // Prime permission from this user gesture (critical on mobile)
    const perm = await requestMicrophonePermission();
    if (!perm.ok) {
      setSpeechError(perm.error || "تعذّر تفعيل الميكروفون");
      setReciteMode(false);
      setReciting(false);
      return;
    }

    if (!speechRef.current) speechRef.current = new ArabicSpeechSession();
    const started = speechRef.current.start(
      {
        onInterim: (t) => applyLiveTranscript(t, true),
        onFinal: (t) => applyLiveTranscript(t, false),
        onError: (msg) => {
          setSpeechError(msg);
          // Soft errors keep UI open; fatal messages still stop "listening" badge
          if (
            /ميكروفون|غير مسموح|غير مدعوم|اسمح|لا يوجد/.test(msg)
          ) {
            setReciting(false);
          }
        },
        onEnd: () => {
          setReciting(false);
        },
      },
      { primeMic: false }
    );
    if (!started.ok) {
      setSpeechError(started.error || "تعذّر بدء الميكروفون");
      setReciteMode(false);
      stopMicRecording();
      setReciting(false);
      return;
    }
    setReciting(true);
  }
  startReciteRef.current = startRecite;

  function stopRecite() {
    const finalText = speechRef.current?.stop() || transcript;
    setReciting(false);
    stopMicRecording();
    const result = matchLive(
      buildLiveWordStream(getReciteAyahsList()),
      finalText,
      { interim: false }
    );
    setLiveWords(result.display);
    setLiveStats(result.stats);
    setTranscript(finalText);
    setRevealedUpToAyah(result.revealedUpToAyah);
    setLastCompletedAyah(result.lastCompletedAyah);
    setCurrentReciteAyah(result.currentAyah);

    for (const w of result.display) {
      if (w.status === "missing") {
        recordMistake({
          surahNumber,
          ayahNumber: w.ayahNumber,
          type: "MISSING_WORD",
          difficulty: 3,
          note: w.note || "تخطّي: " + w.text,
          revisionMemoryId: memoryId,
          autoReplan: false,
        });
      }
      if (w.status === "incorrect") {
        recordMistake({
          surahNumber,
          ayahNumber: w.ayahNumber,
          type: "WRONG_WORD",
          difficulty: 4,
          note: w.note || "خطأ في " + w.text,
          revisionMemoryId: memoryId,
          autoReplan: false,
        });
      }
    }

    const review = buildAyahReview(result.display);
    setAyahReview(review);
    setShowReview(true);

    const nextFrom =
      result.lastCompletedAyah > 0
        ? Math.min(focusTo, result.lastCompletedAyah + 1)
        : continueFrom;
    setContinueFrom(Math.max(focusFrom, nextFrom));
    saveSurahRecitationProgress({
      surahNumber,
      lastCompletedAyah: result.lastCompletedAyah,
      continueFromAyah: Math.max(focusFrom, nextFrom),
      totalAyahs: focusTo, // scoped wird end, not full surah
      lastSessionAt: new Date().toISOString(),
      accuracy: result.stats.accuracy,
      mistakesCount: result.stats.missing + result.stats.incorrect,
    });

    const report = finalFeedbackAr(
      result.stats,
      result.lastCompletedAyah,
      focusTo
    );
    setFinalReport(report);
    // Build structured error cards for UI (expected vs heard)
    const errs = result.display
      .filter((w) => w.status === "incorrect" || w.status === "missing")
      .map((w) => ({
        expected: w.text,
        heard:
          w.status === "missing"
            ? "—"
            : (w.note?.match(/سمعت «([^»]+)»/)?.[1] ?? "…"),
        surahNumber,
        ayahNumber: w.ayahNumber,
        kind: w.status as "incorrect" | "missing",
      }));
    setErrorCards(errs);
  }

  function exitReciteMode() {
    if (reciting) stopRecite();
    else {
      speechRef.current?.stop();
      stopMicRecording();
      setReciting(false);
    }
    setReciteMode(false);
    setRevealText(false);
  }

  function finishSession(outcome: "success" | "fail" = "success") {
    if (reciting) stopRecite();
    stopAudio();
    completeSession({
      sessionKind: mode === "memorize" ? "new_hifz" : "revision",
      planItemId: stepId,
      revisionMemoryId: memoryId,
      outcome,
      quality: outcome === "success" ? 4 : 1,
      surahNumber,
      fromAyah: focusFrom,
      toAyah: focusTo,
      autoReplan: true,
    });
    // Scoped daily test — only this wird range
    if (outcome === "success") {
      router.push(
        `/session/quiz?step=${encodeURIComponent(stepId)}_quiz&surah=${surahNumber}&from=${focusFrom}&to=${focusTo}&after=journey`
      );
    } else {
      router.push("/plans/journey");
    }
  }

  // Must stay before any early return (rules-of-hooks)
  const wordsByAyah = useMemo(() => {
    const map: Record<number, LiveDisplayWord[]> = {};
    for (const w of liveWords) {
      if (!map[w.ayahNumber]) map[w.ayahNumber] = [];
      map[w.ayahNumber].push(w);
    }
    return map;
  }, [liveWords]);

  if (!surah || !ayahs.length) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center space-y-3">
        <p className="font-semibold">تعذّر فتح جلسة المراجعة</p>
        <p className="text-sm text-muted-foreground">
          تأكد من تحديد محفوظك في الإعداد، ثم افتح رحلة اليوم.
        </p>
        <Link href="/plans/journey" className="text-primary text-sm underline">
          رحلة اليوم
        </Link>
      </div>
    );
  }

  const speechOk = isSpeechRecognitionSupported();
  const progressThrough =
    liveStats && liveStats.total
      ? Math.round(
          ((liveStats.matched + liveStats.missing + liveStats.incorrect) /
            liveStats.total) *
            100
        )
      : Math.round((playIndex / Math.max(1, ayahs.length)) * 100);

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl min-w-0 space-y-4 pb-36 sm:pb-32">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/40 py-3 -mx-1 px-1">
        <div>
          <div className="mb-2">
            <BackButton
              href={mode === "memorize" ? "/plans/new" : "/plans/revision"}
              label="خروج"
            />
          </div>
          <Badge variant="success" className="mb-1">
            {mode === "memorize" ? "حفظ جديد" : "مراجعة"} · ورد محدود النطاق
          </Badge>
          <h1 className="text-2xl font-bold">سورة {surah.nameAr}</h1>
          <p className="text-sm text-muted-foreground">
            ورد اليوم: الآيات {formatArabicNumber(focusFrom)}–
            {formatArabicNumber(focusTo)} فقط
            <span className="text-muted-foreground/70">
              {" "}
              · ({formatArabicNumber(ayahs.length)} آية معروضة)
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="h-9 rounded-lg border bg-background px-2 text-xs"
            value={qariId}
            onChange={(e) => {
              stopAudio();
              setQariId(e.target.value);
            }}
          >
            {availableQaris.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nameAr}
              </option>
            ))}
          </select>
          <Link
            href="/plans/journey"
            className="text-xs text-muted-foreground hover:text-primary"
          >
            رحلة اليوم
          </Link>
        </div>
      </div>

      <Progress value={progressThrough} className="h-2" />

      {/* Transport — wraps on narrow screens, larger touch targets */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-11 w-11 shrink-0 touch-manipulation sm:h-9 sm:w-9"
            disabled={playIndex <= 0}
            onClick={() => playAyahAt(Math.max(0, playIndex - 1))}
            aria-label="الآية السابقة"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={playing ? "outline" : "premium"}
            className="h-11 gap-1 touch-manipulation sm:h-9"
            onClick={() => {
              if (playing) stopAudio();
              else playAyahAt(playIndex);
            }}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? "إيقاف" : "آية"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={listenRepeat ? "premium" : "outline"}
            className="h-11 flex-1 min-w-[9rem] gap-1 touch-manipulation sm:h-9 sm:flex-none"
            onClick={() => {
              // Listen & Repeat: play scoped wird then open mic for shadowing
              setListenRepeat(true);
              playAllRef.current = true;
              setPlayAll(true);
              setLoopAyah(false);
              playAyahAt(0);
            }}
          >
            <Repeat className="h-4 w-4 shrink-0" />
            <span className="truncate">اقرأ وخلف الشيخ</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={playIndex >= ayahs.length - 1}
            onClick={() =>
              playAyahAt(Math.min(ayahs.length - 1, playIndex + 1))
            }
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={playAll ? "default" : "outline"}
            className="gap-1"
            onClick={() => {
              setListenRepeat(false);
              playAllRef.current = true;
              setPlayAll(true);
              setLoopAyah(false);
              playAyahAt(0);
            }}
          >
            <Volume2 className="h-4 w-4" />
            تشغيل الورد
          </Button>
          <Button
            type="button"
            size="sm"
            variant={loopAyah ? "default" : "outline"}
            className="gap-1"
            onClick={() => setLoopAyah((v) => !v)}
          >
            <Repeat className="h-4 w-4" />
            تكرار الآية
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              toggleAyahBookmark(surahNumber, focusAyah);
              setBookmarked(isAyahBookmarked(surahNumber, focusAyah));
            }}
          >
            {bookmarked ? (
              <BookmarkCheck className="h-4 w-4 text-primary" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
            إشارة
          </Button>
          <span className="text-[11px] text-muted-foreground ms-auto">
            تشغيل: آية{" "}
            {formatArabicNumber(ayahs[playIndex]?.ayahNumber ?? focusFrom)}
          </span>
        </CardContent>
      </Card>

      {/* Immersive recitation entry / controls */}
      {!reciteMode ? (
        <Card className="border-2 border-primary/30 overflow-hidden">
          <CardHeader className="bg-gradient-to-l from-[#D4AF37]/10 to-transparent py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4" />
              وضع التلاوة (اختبار الحفظ)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong>وضعان منفصلان:</strong> (1) اختبار السورة غيباً — لا يُعرض
              أي كلمة قبل أن تنطقها. (2) «تلُ هذه الآية» تحت كل آية — اختبار آية
              واحدة فقط. المدّ لا يفصل الكلمة.
            </p>
            {continueFrom > focusFrom && continueFrom <= focusTo && (
              <p className="text-xs rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-3 py-2">
                توقّفت سابقاً عند الآية{" "}
                {formatArabicNumber(Math.max(focusFrom, continueFrom - 1))} ·
                المتبقي ضمن الورد: {formatArabicNumber(continueFrom)}–
                {formatArabicNumber(focusTo)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="premium"
                className="gap-2"
                disabled={!speechOk}
                onClick={() =>
                  startRecite({ mode: "surah", fromAyah: continueFrom })
                }
              >
                <Mic className="h-4 w-4" />
                {continueFrom > focusFrom
                  ? "تسميع الورد · متابعة من " + continueFrom
                  : "تسميع ورد اليوم"}
              </Button>
              {continueFrom > focusFrom && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!speechOk}
                  onClick={() =>
                    startRecite({ mode: "surah", fromAyah: focusFrom })
                  }
                >
                  إعادة الورد من البداية
                </Button>
              )}
            </div>
            {!speechOk && (
              <p className="text-xs text-[#D4AF37] dark:text-[#D4AF37]">
                يحتاج Chrome أو Edge مع إذن الميكروفون.
              </p>
            )}
            {finalReport && (
              <div className="rounded-xl bg-[#D4AF37]/10 p-3 text-sm whitespace-pre-line">
                {finalReport}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-[#D4AF37]/30 bg-gradient-to-b from-[#D4AF37]/5 to-transparent sticky top-14 z-20">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  {reciting && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4AF37]/80 opacity-60" />
                  )}
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#D4AF37]" />
                </span>
                <p className="font-semibold text-sm">
                  {voiceMode === "ayah"
                    ? "اختبار آية " + formatArabicNumber(targetAyah || 0)
                    : "تسميع الورد"}{" "}
                  · {surah.nameAr} {formatArabicNumber(focusFrom)}–
                  {formatArabicNumber(focusTo)}
                </p>
                {reciting && (
                  <Badge variant="danger" className="text-[10px]">
                    يستمع
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setRevealText((v) => !v)}
                >
                  {revealText ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {revealText ? "إخفاء النص الكامل" : "إظهار النص (مساعدة)"}
                </Button>
                {reciting ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 border-[#D4AF37] text-[#D4AF37]"
                    onClick={stopRecite}
                  >
                    <MicOff className="h-3.5 w-3.5" />
                    إنهاء التلاوة
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="premium"
                    className="gap-1"
                    onClick={() =>
                      startRecite({ mode: voiceMode, fromAyah: continueFrom, ayah: targetAyah || undefined })
                    }
                  >
                    <Mic className="h-3.5 w-3.5" />
                    استئناف
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={exitReciteMode}>
                  خروج من الوضع
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                ظهرت حتى الآية:{" "}
                <strong className="text-foreground">
                  {revealedUpToAyah
                    ? formatArabicNumber(revealedUpToAyah)
                    : "—"}
                </strong>
              </span>
              <span>
                آخر آية مكتملة:{" "}
                <strong className="text-foreground">
                  {lastCompletedAyah
                    ? formatArabicNumber(lastCompletedAyah)
                    : "—"}
                </strong>
              </span>
              <span>
                الحالية:{" "}
                <strong className="text-foreground">
                  {currentReciteAyah
                    ? formatArabicNumber(currentReciteAyah)
                    : "—"}
                </strong>
              </span>
            </div>
            {liveStats?.lastMessage && (
              <div className="rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/25 px-3 py-2 text-sm text-[#D4AF37] dark:text-[#f0d78c]">
                {liveStats.lastMessage}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              المدّ والتنفس لا يقطعان الكلمة — الحكم بعد اكتمال اللفظ فقط.
            </p>
            {speechError && (
              <p className="text-xs text-[#D4AF37]">{speechError}</p>
            )}
            {finalReport && !reciting && (
              <div className="rounded-xl bg-[#D4AF37]/10 p-3 text-sm whitespace-pre-line">
                {finalReport}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mushaf / progressive reveal */}
      <div
        className={cn(
          "space-y-4 rounded-2xl border bg-card/50 p-4 md:p-6 min-h-[200px]",
          hideText && !reciteMode && "select-none"
        )}
      >
        {!reciteMode && (
          <p className="text-center text-sm text-muted-foreground font-medium">
            بسم الله الرحمن الرحيم
          </p>
        )}

        {reciteMode && !revealText && liveWords.filter((w) => w.revealed).length === 0 && (
          <div className="py-16 text-center space-y-3">
            <p className="text-4xl">🎙️</p>
            <p className="font-semibold">ابدأ التلاوة كلمةً كلمة</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              لن يظهر أي نص حتى تنطق. كل كلمة تظهر فقط بعد أن تقولها — كالمعلم
              يسمع غيبك.
            </p>
          </div>
        )}

        {/* Word-level stream in recitation mode (not full ayah dump) */}
        {reciteMode && !revealText && liveWords.some((w) => w.revealed) && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <p className="text-center text-xs text-muted-foreground mb-4">
              ما نطقتَه · الآية{" "}
              {formatArabicNumber(currentReciteAyah || revealedUpToAyah || 1)}
            </p>
            <p
              className="font-quran text-2xl md:text-3xl leading-[2.3] text-center"
              dir="rtl"
            >
              {liveWords
                .filter((w) => w.revealed)
                .map((w) => (
                  <span key={w.globalIndex}>
                    <span
                      title={w.note}
                      className={cn(
                        "inline-block mx-0.5 rounded px-0.5",
                        w.status === "correct" &&
                          "bg-emerald-500/20 text-emerald-950 dark:text-emerald-100",
                        w.status === "missing" &&
                          "bg-amber-400/25 text-amber-950 dark:text-amber-50 underline decoration-wavy decoration-amber-600",
                        w.status === "incorrect" &&
                          "bg-red-500/40 text-red-950 dark:text-red-50 underline decoration-wavy decoration-red-600 font-semibold",
                        w.status === "current" &&
                          "bg-[#D4AF37]/25 ring-1 ring-[#D4AF37]",
                        w.status === "partial" &&
                          "bg-[#D4AF37]/15 ring-1 ring-[#D4AF37]/50"
                      )}
                    >
                      {w.text}
                    </span>
                    {/* ayah break marker */}
                    {liveWords[w.globalIndex + 1] &&
                      liveWords[w.globalIndex + 1].revealed &&
                      liveWords[w.globalIndex + 1].ayahNumber !==
                        w.ayahNumber && (
                        <span className="text-primary text-sm mx-1">
                          ﴿{formatArabicNumber(w.ayahNumber)}﴾
                        </span>
                      )}
                  </span>
                ))}
              {currentReciteAyah > 0 && (
                <span className="text-primary text-sm ms-1">
                  ﴿{formatArabicNumber(currentReciteAyah)}﴾
                </span>
              )}
            </p>
          </div>
        )}

        {/* Strict range only — no full-surah scroll */}
        {(!reciteMode || revealText) &&
          ayahs.map((a, idx) => {
            const isPlaying = playIndex === idx && playing;
            const meaning = meanings[a.ayahNumber];
            const expanded = expandedMeaning[a.ayahNumber];
            const live = wordsByAyah[a.ayahNumber];
            const isCurrentRecite = currentReciteAyah === a.ayahNumber;

            return (
              <div
                key={a.ayahNumber}
                id={"ayah-" + a.ayahNumber}
                className={cn(
                  "rounded-2xl border p-4 transition-all",
                  isPlaying && "border-primary bg-primary/5",
                  isCurrentRecite &&
                    reciteMode &&
                    "ring-2 ring-primary/40 bg-primary/5",
                  "border-border",
                  focusAyah === a.ayahNumber &&
                    !reciteMode &&
                    "ring-1 ring-primary/30"
                )}
                onClick={() => setFocusAyah(a.ayahNumber)}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge
                    variant={
                      lastCompletedAyah >= a.ayahNumber
                        ? "success"
                        : isCurrentRecite
                          ? "warning"
                          : "muted"
                    }
                    className="text-[10px]"
                  >
                    ﴿{formatArabicNumber(a.ayahNumber)}﴾
                    {lastCompletedAyah >= a.ayahNumber ? " ✓" : ""}
                  </Badge>
                </div>
                {!reciteMode && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="inline-flex h-12 sm:h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-3 text-sm font-bold text-white shadow-md shadow-[#D4AF37]/25 hover:bg-[#D4AF37] active:scale-[0.98] touch-manipulation"
                      onClick={(e) => {
                        e.stopPropagation();
                        playAyahAt(idx);
                      }}
                    >
                      <Volume2 className="h-5 w-5 shrink-0" />
                      استمع للآية
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-12 sm:h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-3 text-sm font-bold text-white shadow-md shadow-[#D4AF37]/30 hover:bg-[#D4AF37] active:scale-[0.98] disabled:opacity-50 touch-manipulation"
                      disabled={!speechOk}
                      onClick={(e) => {
                        e.stopPropagation();
                        startRecite({ mode: "ayah", ayah: a.ayahNumber });
                      }}
                    >
                      <Mic className="h-5 w-5 shrink-0" />
                      اتلُ الآية الآن
                    </button>
                  </div>
                )}

                <p
                  className="font-quran text-xl md:text-2xl leading-[2.15] text-center"
                  dir="rtl"
                >
                  {live && live.length
                    ? live.map((w) => (
                        <span
                          key={w.globalIndex}
                          title={w.note}
                          className={cn(
                            "inline-block mx-0.5 rounded px-0.5 transition-colors",
                            w.status === "correct" &&
                              "bg-emerald-500/20 text-emerald-950 dark:text-emerald-100",
                            w.status === "missing" &&
                              "bg-amber-400/25 underline decoration-wavy decoration-amber-600",
                            w.status === "incorrect" &&
                              "bg-red-500/35 text-red-950 dark:text-red-50 underline decoration-wavy decoration-red-600 font-semibold",
                            w.status === "current" && "bg-[#D4AF37]/25 ring-1 ring-[#D4AF37]/40",
                            w.status === "partial" && "bg-[#D4AF37]/15",
                            (w.status === "pending" || w.status === "hidden") &&
                              "text-foreground"
                          )}
                        >
                          {w.text}
                        </span>
                      ))
                    : a.text}
                  <span className="text-primary text-sm ms-1">
                    ﴿{formatArabicNumber(a.ayahNumber)}﴾
                  </span>
                </p>

                {meaning && (
                  <div className="mt-3 border-t border-border/50 pt-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {expanded
                        ? meaning
                        : meaning.slice(0, 140) +
                          (meaning.length > 140 ? "…" : "")}
                    </p>
                    {meaning.length > 140 && (
                      <button
                        type="button"
                        className="mt-1 text-[11px] text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedMeaning((m) => ({
                            ...m,
                            [a.ayahNumber]: !m[a.ayahNumber],
                          }));
                        }}
                      >
                        {expanded ? "أقل" : "المزيد"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Post-recitation error analysis (scoped to wird) */}
      {errorCards.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="py-3">
            <CardTitle className="text-base">تحليل الأخطاء</CardTitle>
            <p className="text-xs text-muted-foreground">
              ضمن نطاق الورد فقط ({formatArabicNumber(focusFrom)}–
              {formatArabicNumber(focusTo)}) · {liveStats?.total ?? 0} كلمة
              متوقعة
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {errorCards.slice(0, 12).map((e, i) => (
              <div
                key={i}
                className="rounded-xl border border-red-500/20 bg-background/80 px-3 py-2 text-sm space-y-0.5"
              >
                <p>
                  <span className="text-muted-foreground">المتوقع: </span>
                  <span className="font-quran font-semibold text-emerald-700 dark:text-emerald-300">
                    {e.expected}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">ما سُمع: </span>
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    {e.heard}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {surah?.nameAr} · آية {formatArabicNumber(e.ayahNumber)} ·{" "}
                  {e.kind === "missing" ? "ناقصة" : "خطأ نطق"}
                </p>
              </div>
            ))}
            {liveStats && (
              <p className="text-xs text-muted-foreground pt-1">
                الدقة: {formatArabicNumber(Math.round(liveStats.accuracy * 100))}
                ٪ · صحيح {formatArabicNumber(liveStats.matched)} · خطأ{" "}
                {formatArabicNumber(liveStats.incorrect)} · ناقص{" "}
                {formatArabicNumber(liveStats.missing)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Playback review timeline */}
      {showReview && ayahReview.length > 0 && (
        <Card className="border-primary/25">
          <CardHeader className="py-3">
            <CardTitle className="text-base">مراجعة التلاوة</CardTitle>
            <p className="text-xs text-muted-foreground">
              أخضر = صحيح · أصفر = تردد · أحمر = خطأ · اضغط آية للتدريب مع
              الشيخ
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {userRecordingUrl && (
              <div className="rounded-xl border p-3 space-y-1">
                <p className="text-xs font-medium">تسجيل تلاوتك</p>
                <audio controls src={userRecordingUrl} className="w-full h-10" />
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {ayahReview.map((item) => (
                <button
                  key={item.ayahNumber}
                  type="button"
                  onClick={() => {
                    setFocusAyah(item.ayahNumber);
                    const i = ayahIndex(item.ayahNumber);
                    if (i >= 0) playAyahAt(i);
                  }}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium border",
                    item.status === "correct" &&
                      "bg-emerald-500/15 border-emerald-500/40 text-emerald-900 dark:text-emerald-100",
                    item.status === "hesitation" &&
                      "bg-amber-400/20 border-amber-500/40",
                    item.status === "mistake" &&
                      "bg-red-500/20 border-red-500/40 text-red-900 dark:text-red-100 font-semibold",
                    item.status === "pending" && "bg-muted"
                  )}
                  title={
                    item.missing.length
                      ? "ناقص: " + item.missing.join(" ")
                      : item.incorrect.length
                        ? "خطأ: " + item.incorrect.join(" ")
                        : item.status
                  }
                >
                  {formatArabicNumber(item.ayahNumber)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {continueFrom <= focusTo && (
                <Button
                  type="button"
                  size="sm"
                  variant="premium"
                  onClick={() =>
                    startRecite({ mode: "surah", fromAyah: continueFrom })
                  }
                >
                  متابعة من آية {formatArabicNumber(continueFrom)}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  startRecite({ mode: "surah", fromAyah: focusFrom })
                }
              >
                إعادة الورد
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  saveSurahRecitationProgress({
                    surahNumber,
                    lastCompletedAyah,
                    continueFromAyah: continueFrom,
                    totalAyahs: focusTo,
                    lastSessionAt: new Date().toISOString(),
                    accuracy: liveStats?.accuracy,
                  });
                }}
              >
                حفظ التقدّم
              </Button>
            </div>
            {lastCompletedAyah > 0 && (
              <p className="text-xs text-muted-foreground">
                أكملت الآية {formatArabicNumber(lastCompletedAyah)}. المتبقي:{" "}
                {continueFrom <= focusTo
                  ? formatArabicNumber(continueFrom) +
                    "–" +
                    formatArabicNumber(focusTo)
                  : "لا شيء"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes for focus ayah */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            ملاحظات — آية {formatArabicNumber(focusAyah)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            className="w-full min-h-[70px] rounded-xl border bg-background p-2 text-sm"
            placeholder="اكتب ملاحظة على الآية المحددة..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!noteText.trim()) return;
              saveNote({
                content: noteText.trim(),
                surahNumber,
                ayahNumber: focusAyah,
                tag: mode === "memorize" ? "حفظ" : "مراجعة",
              });
              setNotes(
                notesForAyah(surahNumber, focusAyah).map((n) => ({
                  id: n.id,
                  content: n.content,
                }))
              );
              setNoteText("");
            }}
          >
            حفظ الملاحظة
          </Button>
          {notes.map((n) => (
            <p key={n.id} className="text-xs text-muted-foreground">
              • {n.content}
            </p>
          ))}
        </CardContent>
      </Card>

      {/* Surah-focused guide — no open chatbot */}
      <SurahGuide
        surahNumber={surahNumber}
        focusAyah={focusAyah}
        meanings={meanings}
      />

      {/* Finish — sticky, touch-friendly, safe-area aware */}
      <div
        className="fixed bottom-0 inset-x-0 z-30 border-t border-[#D4AF37]/15 bg-background/95 backdrop-blur-xl p-3 sm:p-3"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto max-w-6xl xl:max-w-7xl flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-2 sm:justify-between sm:items-center">
          <p className="hidden sm:block text-xs text-muted-foreground">
            {reciting
              ? "التلاوة جارية — الأخطاء تُظلل مباشرة"
              : "كل أدوات المراجعة في هذه الصفحة"}
          </p>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              className="h-12 sm:h-10 gap-2 border-[#D4AF37]/30 touch-manipulation text-sm"
              onClick={() => finishSession("fail")}
            >
              صعب لاحقاً
            </Button>
            <Button
              type="button"
              variant="premium"
              className="h-12 sm:h-10 gap-2 touch-manipulation text-sm font-bold"
              onClick={() => finishSession("success")}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              أتممت بنجاح
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
