"use client";

/**
 * Dynamic Quiz Hub — loads real bank from /api/v1/quiz/questions
 * (Prisma DB if seeded, else data/quiz-bank.json with 700+ real items).
 */

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/back-button";
import { SURAHS } from "@/lib/quran";
import { formatArabicNumber, cn } from "@/lib/utils";
import { DynamicQuizPlayer } from "@/components/quiz/dynamic-quiz-player";
import type { DynamicQuizPayload } from "@/lib/quiz/dynamic-types";

type Phase = "hub" | "play" | "loading" | "error";
type Category = "hifz" | "meanings" | "religious";

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("hub");
  const [surah, setSurah] = useState(0); // 0 = all surahs
  const [category, setCategory] = useState<Category>("hifz");
  const [active, setActive] = useState<DynamicQuizPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bankMeta, setBankMeta] = useState<string | null>(null);

  const startQuiz = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const qs = new URLSearchParams({
        category,
        limit: "15",
      });
      if (surah >= 1) qs.set("surah", String(surah));
      const res = await fetch(`/api/v1/quiz/questions?${qs.toString()}`);
      const data = await res.json();
      if (!data?.ok || !data.questions?.length) {
        setError("لا توجد أسئلة متاحة لهذا الاختيار. جرّب تصنيفاً آخر.");
        setPhase("error");
        return;
      }

      const surahName =
        surah >= 1
          ? SURAHS.find((s) => s.number === surah)?.nameAr
          : "عام";
      const titleMap: Record<Category, string> = {
        hifz: "حفظ ومعرفة السور",
        meanings: "معاني",
        religious: "أسئلة دينية",
      };

      const quiz: DynamicQuizPayload = {
        id: `live_${category}_${surah}_${Date.now()}`,
        titleAr: `${titleMap[category]}${surahName ? ` — ${surahName}` : ""}`,
        descriptionAr: `مصدر: ${data.source}${
          data.totalInBank ? ` · البنك: ${data.totalInBank} سؤالاً` : ""
        }`,
        category,
        surahNumber: surah || undefined,
        questions: data.questions.map(
          (q: {
            id: string;
            type: "mcq" | "fill_blank" | "true_false";
            prompt: string;
            contextAr?: string;
            answer: string;
            explanationAr?: string;
            choices?: { id: string; text: string }[];
            meta?: { surahNumber?: number; source?: string };
          }) => ({
            id: q.id,
            type: q.type,
            prompt: q.prompt,
            contextAr: q.contextAr,
            answer: q.answer,
            explanationAr: q.explanationAr,
            choices: q.choices,
            meta: q.meta,
          })
        ),
      };

      setBankMeta(
        data.totalInBank
          ? `البنك: ${formatArabicNumber(data.totalInBank)} سؤالاً · ${data.source}`
          : String(data.source || "")
      );
      setActive(quiz);
      setPhase("play");
    } catch {
      setError("تعذّر تحميل الأسئلة. تحقق من الاتصال.");
      setPhase("error");
    }
  }, [category, surah]);

  function exit() {
    setPhase("hub");
    setActive(null);
    setError(null);
  }

  if (phase === "play" && active) {
    return (
      <div className="py-4">
        <DynamicQuizPlayer quiz={active} onExit={exit} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      <PageHeader
        title="الاختبارات"
        description="بنك أسئلة حقيقي ضخم (مئات الأسئلة) — سور · معاني · دين. يُحمَّل من قاعدة البيانات أو ملف JSON."
        backHref="/dashboard"
      />

      {bankMeta && (
        <p className="text-center text-xs text-muted-foreground">{bankMeta}</p>
      )}

      <Card className="border-[#D4AF37]/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">١ · السورة (اختياري)</CardTitle>
          <CardDescription>
            اختر سورة لتضييق الأسئلة، أو «جميع السور»
          </CardDescription>
        </CardHeader>
        <CardContent>
          <select
            className="flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
            value={surah}
            onChange={(e) => setSurah(Number(e.target.value))}
          >
            <option value={0}>جميع السور</option>
            {SURAHS.map((s) => (
              <option key={s.number} value={s.number}>
                {formatArabicNumber(s.number)}. {s.nameAr}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card className="border-[#D4AF37]/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">٢ · التصنيف</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { id: "hifz" as const, title: "حفظ", icon: "📖" },
              { id: "meanings" as const, title: "معاني", icon: "💡" },
              { id: "religious" as const, title: "دينية", icon: "🕌" },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-2xl border p-4 text-start transition-all",
                category === c.id
                  ? "border-[#D4AF37] bg-[#D4AF37]/10"
                  : "hover:border-[#D4AF37]/40"
              )}
            >
              <div className="text-2xl mb-2">{c.icon}</div>
              <p className="font-semibold text-sm">{c.title}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {(phase === "error" || error) && (
        <p className="text-sm text-center text-[#D4AF37]">{error}</p>
      )}

      <Button
        type="button"
        variant="premium"
        className="w-full h-12"
        disabled={phase === "loading"}
        onClick={() => void startQuiz()}
      >
        {phase === "loading" ? "جاري التحميل…" : "ابدأ الاختبار"}
      </Button>
    </div>
  );
}
