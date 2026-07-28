"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSurah, getSurahAyahs } from "@/lib/quran";
import { completeSession, recordMistake } from "@/application";
import { formatArabicNumber, cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function SessionQuizPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-2xl" />}>
      <QuizInner />
    </Suspense>
  );
}

type QItem = {
  surahNumber: number;
  surahName: string;
  ayahNumber: number;
  text: string;
  prompt: string;
  options: { text: string; ok: boolean }[];
};

function buildQuiz(
  surahNumber: number,
  fromAyah: number,
  toAyah: number
): QItem[] {
  const surah = getSurah(surahNumber);
  const ayahs = getSurahAyahs(surahNumber).filter(
    (a) => a.ayahNumber >= fromAyah && a.ayahNumber <= toAyah
  );
  if (ayahs.length < 2) {
    // expand slightly within surah for options
    const all = getSurahAyahs(surahNumber);
    const pool = all.length ? all : ayahs;
    return pool.slice(0, Math.min(5, pool.length)).map((a, i) => {
      const wrong = pool[(i + 1) % pool.length];
      return {
        surahNumber: a.surahNumber,
        surahName: surah?.nameAr || "",
        ayahNumber: a.ayahNumber,
        text: a.text,
        prompt: "أي نص يطابق آية " + a.ayahNumber + " من " + (surah?.nameAr || "") + "؟",
        options: [
          { text: a.text, ok: true },
          { text: wrong.text, ok: false },
        ].sort(() => Math.random() - 0.5),
      };
    });
  }

  const items: QItem[] = [];
  const count = Math.min(6, ayahs.length);
  for (let i = 0; i < count; i++) {
    const a = ayahs[i];
    // hide middle words as prompt style: pick full text recognition
    const distractors = ayahs.filter((x) => x.ayahNumber !== a.ayahNumber);
    const wrong1 = distractors[i % distractors.length];
    const wrong2 = distractors[(i + 1) % distractors.length];
    const options = [
      { text: a.text, ok: true },
      { text: wrong1.text, ok: false },
    ];
    if (wrong2 && wrong2.ayahNumber !== wrong1.ayahNumber) {
      options.push({ text: wrong2.text, ok: false });
    }
    items.push({
      surahNumber: a.surahNumber,
      surahName: surah?.nameAr || "",
      ayahNumber: a.ayahNumber,
      text: a.text,
      prompt:
        "اختر النص الصحيح لـ " +
        (surah?.nameAr || "") +
        " آية " +
        a.ayahNumber,
      options: options.sort(() => Math.random() - 0.5),
    });
  }
  return items;
}

function QuizInner() {
  const params = useSearchParams();
  const router = useRouter();
  const stepId = params.get("step") || "quiz";
  const surahNumber = Math.max(1, Number(params.get("surah") || 1));
  const fromAyah = Math.max(1, Number(params.get("from") || 1));
  const toAyah = Math.max(fromAyah, Number(params.get("to") || fromAyah + 10));

  const quiz = useMemo(
    () => buildQuiz(surahNumber, fromAyah, toAyah),
    [surahNumber, fromAyah, toAyah]
  );

  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = quiz[i];

  function answer(idx: number) {
    if (picked !== null || !q) return;
    setPicked(idx);
    if (q.options[idx].ok) {
      setScore((s) => s + 1);
    } else {
      recordMistake({
        surahNumber: q.surahNumber,
        ayahNumber: q.ayahNumber,
        type: "QUIZ_WRONG",
        difficulty: 3,
        note: "خطأ في اختبار رحلة اليوم",
        autoReplan: false,
      });
    }
  }

  function next() {
    if (i >= quiz.length - 1) {
      setDone(true);
      return;
    }
    setI((x) => x + 1);
    setPicked(null);
  }

  function finish() {
    const passed = quiz.length > 0 && score / quiz.length >= 0.6;
    completeSession({
      sessionKind: "quiz",
      planItemId: stepId,
      outcome: passed ? "success" : "fail",
      quality: passed ? 4 : 2,
      surahNumber,
      fromAyah,
      toAyah,
      autoReplan: true,
    });
    const after = params.get("after");
    if (after === "dashboard") router.push("/dashboard");
    else if (after === "quiz") router.push("/quiz");
    else router.push("/plans/journey");
  }

  if (!quiz.length) {
    return (
      <div className="p-8 text-center text-sm">
        لا توجد أسئلة لهذا النطاق.{" "}
        <Link href="/plans/journey" className="text-primary underline">
          رحلة اليوم
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <p className="text-4xl">✅</p>
        <h1 className="text-xl font-bold">انتهى الاختبار</h1>
        <p className="text-muted-foreground">
          {formatArabicNumber(score)} / {formatArabicNumber(quiz.length)}
        </p>
        <p className="text-xs text-muted-foreground">
          من نطاق: سورة {getSurah(surahNumber)?.nameAr}{" "}
          {formatArabicNumber(fromAyah)}–{formatArabicNumber(toAyah)}
        </p>
        <Button type="button" variant="premium" onClick={finish}>
          إكمال الخطوة والعودة للرحلة
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <Badge variant="success">اختبار الورد اليومي · نطاق محدود</Badge>
          <h1 className="text-lg font-bold mt-1">
            {getSurah(surahNumber)?.nameAr}{" "}
            {formatArabicNumber(fromAyah)}–{formatArabicNumber(toAyah)}
          </h1>
        </div>
        <Badge>
          {formatArabicNumber(i + 1)} / {formatArabicNumber(quiz.length)}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{q.prompt}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {q.options.map((opt, idx) => {
            const show = picked !== null;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => answer(idx)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-start font-quran text-sm leading-relaxed",
                  !show && "hover:bg-accent",
                  show && opt.ok && "border-[#D4AF37] bg-[#D4AF37]/10",
                  show &&
                    picked === idx &&
                    !opt.ok &&
                    "border-[#D4AF37] bg-[#D4AF37]/10"
                )}
                dir="rtl"
              >
                {opt.text}
                {show && opt.ok && (
                  <CheckCircle2 className="inline h-4 w-4 ms-2 text-[#D4AF37]" />
                )}
                {show && picked === idx && !opt.ok && (
                  <XCircle className="inline h-4 w-4 ms-2 text-[#D4AF37]" />
                )}
              </button>
            );
          })}
          {picked !== null && (
            <Button type="button" variant="premium" className="w-full mt-2" onClick={next}>
              {i >= quiz.length - 1 ? "النتيجة" : "التالي"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
