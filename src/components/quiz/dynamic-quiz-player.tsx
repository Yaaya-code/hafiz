"use client";

/**
 * Flexible quiz player — renders MCQ / fill-blank from DynamicQuizPayload.
 * Exit/back always available mid-quiz.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { formatArabicNumber, cn } from "@/lib/utils";
import type { DynamicQuizPayload } from "@/lib/quiz/dynamic-types";

type Props = {
  quiz: DynamicQuizPayload;
  onExit: () => void;
  onComplete?: (score: number, total: number) => void;
};

export function DynamicQuizPlayer({ quiz, onExit, onComplete }: Props) {
  const total = quiz.questions.length;
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [fill, setFill] = useState("");
  const [answered, setAnswered] = useState(false);
  const [done, setDone] = useState(false);

  const q = quiz.questions[index];
  const pct = total ? Math.round(((index + (answered ? 1 : 0)) / total) * 100) : 0;

  const isCorrect = useMemo(() => {
    if (!q || !answered) return false;
    if (q.type === "fill_blank") {
      return (
        fill.trim().replace(/\s+/g, " ") ===
        (q.answer || "").trim().replace(/\s+/g, " ")
      );
    }
    return selected === q.answer;
  }, [q, answered, selected, fill]);

  function submitMcq(choiceId: string) {
    if (answered || !q) return;
    setSelected(choiceId);
    setAnswered(true);
    if (choiceId === q.answer) setScore((s) => s + 1);
  }

  function submitFill() {
    if (answered || !q) return;
    setAnswered(true);
    const ok =
      fill.trim().replace(/\s+/g, " ") ===
      (q.answer || "").trim().replace(/\s+/g, " ");
    if (ok) setScore((s) => s + 1);
  }

  function next() {
    if (index >= total - 1) {
      setDone(true);
      onComplete?.(score, total);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setFill("");
    setAnswered(false);
  }

  if (!q && !done) {
    return (
      <div className="mx-auto max-w-md p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">لا توجد أسئلة في هذا الاختبار.</p>
        <Button type="button" variant="outline" onClick={onExit}>
          خروج / رجوع
        </Button>
      </div>
    );
  }

  if (done) {
    const finalPct = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">انتهى الاختبار</h1>
        <p className="text-muted-foreground">{quiz.titleAr}</p>
        <p className="text-4xl font-bold text-primary">
          {formatArabicNumber(score)}/{formatArabicNumber(total)}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatArabicNumber(finalPct)}%
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button type="button" variant="outline" onClick={onExit}>
            خروج / رجوع
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={onExit}>
          خروج / رجوع
        </Button>
        <div className="text-end">
          <h1 className="text-lg font-bold">{quiz.titleAr}</h1>
          <p className="text-xs text-muted-foreground">
            سؤال {formatArabicNumber(index + 1)} من {formatArabicNumber(total)}
          </p>
        </div>
      </div>

      <Progress value={pct} className="h-2" />

      <Card>
        <CardContent className="p-5 space-y-4">
          {q.contextAr && (
            <p
              dir="rtl"
              className="rounded-xl bg-muted/40 p-3 text-center font-[family-name:var(--font-quran)] text-lg leading-loose"
            >
              {q.contextAr}
            </p>
          )}
          <p className="font-medium leading-relaxed">{q.prompt}</p>
          {q.meta?.source && (
            <Badge variant="muted" className="text-[10px]">
              {q.meta.source}
            </Badge>
          )}

          {q.type === "fill_blank" ? (
            <div className="space-y-3">
              <Input
                value={fill}
                onChange={(e) => setFill(e.target.value)}
                disabled={answered}
                placeholder="أكمل الفراغ…"
                className="h-11 rounded-xl text-center font-[family-name:var(--font-quran)]"
                dir="rtl"
              />
              {!answered && (
                <Button
                  type="button"
                  variant="premium"
                  className="w-full"
                  onClick={submitFill}
                >
                  تحقق
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {(q.choices || []).map((c) => {
                const isPick = selected === c.id;
                const isAns = c.id === q.answer;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={answered}
                    onClick={() => submitMcq(c.id)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-start text-sm transition-all",
                      !answered && "hover:bg-accent",
                      answered && isAns && "border-emerald-500 bg-emerald-500/10",
                      answered && isPick && !isAns && "border-red-500/50 bg-red-500/10"
                    )}
                  >
                    {c.text}
                  </button>
                );
              })}
            </div>
          )}

          {answered && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                isCorrect
                  ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                  : "bg-red-500/15 text-red-800 dark:text-red-200"
              )}
            >
              {isCorrect ? "✅ إجابة صحيحة" : "❌ إجابة غير مطابقة"}
              {q.explanationAr && (
                <p className="mt-1 text-xs opacity-90">{q.explanationAr}</p>
              )}
            </div>
          )}

          {answered && (
            <Button type="button" variant="premium" className="w-full" onClick={next}>
              {index >= total - 1 ? "النتيجة" : "التالي"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
