"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  loadMistakes,
  resolveMistake,
  type MistakeItem,
} from "@/lib/user-activity";
import { getSurah } from "@/lib/quran";
import { formatArabicNumber } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/layout/back-button";

function typeLabelAr(type: string): string {
  const map: Record<string, string> = {
    MISSING_WORD: "نسيان كلمة",
    WRONG_WORD: "كلمة غير صحيحة",
    HARAKA: "خطأ في الحركة",
    LETTER: "خطأ في حرف",
    WORD: "خطأ في كلمة",
    SKIP: "تجاوز / حذف",
    ORDER: "ترتيب الكلمات",
    MUTASHABIH: "خلط متشابه",
    QUIZ_WRONG: "خطأ في الاختبار",
    OTHER: "أخرى",
  };
  return map[type] || "يحتاج مراجعة";
}

function suggestAr(m: MistakeItem): string {
  if (m.type === "MISSING_WORD" || m.type === "SKIP") {
    return "كرر الآية ٥ مرات بالاستماع ثم سمّعها غيباً ببطء.";
  }
  if (m.type === "MUTASHABIH") {
    return "افتح المتشابهات واحفظ الضابط قبل إعادة التسميع.";
  }
  if (m.type === "WRONG_WORD" || m.type === "LETTER" || m.type === "HARAKA") {
    return "استمع للآية من قارئك المفضّل مرتين، وركّز على موضع الخطأ.";
  }
  return "راجع الآية اليوم وأعد اختبارها غداً.";
}

function extractWordHint(note?: string): string | null {
  if (!note) return null;
  const m =
    note.match(/«([^»]+)»/) ||
    note.match(/ناقصة[:\s]+(.+)/) ||
    note.match(/تخطّي[:\s]+(.+)/);
  return m ? m[1].trim() : null;
}

export default function MistakesPage() {
  const [list, setList] = useState<MistakeItem[]>([]);

  useEffect(() => {
    setList(loadMistakes());
    const on = () => setList(loadMistakes());
    window.addEventListener("hafiz-activity", on);
    return () => window.removeEventListener("hafiz-activity", on);
  }, []);

  const sorted = useMemo(
    () => [...list].sort((a, b) => b.frequency - a.frequency),
    [list]
  );
  const weak = sorted.slice(0, 5);
  const total = list.reduce((s, m) => s + m.frequency, 0);

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <PageHeader
          title={
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-[#D4AF37]" />
              مركز تحسين الأخطاء
            </h1>
          }
          description="مواضع تحتاج تقوية — بعبارة واضحة واقتراح عملي"
          backHref="/dashboard"
        />
      </FadeIn>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatArabicNumber(list.length)}</p>
            <p className="text-[11px] text-muted-foreground">مواضع مسجّلة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatArabicNumber(total)}</p>
            <p className="text-[11px] text-muted-foreground">مرات التكرار</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatArabicNumber(weak.length)}</p>
            <p className="text-[11px] text-muted-foreground">الأضعف حالياً</p>
          </CardContent>
        </Card>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href="/quiz">
            <Button type="button" variant="premium" size="sm" className="gap-1">
              <BookOpen className="h-4 w-4" />
              اختبار بنك الأخطاء
            </Button>
          </Link>
        </div>
      )}

      {weak.length > 0 && (
        <Card className="border-[#D4AF37]/25 bg-[#D4AF37]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">أولوية المراجعة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {weak.map((m) => {
              const name = getSurah(m.surahNumber)?.nameAr || "";
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-sm"
                >
                  <span>
                    سورة {name}
                    {m.ayahNumber ? " — الآية " + formatArabicNumber(m.ayahNumber) : ""}
                    <span className="text-xs text-muted-foreground ms-2">
                      ({formatArabicNumber(m.frequency)}×)
                    </span>
                  </span>
                  <Link
                    href={
                      "/session/revision?surah=" +
                      m.surahNumber +
                      (m.ayahNumber
                        ? "&from=" + m.ayahNumber + "&to=" + m.ayahNumber
                        : "")
                    }
                    className="text-xs text-primary hover:underline"
                  >
                    راجع الآن
                  </Link>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          سجل الأخطاء
        </h2>
        {sorted.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              لا أخطاء مسجّلة بعد. عند التلاوة أو الاختبار تُحفظ هنا تلقائياً.
            </CardContent>
          </Card>
        )}
        {sorted.map((m) => {
          const name = getSurah(m.surahNumber)?.nameAr || "سورة";
          const word = extractWordHint(m.note);
          return (
            <Card key={m.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-sm">
                    أخطأت في سورة {name}
                    {m.ayahNumber
                      ? " — الآية " + formatArabicNumber(m.ayahNumber)
                      : ""}
                  </p>
                  <Badge variant="warning" className="text-[10px]">
                    تكرر {formatArabicNumber(m.frequency)}
                  </Badge>
                </div>
                {word && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      الكلمة التي تحتاج مراجعة:{" "}
                    </span>
                    <span className="font-quran font-semibold">{word}</span>
                  </p>
                )}
                <p className="text-sm">
                  <span className="text-muted-foreground">سبب الخطأ: </span>
                  {typeLabelAr(m.type)}
                  {m.note && !word ? " — " + m.note : ""}
                </p>
                <div className="rounded-lg bg-[#D4AF37]/10 px-3 py-2 text-xs leading-relaxed">
                  <strong>اقتراح: </strong>
                  {suggestAr(m)}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={
                      "/session/revision?surah=" +
                      m.surahNumber +
                      (m.ayahNumber
                        ? "&from=" + m.ayahNumber + "&to=" + m.ayahNumber
                        : "")
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] hover:bg-accent"
                  >
                    <BookOpen className="h-3 w-3" />
                    فتح للمراجعة
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-[11px]"
                    onClick={() => setList(resolveMistake(m.id))}
                  >
                    <RefreshCw className="h-3 w-3 me-1" />
                    تمّت معالجتها
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
