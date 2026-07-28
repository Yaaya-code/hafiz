"use client";

/**
 * Planner — real multi-day plan from PlanningService (generateJourneyPlan).
 * UI → application only; no mock page stats.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatArabicNumber, cn } from "@/lib/utils";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  generateJourneyPlan,
  getLearningSnapshot,
  refreshLearningState,
  type JourneyPlanResult,
  type PlanItem,
} from "@/application";
import {
  computeMushafStatusCounts,
  type MushafStatusCounts,
} from "@/lib/dashboard-local-stats";

const HORIZONS = [7, 15, 30, 60, 90];

const styleLabel: Record<string, string> = {
  intensive: "مكثّف",
  balanced: "متوازن",
  light: "خفيف",
};

function itemTypeAr(type: PlanItem["type"]): string {
  if (type === "NEW_HIFZ") return "حفظ";
  if (type === "NEAR_REVISION") return "مراجعة قريبة";
  if (type === "FAR_REVISION") return "مراجعة بعيدة";
  if (type === "LISTENING") return "استماع";
  if (type === "QUIZ") return "اختبار";
  return type;
}

export default function PlannerPage() {
  const { profile, ready: profileReady } = useHafizProfile();
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneyPlanResult | null>(null);
  const [status, setStatus] = useState<MushafStatusCounts>({
    mastered: 0,
    good: 0,
    needsReview: 0,
    weak: 0,
    notMemorized: 0,
  });
  const [activated, setActivated] = useState(false);

  const load = useCallback(
    (horizon: number, force = false) => {
      setLoading(true);
      setError(null);
      try {
        const result = generateJourneyPlan({ days: horizon, force });
        setJourney(result);
        let snap = null;
        try {
          snap = getLearningSnapshot();
        } catch {
          snap = null;
        }
        setStatus(computeMushafStatusCounts(snap));
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر بناء الخطة");
        setJourney(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!profileReady) return;
    load(days, false);
  }, [profileReady, days, load]);

  const plan = journey?.plan;
  const planDays = plan?.days ?? [];
  const revisionUnits = planDays.reduce(
    (n, d) =>
      n +
      d.items.filter(
        (i) => i.type === "NEAR_REVISION" || i.type === "FAR_REVISION"
      ).length,
    0
  );
  const newHifzUnits = planDays.reduce(
    (n, d) => n + d.items.filter((i) => i.type === "NEW_HIFZ").length,
    0
  );
  const totalMinutes = planDays.reduce((n, d) => n + (d.totalMinutes || 0), 0);
  const avgMinutes =
    planDays.length > 0 ? Math.round(totalMinutes / planDays.length) : 0;
  const attention =
    status.weak + status.needsReview + Math.floor(status.good * 0.25);

  const sampleDays = planDays.slice(0, 5);

  function activate() {
    try {
      refreshLearningState({ force: true });
      load(days, true);
      setActivated(true);
    } catch {
      setActivated(false);
    }
  }

  if (!profileReady) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مخطط الحفظ والمراجعة</h1>
        <p className="text-sm text-muted-foreground">
          خطة حقيقية من محرّك حافظ — حسب ملفك وذاكرتك وقرار اليوم
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">اختر المدة</CardTitle>
          <CardDescription>
            أفق التخطيط (أيام) — يُعاد توليد الخطة من PlanningService
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {HORIZONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDays(d);
                setActivated(false);
              }}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                days === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-accent"
              )}
            >
              {formatArabicNumber(d)} يوماً
            </button>
          ))}
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && journey && plan && (
        <>
          <Card className="border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/10 to-transparent">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">خطتك المقترحة</h2>
                <div className="flex flex-wrap gap-2">
                  {journey.decision.revisionOnly && (
                    <Badge variant="warning">مراجعة فقط</Badge>
                  )}
                  {journey.decision.newHifzEnabled && (
                    <Badge variant="success">حفظ جديد مفعّل</Badge>
                  )}
                  {journey.fromCache && (
                    <Badge variant="outline">من الذاكرة</Badge>
                  )}
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  • وحدات مراجعة في الأفق:{" "}
                  {formatArabicNumber(revisionUnits)}
                </li>
                <li>
                  • وحدات حفظ جديد: {formatArabicNumber(newHifzUnits)}
                </li>
                <li>
                  • مواضع تحتاج اهتماماً (من تقدمك):{" "}
                  {formatArabicNumber(attention)}
                </li>
                <li>
                  • متوسط الوقت اليومي: ~{formatArabicNumber(avgMinutes)}{" "}
                  دقيقة
                </li>
                <li>
                  • أسلوب المراجعة:{" "}
                  {styleLabel[profile.revisionStyle] || profile.revisionStyle}
                </li>
                <li>
                  • سعة يومك: {formatArabicNumber(profile.dailyMinutes)} دقيقة ·{" "}
                  {formatArabicNumber(profile.pagesPerDay)} صفحة حفظ
                </li>
                <li>• يُحدَّث تلقائياً بعد الجلسات والأخطاء والاختبارات</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button variant="premium" onClick={activate}>
                  {activated ? "تم التفعيل ✓" : "تفعيل / تحديث الخطة"}
                </Button>
                <Link
                  href="/plans/journey"
                  className="inline-flex h-10 items-center rounded-xl border border-[#D4AF37]/20 px-4 text-sm text-[#D4AF37] hover:bg-[#D4AF37]/10"
                >
                  رحلة اليوم
                </Link>
                <Link
                  href="/plans/revision"
                  className="inline-flex h-10 items-center rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37] px-4 text-sm font-semibold text-[#D4AF37]"
                >
                  ورد المراجعة
                </Link>
              </div>
              {activated && (
                <p className="text-xs text-[#D4AF37]">
                  أُعيد حساب حالة التعلم — افتح رحلة اليوم للمتابعة.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">عينة من أيام الخطة</CardTitle>
              <CardDescription>
                أول {formatArabicNumber(sampleDays.length)} أيام من{" "}
                {formatArabicNumber(planDays.length)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sampleDays.map((d) => (
                <div
                  key={d.dayNumber + "-" + d.date}
                  className="rounded-xl border border-[#D4AF37]/15 bg-[#0A0F1A]/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-white">
                      اليوم {formatArabicNumber(d.dayNumber)}
                      {d.date ? (
                        <span className="text-xs text-muted-foreground ms-2">
                          {d.date}
                        </span>
                      ) : null}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      ~{formatArabicNumber(d.totalMinutes)} د
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {d.items.slice(0, 4).map((item) => (
                      <li
                        key={item.id}
                        className="text-xs text-[#CBD5E1]/80 flex flex-wrap gap-2"
                      >
                        <Badge variant="outline" className="text-[10px]">
                          {itemTypeAr(item.type)}
                        </Badge>
                        <span>
                          {item.labelAr ||
                            (item.surah
                              ? `سورة ${item.surah}`
                              : item.page
                                ? `صفحة ${item.page}`
                                : "وحدة مخطّطة")}
                        </span>
                        <span className="text-muted-foreground">
                          {formatArabicNumber(item.estimatedMinutes)} د
                        </span>
                      </li>
                    ))}
                    {d.items.length === 0 && (
                      <li className="text-xs text-muted-foreground">
                        لا عناصر — راحة أو قيود القرار
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          {journey.appliedRules.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              قواعد مطبّقة: {journey.appliedRules.slice(0, 8).join(" · ")}
              {journey.appliedRules.length > 8 ? "…" : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}
