"use client";

/**
 * Quran-focused guide inside a Surah — focused actions, not open free chat.
 */

import { useMemo, useState } from "react";
import { BookOpen, Lightbulb, Sparkles, Info, ListTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSurah, getAyah, getSurahAyahs } from "@/lib/quran";
import { MUTASHABIHAT_DB } from "@/lib/quran/mutashabihat-db";
import { formatArabicNumber, cn } from "@/lib/utils";

type GuideAction =
  | "about"
  | "info"
  | "explain_surah"
  | "explain_ayah"
  | "lessons"
  | "themes"
  | "mutashabihat";

const ACTIONS: {
  id: GuideAction;
  label: string;
  icon: typeof Info;
}[] = [
  { id: "about", label: "عن هذه السورة", icon: BookOpen },
  { id: "info", label: "معلومات السورة", icon: Info },
  { id: "explain_surah", label: "شرح السورة", icon: BookOpen },
  { id: "explain_ayah", label: "شرح الآية الحالية", icon: Lightbulb },
  { id: "lessons", label: "دروس من السورة", icon: Lightbulb },
  { id: "themes", label: "محاور مهمة", icon: ListTree },
  { id: "mutashabihat", label: "متشابهات السورة", icon: Sparkles },
];

export function SurahGuide({
  surahNumber,
  focusAyah = 1,
  meanings = {},
}: {
  surahNumber: number;
  focusAyah?: number;
  meanings?: Record<number, string>;
}) {
  const [active, setActive] = useState<GuideAction | null>("about");
  const surah = getSurah(surahNumber);
  const content = useMemo(
    () =>
      active
        ? buildGuideContent(active, surahNumber, focusAyah, meanings)
        : "",
    [active, surahNumber, focusAyah, meanings]
  );

  if (!surah) return null;

  return (
    <Card className="border-[#D4AF37]/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          دليل السورة — {surah.nameAr}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          معلومات مركّزة للفهم والحفظ — اختر موضوعاً
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setActive(a.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  active === a.id
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent text-muted-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {a.label}
              </button>
            );
          })}
        </div>
        {active && content && (
          <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-line">
            {content}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          معنى كل آية يظهر تحتها في المصحف. هذا الدليل للشرح الأعمق والمتشابهات.
        </p>
      </CardContent>
    </Card>
  );
}

function buildGuideContent(
  action: GuideAction,
  surahNumber: number,
  focusAyah: number,
  meanings: Record<number, string>
): string {
  const surah = getSurah(surahNumber);
  if (!surah) return "";
  const name = surah.nameAr;
  const ayahs = getSurahAyahs(surahNumber);
  const mut = MUTASHABIHAT_DB.filter((g) =>
    g.ayahs.some((a) => a.surahNumber === surahNumber)
  );

  switch (action) {
    case "about":
    case "info":
      return [
        "سورة " + name,
        "• النوع: " + (surah.revelationType === "Meccan" ? "مكية" : "مدنية"),
        "• عدد الآيات: " + formatArabicNumber(surah.ayahCount),
        "• الجزء التقريبي: " + formatArabicNumber(surah.startJuz),
        "• ترتيب المصحف: السورة " + formatArabicNumber(surah.number),
        "",
        "هذه المعلومات تساعدك تضع السورة في سياق المصحف عند الحفظ والمراجعة.",
      ].join("\n");

    case "explain_surah": {
      const picks = [
        1,
        Math.ceil(surah.ayahCount / 2),
        surah.ayahCount,
      ].filter((n, i, a) => a.indexOf(n) === i);
      return [
        "شرح موجّه للحافظ — سورة " + name + ":",
        "",
        ...picks.map((n) => {
          const m = meanings[n];
          const t = ayahs[n - 1]?.text.slice(0, 50) || "";
          return (
            "• من أجواء الآية " +
            n +
            ": " +
            (m ? m.slice(0, 120) : t + "…")
          );
        }),
        "",
        "احفظ السورة كمقاطع مترابطة، وارجع لمعنى كل مقطع قبل التثبيت.",
      ].join("\n");
    }

    case "explain_ayah": {
      const n = Math.min(
        Math.max(1, focusAyah),
        surah.ayahCount
      );
      const a = getAyah(surahNumber, n);
      const m = meanings[n];
      return [
        "شرح الآية " + formatArabicNumber(n) + " من سورة " + name + ":",
        "",
        "﴿ " + a.text + " ﴾",
        "",
        m
          ? "المعنى:\n" + m
          : "المعنى المختصر يظهر تحت الآية في المصحف بعد التحميل.",
        "",
        "نصيحة: كرّر الآية غيباً بعد فهم المعنى مباشرة.",
      ].join("\n");
    }

    case "lessons": {
      const picks = [1, Math.floor(surah.ayahCount / 2), surah.ayahCount];
      return [
        "دروس عملية من سورة " + name + ":",
        "",
        ...picks.map((n) => {
          const m = meanings[n];
          return m
            ? "• آية " + n + ": " + m.slice(0, 140)
            : "• آية " + n + ": تأمل اللفظ وعدّه تذكيراً يومياً.";
        }),
        "",
        "اجعل لكل مقطع درساً واحداً يثبّت الحفظ.",
      ].join("\n");
    }

    case "themes": {
      const third = Math.max(1, Math.floor(surah.ayahCount / 3));
      return [
        "محاور مهمة في سورة " + name + ":",
        "",
        "• المطلع (من الآية ١): افتتاح السورة وتحديد نغمتها.",
        "• الوسط (حوالي الآية " +
          third * 2 +
          "): لبّ الموضوع غالباً.",
        "• الخاتمة (آية " +
          surah.ayahCount +
          "): تثبيت المعنى الختامي.",
        "",
        "قسّم الحفظ على هذه المحاور الثلاثة ليسهل الربط.",
      ].join("\n");
    }

    case "mutashabihat": {
      if (!mut.length) {
        return (
          "لا توجد مجموعات متشابهات مخزّنة لهذه السورة في القاعدة حالياً.\nراجع المقطع بصوت مرتفع لتقليل الخلط."
        );
      }
      return [
        "متشابهات مرتبطة بسورة " + name + ":",
        "",
        ...mut.slice(0, 8).map((g, i) => {
          const refs = g.ayahs
            .map((a) => a.surahName + " " + a.ayahNumber)
            .join(" / ");
          return (
            i +
            1 +
            ") " +
            refs +
            "\n   " +
            (g.differenceExplain || g.tips[0] || g.title)
          );
        }),
      ].join("\n");
    }

    default:
      return "";
  }
}
