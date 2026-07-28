"use client";

import Link from "next/link";
import { Sprout, Headphones, BookOpen } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { useOrchestratedPlan } from "@/hooks/use-orchestrated-plan";
import { summarizeMemorization } from "@/lib/user-profile";
import { FadeIn } from "@/components/motion/fade-in";
import { formatArabicNumber } from "@/lib/utils";
import { PageHeader } from "@/components/layout/back-button";
import { getSurah } from "@/lib/quran";
import type { PlanItem } from "@/application";

/**
 * ورد الحفظ الجديد
 * Reads today's NEW_HIFZ item from the orchestration layer.
 * No longer calls buildDailyJourney / getNextMemorizationTarget from daily-plans.ts.
 */
export default function NewHifzPlanPage() {
  const { profile, ready: profileReady } = useHafizProfile();
  const { ready: planReady, today, view, error } = useOrchestratedPlan();

  const ready = profileReady && planReady;

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-60 w-full" />
        <p className="text-center text-xs text-muted-foreground">
          جاري بناء ورد الحفظ من محرّك حافظ…
        </p>
      </div>
    );
  }

  // Pull the first NEW_HIFZ item the brain produced for today
  const todayItems: PlanItem[] = today?.today?.items ?? [];
  const hifzItem = todayItems.find((i) => i.type === "NEW_HIFZ") ?? null;

  const pagesPerDay = profile.pagesPerDay || 1;
  const hifzEnabled = view?.hifzEnabled ?? true;

  // Resolve display values from the orchestrated item
  const surahNumber = hifzItem?.surah ?? hifzItem?.sourceRange?.surah ?? 1;
  const fromAyah = hifzItem?.sourceRange?.fromAyah ?? 1;
  const toAyah = hifzItem?.sourceRange?.toAyah ?? fromAyah;
  const labelAr = hifzItem?.labelAr ?? null;
  const estimatedMinutes = hifzItem?.estimatedMinutes ?? Math.round(pagesPerDay * 12);

  const surahMeta = getSurah(surahNumber);
  const surahName = surahMeta?.nameAr ?? `سورة ${surahNumber}`;

  const sessionHref =
    "/session/revision?step=" +
    encodeURIComponent(hifzItem?.id ?? "new_hifz") +
    "&mode=memorize&surah=" +
    surahNumber +
    "&from=" +
    fromAyah +
    "&to=" +
    toAyah +
    (hifzItem?.revisionMemoryId
      ? "&memoryId=" + encodeURIComponent(hifzItem.revisionMemoryId)
      : "");

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <PageHeader
          title={
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sprout className="h-6 w-6 text-[#D4AF37]" />
              ورد الحفظ الجديد
            </h1>
          }
          description={
            <>
              بعد محفوظك ({summarizeMemorization(profile.memorizationSelection)})
              · {formatArabicNumber(pagesPerDay)} صفحة تقريباً في اليوم
            </>
          }
          backHref="/plans/journey"
          actions={
            <Badge variant="success">
              ~{formatArabicNumber(estimatedMinutes)} د
            </Badge>
          }
        />
      </FadeIn>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {!hifzEnabled || !hifzItem ? (
        /* Hifz disabled by the brain (e.g. weak memorization lock) */
        <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#D4AF37]/5 to-transparent">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-2xl">📚</p>
            <h2 className="text-lg font-semibold">
              {view?.revisionOnly
                ? "الحفظ الجديد متوقّف مؤقتاً"
                : "لا يوجد ورد حفظ جديد اليوم"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              {view?.coachingMessage ||
                "محرّك حافظ قرر تخصيص طاقة اليوم للتثبيت. راجع ورد المراجعة أولاً."}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Link
                href="/plans/revision"
                className="inline-flex h-10 items-center rounded-xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-5 text-sm font-medium text-white"
              >
                ورد المراجعة
              </Link>
              <Link
                href="/plans/journey"
                className="inline-flex h-10 items-center rounded-xl border px-5 text-sm font-medium hover:bg-accent"
              >
                رحلة اليوم
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Hifz item produced by the brain */
        <Card className="border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/10 to-transparent">
          <CardHeader>
            <CardTitle className="text-base">مقطع اليوم المقترح</CardTitle>
            <CardDescription>
              {labelAr
                ? labelAr
                : "يبدأ الحفظ مباشرة في جلسة السورة — دون تبويب وسيط"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 text-center">
              <p className="text-sm text-muted-foreground">السورة</p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {surahName}
              </p>
              <p className="mt-2 text-lg">
                الآيات {formatArabicNumber(fromAyah)}–
                {formatArabicNumber(toAyah)}
              </p>
              {hifzItem.sourceRange?.pagesApprox != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ~{hifzItem.sourceRange.pagesApprox.toFixed(1)} صفحة
                </p>
              )}
            </div>

            <Link
              href={sessionHref}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] text-sm font-medium text-white"
            >
              ابدأ الحفظ الجديد
            </Link>

            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href={
                  "/listen-memorize?surah=" +
                  surahNumber +
                  "&from=" +
                  fromAyah +
                  "&to=" +
                  toAyah
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border hover:bg-accent text-sm font-medium"
              >
                <Headphones className="h-4 w-4" />
                الحفظ بالاستماع
              </Link>
              <Link
                href={"/quran?surah=" + surahNumber}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border hover:bg-accent text-sm font-medium"
              >
                <BookOpen className="h-4 w-4" />
                افتح في المصحف
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Link
        href="/plans/journey"
        className="block text-center text-xs text-muted-foreground hover:text-primary"
      >
        العودة لرحلة اليوم
      </Link>
    </div>
  );
}
