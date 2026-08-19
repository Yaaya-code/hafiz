"use client";

/**
 * Spike lab — acoustic tilawah similarity (MFCC + DTW).
 * No Whisper / No Web Speech. Mobile-first, short clips only.
 */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Square } from "lucide-react";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  compareUserToReference,
  startMicRecorder,
  type CompareResult,
  type MicRecorder,
} from "@/lib/audio-match";
import { ayahAudioUrl } from "@/lib/quran/audio";

type Phase = "idle" | "recording" | "comparing";

/** Spike reference: Al-Fatiha 1 — Husary murattal (public everyayah CDN). */
const REF_SURAH = 1;
const REF_AYAH = 1;
const REF_URL = ayahAudioUrl("husary", REF_SURAH, REF_AYAH);

export default function AudioLabPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      const rec = await startMicRecorder();
      recorderRef.current = rec;
      setPhase("recording");
      setElapsed(0);
      const t0 = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - t0) / 1000));
      }, 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }, []);

  const stopAndCompare = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    clearTimer();
    setPhase("comparing");
    setError(null);
    try {
      const userPcm = await rec.stop();
      recorderRef.current = null;
      if (userPcm.length < 8000) {
        setError("التسجيل قصير جداً. أعد المحاولة.");
        setPhase("idle");
        return;
      }
      const r = await compareUserToReference({
        userPcm,
        userSampleRate: rec.getSampleRate(),
        referenceUrl: REF_URL,
      });
      setResult(r);
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
      recorderRef.current = null;
    }
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-16">
      <BackButton href="/dashboard" />
      <div>
        <h1 className="text-xl font-bold">مختبر المطابقة الصوتية</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spike أولي: مقارنة صوتك بمرجع قصير (الفاتحة ١ · الحصري) عبر MFCC +
          DTW — بدون تحويل لنص وبدون Whisper/Web Speech.
        </p>
      </div>

      <Card className="border-[#D4AF37]/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">المرجع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            استمع للمرجع ثم سجّل نفس المقطع بصوتك (يفضّل ٣–٨ ثوانٍ على الموبايل).
          </p>
          <audio controls preload="none" src={REF_URL} className="w-full" />
        </CardContent>
      </Card>

      <Card className="border-[#D4AF37]/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تسجيل المقارنة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {phase !== "recording" ? (
              <Button
                type="button"
                variant="premium"
                className="h-12 flex-1 gap-2"
                disabled={phase === "comparing"}
                onClick={() => void startRecording()}
              >
                <Mic className="h-5 w-5" />
                {phase === "comparing" ? "جاري المقارنة…" : "ابدأ التسجيل"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 gap-2"
                onClick={() => void stopAndCompare()}
              >
                <Square className="h-5 w-5" />
                أوقف وقارن ({elapsed}ث)
              </Button>
            )}
          </div>

          {phase === "comparing" && (
            <p className="text-center text-xs text-[#D4AF37]">
              استخراج MFCC + DTW محلياً… أبقِ الصفحة مفتوحة.
            </p>
          )}

          {error && (
            <p className="text-center text-xs text-red-500 break-words">{error}</p>
          )}

          {result && (
            <div className="space-y-2 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3">
              <p className="text-center text-lg font-bold tabular-nums">
                {result.percent}٪
              </p>
              <p className="text-center text-sm font-semibold">
                الحكم: {result.verdict}
              </p>
              <Progress value={result.percent} className="h-2" />
              <p className="text-center text-[11px] text-muted-foreground">
                إطاراتك {result.userFrames} · المرجع {result.refFrames} · طول
                المسار {result.pathLength}
              </p>
              <p className="text-center text-[10px] text-muted-foreground break-words">
                مسافة DTW المطبّعة (أقل = أقرب):{" "}
                {Number.isFinite(result.normalizedCost)
                  ? result.normalizedCost.toFixed(3)
                  : "∞"}
              </p>
              <p className="text-center text-[10px] text-muted-foreground">
                بعد قص الصمت + CMVN + تطبيع طول المسار. العتبات للمعايرة
                الميدانية.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[10px] text-muted-foreground">
        مسار التسميع القديم قيد إعادة البناء على المطابقة الصوتية.{" "}
        <Link href="/session/direct" className="underline text-[#D4AF37]">
          التسميع المباشر (قديم)
        </Link>
      </p>
    </div>
  );
}
