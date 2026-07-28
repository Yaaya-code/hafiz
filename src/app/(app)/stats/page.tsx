"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadStreak } from "@/lib/user-activity";
import { loadAyahProgress } from "@/lib/memorization-store";
import { loadMistakes } from "@/lib/user-activity";
import {
  loadMutashabihatProgress,
  mutashabihatAccuracy,
} from "@/lib/mutashabihat-progress";
import { formatArabicNumber } from "@/lib/utils";
import { SURAHS } from "@/lib/quran";

/**
 * Simple learner-friendly stats — Arabic first, no heavy dashboards.
 */
const emptyStreak = {
  current: 0,
  longest: 0,
  lastActiveDate: "",
  totalDays: 0,
};

export default function StatsPage() {
  // SSR-safe defaults first — hydrate from localStorage after mount only
  const [streak, setStreak] = useState(emptyStreak);
  const [progress, setProgress] = useState<ReturnType<typeof loadAyahProgress>>(
    {}
  );
  const [mistakes, setMistakes] = useState<ReturnType<typeof loadMistakes>>([]);
  const [muta, setMuta] = useState(() => loadMutashabihatProgress());
  useEffect(() => {
    const refresh = () => {
      setStreak(loadStreak());
      setProgress(loadAyahProgress());
      setMistakes(loadMistakes());
      setMuta(loadMutashabihatProgress());
    };
    refresh();
    window.addEventListener("hafiz-activity", refresh);
    window.addEventListener("hafiz-mem-updated", refresh);
    window.addEventListener("hafiz-sync-applied", refresh);
    window.addEventListener("hafiz-mutashabihat-progress", refresh);
    window.addEventListener("hafiz-quiz-completed", refresh);
    window.addEventListener("hafiz-achievements-updated", refresh);
    return () => {
      window.removeEventListener("hafiz-activity", refresh);
      window.removeEventListener("hafiz-mem-updated", refresh);
      window.removeEventListener("hafiz-sync-applied", refresh);
      window.removeEventListener("hafiz-mutashabihat-progress", refresh);
      window.removeEventListener("hafiz-quiz-completed", refresh);
      window.removeEventListener("hafiz-achievements-updated", refresh);
    };
  }, []);

  const entries = Object.values(progress);
  const memorized = entries.filter(
    (e) => e.status === "MASTERED" || (e.listenCount || 0) >= 5
  ).length;
  const strong = entries.filter(
    (e) => (e.successTests || 0) > (e.failTests || 0) && (e.successTests || 0) > 0
  ).length;
  const weak = entries.filter(
    (e) => (e.failTests || 0) >= (e.successTests || 0) && (e.failTests || 0) > 0
  ).length;
  const listenTotal = entries.reduce((s, e) => s + (e.listenCount || 0), 0);
  // rough minutes: ~30s per listen
  const listenMinutes = Math.round((listenTotal * 0.5));

  const surahsTouched = new Set(entries.map((e) => e.surahNumber)).size;

  const cards = [
    {
      label: "أيام الانتظام (السلسلة)",
      value: formatArabicNumber(streak.current),
      hint: "أطول سلسلة: " + formatArabicNumber(streak.longest),
    },
    {
      label: "آيات متقنة / نشيطة",
      value: formatArabicNumber(memorized),
      hint: "من سجل الحفظ المحلي",
    },
    {
      label: "سور عملت عليها",
      value: formatArabicNumber(surahsTouched),
      hint: "من أصل " + formatArabicNumber(SURAHS.length),
    },
    {
      label: "مرات الاستماع",
      value: formatArabicNumber(listenTotal),
      hint: "تقريباً " + formatArabicNumber(listenMinutes) + " دقيقة",
    },
    {
      label: "مواضع قوية",
      value: formatArabicNumber(strong),
      hint: "نجاح اختبار أكثر من الفشل",
    },
    {
      label: "مواضع ضعيفة",
      value: formatArabicNumber(weak + mistakes.length),
      hint: "تشمل أخطاء مسجّلة: " + formatArabicNumber(mistakes.length),
    },
    {
      label: "المتشابهات",
      value: formatArabicNumber(muta.sessionsCompleted),
      hint:
        "دقة " +
        formatArabicNumber(mutashabihatAccuracy(muta)) +
        "% · " +
        formatArabicNumber(muta.totalAttempts) +
        " محاولة",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إحصائياتك</h1>
        <p className="text-sm text-muted-foreground">
          ملخص بسيط لرحلتك مع القرآن — بدون تعقيد
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-[#D4AF37]/20 bg-[#D4AF37]/5">
        <CardContent className="p-5 text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground mb-1">نصيحة</p>
          ركّز على المواضع الضعيفة وسلسلة الأيام أكثر من الأرقام الكبيرة. الانتظام
          اليومي أهم من الإنجاز السريع.
        </CardContent>
      </Card>
    </div>
  );
}
