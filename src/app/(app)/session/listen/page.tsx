"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSurah, getSurahAyahs, ayahAudioUrl } from "@/lib/quran";
import { completeSession } from "@/application";
import { recordListen } from "@/lib/memorization-store";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { formatArabicNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/layout/back-button";
import {
  playGlobalAudio,
  stopGlobalAudio,
} from "@/lib/audio/global-audio";

export default function ListenSessionPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-2xl" />}>
      <ListenInner />
    </Suspense>
  );
}

function ListenInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile } = useHafizProfile();

  const stepId = params.get("step") || "listen";
  const surahNumber = Math.max(1, Math.min(114, Number(params.get("surah") || 1)));
  const fromAyah = Math.max(1, Number(params.get("from") || 1));
  const toAyah = Math.max(fromAyah, Number(params.get("to") || fromAyah + 5));

  const surah = getSurah(surahNumber);
  const assigned = useMemo(() => {
    return getSurahAyahs(surahNumber).filter(
      (a) => a.ayahNumber >= fromAyah && a.ayahNumber <= toAyah
    );
  }, [surahNumber, fromAyah, toAyah]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [listens, setListens] = useState(0);
  const qariId = profile.preferredQariId || "alafasy";
  const ayah = assigned[index];

  const playCurrent = useCallback(() => {
    if (!ayah) return;
    setPlaying(true);
    playGlobalAudio(ayahAudioUrl(qariId, ayah.surahNumber, ayah.ayahNumber), {
      onEnded: () => {
        setPlaying(false);
        recordListen(ayah.surahNumber, ayah.ayahNumber);
        setListens((n) => n + 1);
        if (autoPlay && index < assigned.length - 1) {
          setIndex((i) => i + 1);
        }
      },
      onError: () => setPlaying(false),
    });
  }, [ayah, qariId, autoPlay, index, assigned.length]);

  useEffect(() => {
    if (!ayah) return;
    playCurrent();
    return () => {
      stopGlobalAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- play when index changes
  }, [index, surahNumber]);

  function finish() {
    completeSession({
      sessionKind: "listening",
      planItemId: stepId,
      outcome: "success",
      quality: 4,
      surahNumber,
      fromAyah,
      toAyah,
      autoReplan: true,
    });
    router.push("/plans/journey");
  }

  if (!surah || !assigned.length) {
    return (
      <div className="p-8 text-center text-sm">
        لا يوجد نطاق استماع مُسند.{" "}
        <Link href="/plans/journey" className="text-primary underline">
          رحلة اليوم
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-4 pb-16">
      <div>
        <BackButton href="/listen-memorize" label="خروج" className="mb-2" />
        <Badge variant="success" className="mb-2">
          جلسة استماع
        </Badge>
        <h1 className="text-xl font-bold">
          {surah.nameAr} {formatArabicNumber(fromAyah)}–
          {formatArabicNumber(toAyah)}
        </h1>
        <p className="text-sm text-muted-foreground">
          النطاق المُسند من رحلة اليوم · استماعات هذه الجلسة:{" "}
          {formatArabicNumber(listens)}
        </p>
      </div>

      <Progress
        value={((index + 1) / assigned.length) * 100}
        className="h-2"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            ﴿{formatArabicNumber(ayah.ayahNumber)}﴾
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p
            className="font-quran text-center text-2xl md:text-3xl leading-[2.2]"
            dir="rtl"
          >
            {ayah.text}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={index <= 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="premium"
              onClick={() => {
                if (playing) {
                  stopGlobalAudio();
                  setPlaying(false);
                } else playCurrent();
              }}
              className="gap-2 min-w-[8rem]"
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {playing ? "إيقاف" : "تشغيل"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={index >= assigned.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
            />
            تشغيل تلقائي للآية التالية
          </label>
        </CardContent>
      </Card>

      <Button type="button" variant="premium" className="w-full gap-2" onClick={finish}>
        <CheckCircle2 className="h-4 w-4" />
        إنهاء الاستماع وإكمال الخطوة
      </Button>
    </div>
  );
}
