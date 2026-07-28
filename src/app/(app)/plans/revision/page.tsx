"use client";

import Link from "next/link";
import { BookOpen, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrchestratedPlan } from "@/hooks/use-orchestrated-plan";
import { FadeIn } from "@/components/motion/fade-in";
import { formatArabicNumber } from "@/lib/utils";
import { useState } from "react";
import { PageHeader } from "@/components/layout/back-button";
import type { PlanItem } from "@/application";

/**
 * ورد المراجعة
 * Reads today's NEAR_REVISION + FAR_REVISION items from the orchestration layer.
 * No longer calls buildDailyJourney from daily-plans.ts.
 */
export default function RevisionPlanPage() {
  const { ready, today, view, error } = useOrchestratedPlan();
  const [done, setDone] = useState<Record<string, boolean>>({});

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-60 w-full" />
        <p className="text-center text-xs text-muted-foreground">
          جاري بناء ورد المراجعة من محرّك حافظ…
        </p>
      </div>
    );
  }

  // Pull revision items (near + far) from today's orchestrated plan
  const todayItems: PlanItem[] = today?.today?.items ?? [];
  const revisionItems = todayItems.filter(
    (i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION"
  );

  // Total estimated minutes across all revision items
  const totalMinutes = revisionItems.reduce(
    (s, i) => s + (i.estimatedMinutes ?? 0),
    0
  );

  const completed = Object.values(done).filter(Boolean).length;

  /** Build the session href for a revision item */
  function itemHref(item: PlanItem): string {
    const surah = item.surah ?? item.sourceRange?.surah;
    const from = item.sourceRange?.fromAyah ?? 1;
    const to = item.sourceRange?.toAyah ?? from;
    const mid = item.revisionMemoryId
      ? "&memoryId=" + encodeURIComponent(item.revisionMemoryId)
      : "";
    if (surah) {
      return (
        "/session/revision?step=" +
        encodeURIComponent(item.id) +
        "&surah=" +
        surah +
        "&from=" +
        from +
        "&to=" +
        to +
        mid
      );
    }
    return "/plans/journey";
  }

  /** Human-readable label for an item */
  function itemLabel(item: PlanItem): string {
    if (item.labelAr?.trim()) return item.labelAr;
    const sr = item.sourceRange;
    if (sr?.fromSurah && sr?.toSurah && sr.fromSurah !== sr.toSurah) {
      return `سور ${sr.fromSurah}–${sr.toSurah}`;
    }
    if (sr?.surah || item.surah) {
      const s = sr?.surah ?? item.surah;
      if (sr?.fromAyah && sr?.toAyah) {
        return `سورة ${s} · ${sr.fromAyah}–${sr.toAyah}`;
      }
      return `سورة ${s}`;
    }
    return "المراجعة";
  }

  /** Reason hint for an item */
  function itemReason(item: PlanItem): string | null {
    if (item.priorityReasons && item.priorityReasons.length > 0) {
      return item.priorityReasons[0];
    }
    return item.type === "NEAR_REVISION" ? "مراجعة قريبة — تثبيت محفوظ أمس" : null;
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <PageHeader
          title={
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              ورد المراجعة
            </h1>
          }
          description={
            <>
              من محفوظك فقط · قوة الحفظ · تدوير يومي · جزء من{" "}
              <Link
                href="/plans/journey"
                className="text-primary underline-offset-2 hover:underline"
              >
                رحلة اليوم
              </Link>
            </>
          }
          backHref="/plans/journey"
          actions={
            totalMinutes > 0 ? (
              <Badge variant="warning">
                ~{formatArabicNumber(totalMinutes)} د
              </Badge>
            ) : null
          }
        />
      </FadeIn>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <Card className="border-[#D4AF37]/25 bg-gradient-to-br from-[#D4AF37]/10 to-transparent">
        <CardHeader>
          <CardTitle className="text-base">مراجعة اليوم</CardTitle>
          <CardDescription>
            {revisionItems.length > 0
              ? `${formatArabicNumber(completed)} / ${formatArabicNumber(revisionItems.length)} مكتمل`
              : view?.coachingMessage
                ? view.coachingMessage
                : "لا توجد مراجعات مجدولة اليوم"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {revisionItems.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                محرّك حافظ لم يُجدول مراجعات لليوم — تقدّم جيد!
              </p>
              <Link
                href="/plans/journey"
                className="mt-4 inline-flex h-10 items-center rounded-xl border px-5 text-sm hover:bg-accent"
              >
                رحلة اليوم
              </Link>
            </div>
          ) : (
            <>
              {revisionItems.map((item) => {
                const key = item.id;
                const label = itemLabel(item);
                const reason = itemReason(item);
                const href = itemHref(item);
                const isNear = item.type === "NEAR_REVISION";

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm">{label}</p>
                        {isNear && (
                          <Badge variant="success" className="text-[10px]">
                            قريبة
                          </Badge>
                        )}
                      </div>
                      {reason && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {reason}
                        </p>
                      )}
                      {item.estimatedMinutes > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          ~{formatArabicNumber(item.estimatedMinutes)} د
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {href !== "/plans/journey" && (
                        <Link
                          href={href}
                          className="inline-flex h-8 items-center rounded-lg bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-2 text-[11px] text-white"
                        >
                          ابدأ الجلسة
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDone((d) => ({ ...d, [key]: !d[key] }))
                        }
                        className={
                          "inline-flex h-8 items-center rounded-lg px-2 text-[11px] " +
                          (done[key]
                            ? "bg-[#D4AF37]/15 text-[#D4AF37]"
                            : "border hover:bg-accent")
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 me-1" />
                        {done[key] ? "تم" : "أنهِ"}
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2 pt-2">
                {revisionItems[0] && itemHref(revisionItems[0]) !== "/plans/journey" && (
                  <Link
                    href={itemHref(revisionItems[0])}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] text-sm font-medium text-white"
                  >
                    ابدأ جلسة المراجعة
                  </Link>
                )}
                <Link
                  href="/plans/journey"
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border text-sm font-medium hover:bg-accent"
                >
                  رحلة اليوم
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
