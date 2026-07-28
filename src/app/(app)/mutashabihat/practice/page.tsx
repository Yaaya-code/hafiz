"use client";

/**
 * Mutashabihat practice — real learning flow:
 * track attempts, mistakes, session completion via @/application.
 */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildMutashabihQuiz } from "@/lib/quran/mutashabihat-db";
import { completeSession, recordMistake } from "@/application";
import {
  completeMutashabihatSession,
  recordMutashabihatAttempt,
} from "@/lib/mutashabihat-progress";
import { cn, formatArabicNumber } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { Skeleton } from "@/components/ui/skeleton";

export default function MutashabihPracticePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-xl" />}>
      <MutashabihPracticeInner />
    </Suspense>
  );
}

function MutashabihPracticeInner() {
  const params = useSearchParams();
  const router = useRouter();
  const stepId = params.get("step");
  const quiz = useMemo(() => buildMutashabihQuiz(12), []);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const q = quiz[i];

  function answer(idx: number) {
    if (picked !== null || !q) return;
    setPicked(idx);
    const ok = !!q.options[idx]?.ok;
    if (ok) setScore((s) => s + 1);

    try {
      recordMutashabihatAttempt({ groupId: q.id, correct: ok });
    } catch {
      /* non-fatal */
    }

    if (!ok) {
      // Prefer wrong option's surah for targeting; fall back to correct
      const wrong = q.options[idx];
      const correct = q.options.find((o) => o.ok);
      const surahNumber =
        (wrong as { surahNumber?: number })?.surahNumber ||
        (correct as { surahNumber?: number })?.surahNumber;
      const ayahNumber =
        (wrong as { ayahNumber?: number })?.ayahNumber ||
        (correct as { ayahNumber?: number })?.ayahNumber;
      if (surahNumber) {
        try {
          recordMistake({
            surahNumber,
            ayahNumber,
            type: "MUTASHABIH",
            difficulty: 3,
            note: "خطأ في تمرين المتشابهات · " + (q.tip || q.id),
            autoReplan: false,
          });
        } catch {
          /* non-fatal */
        }
      }
    }
  }

  function finishSession() {
    if (finishing) return;
    setFinishing(true);
    try {
      completeMutashabihatSession({ score, total: quiz.length });
      completeSession({
        sessionKind: "mutashabihat",
        planItemId: stepId || "mutashabihat_practice",
        outcome:
          score >= Math.ceil(quiz.length * 0.7)
            ? "success"
            : score >= Math.ceil(quiz.length * 0.4)
              ? "partial"
              : "fail",
        quality:
          score >= Math.ceil(quiz.length * 0.8)
            ? 4
            : score >= Math.ceil(quiz.length * 0.5)
              ? 3
              : 1,
        autoReplan: true,
      });
    } catch {
      /* still allow navigation */
    }
    setDone(true);
    setFinishing(false);
  }

  function next() {
    if (i >= quiz.length - 1) {
      finishSession();
      return;
    }
    setI((x) => x + 1);
    setPicked(null);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <p className="text-4xl">✨</p>
        <h1 className="text-2xl font-bold">انتهى تمرين المتشابهات</h1>
        <p className="text-muted-foreground">
          {formatArabicNumber(score)} / {formatArabicNumber(quiz.length)}
        </p>
        <p className="text-xs text-muted-foreground">
          سُجّل في رحلتك · يُحدَّث مسار اليوم عند الحاجة
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          {stepId ? (
            <Button
              variant="premium"
              onClick={() => router.push("/plans/journey")}
            >
              العودة لرحلة اليوم
            </Button>
          ) : (
            <Button
              variant="premium"
              onClick={() => {
                setDone(false);
                setI(0);
                setScore(0);
                setPicked(null);
              }}
            >
              إعادة
            </Button>
          )}
          <Link
            href={stepId ? "/plans/journey" : "/mutashabihat"}
            className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-accent"
          >
            {stepId ? "رحلة اليوم" : "قاعدة المتشابهات"}
          </Link>
        </div>
      </div>
    );
  }

  if (!q) {
    return <p className="p-8 text-sm">لا توجد أسئلة كافية</p>;
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            تدريب المتشابهات
          </h1>
          <Badge>
            {formatArabicNumber(i + 1)} / {formatArabicNumber(quiz.length)}
          </Badge>
        </div>
      </FadeIn>

      <Card>
        <CardHeader>
          <Badge variant="muted" className="w-fit mb-2">
            {q.type}
          </Badge>
          <CardTitle className="text-base">{q.prompt}</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">{q.context}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {q.options.map((opt, idx) => {
            const show = picked !== null;
            const isPick = picked === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => answer(idx)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-start text-sm font-quran leading-relaxed transition-all",
                  !show && "hover:bg-accent",
                  show && opt.ok && "border-[#D4AF37] bg-[#D4AF37]/10",
                  show &&
                    isPick &&
                    !opt.ok &&
                    "border-orange-500/50 bg-orange-500/10"
                )}
              >
                <span className="block text-[10px] text-muted-foreground mb-1 font-sans">
                  {opt.surah}
                </span>
                {opt.text}
              </button>
            );
          })}
          {picked !== null && (
            <div className="space-y-2 pt-2">
              <p className="text-xs text-muted-foreground">💡 {q.tip}</p>
              <Button
                variant="premium"
                className="w-full"
                onClick={next}
                disabled={finishing}
              >
                {i >= quiz.length - 1 ? "النتيجة والتسجيل" : "التالي"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
