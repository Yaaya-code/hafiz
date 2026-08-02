"use client";

/**
 * Gamified multi-tier quiz system —
 * MCQ · speed timer · ayah reordering · mutashabihat · first/last · hardcore.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatArabicNumber, cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/back-button";
import { SURAHS } from "@/lib/quran";
import {
  buildLearningQuiz,
  buildScopedQuiz,
  quizPassThreshold,
  QUIZ_MODES,
  type QuizMode,
  type QuizQuestion,
} from "@/lib/quiz-from-learning";
import {
  completeSession,
  getLearningSnapshot,
  type LearningSnapshot,
} from "@/application";
import {
  bumpStreak,
  recordActivity,
  recordQuizResult,
} from "@/lib/user-activity";

type Phase = "hub" | "select" | "range" | "play" | "result";
type QuizCategory = "hifz" | "meanings" | "religious" | null;

const TIER_LABEL: Record<QuizMode["tier"], string> = {
  easy: "سهل",
  fun: "مسلي",
  tactical: "تكتيكي",
  hard: "صعب",
};

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("hub");
  const [category, setCategory] = useState<QuizCategory>(null);
  const [mode, setMode] = useState<QuizMode | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [poolHint, setPoolHint] = useState("");
  const [customSurah, setCustomSurah] = useState(2);
  const [customFrom, setCustomFrom] = useState(1);
  const [customTo, setCustomTo] = useState(16);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [reorderPicks, setReorderPicks] = useState<string[]>([]);
  const [timedOut, setTimedOut] = useState(false);

  function exitQuiz() {
    setPhase("hub");
    setCategory(null);
    setMode(null);
    setQuestions([]);
    setQIndex(0);
    setScore(0);
    setSelected(null);
    setAnswered(false);
    setReorderPicks([]);
    setTimedOut(false);
    setTimeLeft(null);
  }

  const loadSnapshot = useCallback((): LearningSnapshot | null => {
    try {
      return getLearningSnapshot();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const snap = loadSnapshot();
    const mem = snap?.revisionMemory?.length ?? 0;
    setPoolHint(
      mem > 0
        ? "مسارات: سهلة · مسلية · تكتيكية · صعبة — من محفوظك وبنك أخطائك"
        : "لا ذاكرة بعد — أسئلة تأسيسية من قصار السور حتى تتراكم بياناتك"
    );
  }, [loadSnapshot]);

  function beginPlay(m: QuizMode, qs: QuizQuestion[]) {
    setMode(m);
    setQuestions(qs);
    setPhase("play");
    setQIndex(0);
    setScore(0);
    setSelected(null);
    setAnswered(false);
    setReorderPicks([]);
    setTimedOut(false);
    setTimeLeft(qs[0]?.timeLimitSec ?? null);
  }

  function start(m: QuizMode) {
    if (m.kind === "custom_range") {
      setMode(m);
      setPhase("range");
      return;
    }
    const snap = loadSnapshot();
    const qs = buildLearningQuiz(m.kind, snap, m.kind === "hardcore" ? 8 : 6);
    beginPlay(m, qs);
  }

  function startCustomRange() {
    if (!mode) return;
    const from = Math.max(1, customFrom);
    const to = Math.max(from, customTo);
    const qs = buildScopedQuiz(customSurah, from, to, 6);
    beginPlay(mode, qs);
  }

  const total = questions.length;
  const q = questions[qIndex];

  // Speed timer
  useEffect(() => {
    if (phase !== "play" || !q?.timeLimitSec || answered) {
      return;
    }
    setTimeLeft(q.timeLimitSec);
    setTimedOut(false);
    const started = Date.now();
    const limit = q.timeLimitSec * 1000;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((limit - (Date.now() - started)) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        window.clearInterval(id);
        setTimedOut(true);
        setAnswered(true);
        setSelected(-1);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, qIndex, q?.id, q?.timeLimitSec, answered]);

  function answer(i: number) {
    if (answered || !q || q.format === "reorder") return;
    setSelected(i);
    setAnswered(true);
    if (i === q.correct) setScore((s) => s + 1);
  }

  function pickReorder(text: string) {
    if (answered || !q?.reorderItems) return;
    if (reorderPicks.includes(text)) return;
    const next = [...reorderPicks, text];
    setReorderPicks(next);
    if (next.length === q.reorderItems.length) {
      setAnswered(true);
      const ok = next.every((t, i) => t === q.reorderItems![i]);
      if (ok) setScore((s) => s + 1);
      setSelected(ok ? 0 : -1);
    }
  }

  function undoReorder() {
    if (answered) return;
    setReorderPicks((p) => p.slice(0, -1));
  }

  function next() {
    if (qIndex >= total - 1) {
      // score already includes current question if answered correctly
      const passedScore = score;
      const threshold = mode ? quizPassThreshold(mode.kind) : 0.6;
      const pct = total > 0 ? passedScore / total : 0;
      try {
        completeSession({
          sessionKind: "quiz",
          planItemId: "quiz_" + (mode?.id || "daily"),
          outcome: pct >= threshold ? "success" : pct >= 0.4 ? "partial" : "fail",
          quality: pct >= 0.8 ? 5 : pct >= threshold ? 4 : 2,
          autoReplan: true,
        });
        recordQuizResult({
          modeId: mode?.id || "daily",
          score: passedScore,
          total,
          perfect: pct >= 1,
          hardcore: !!mode && mode.kind === "hardcore",
        });
        recordActivity();
        bumpStreak();
      } catch {
        /* local soft fail */
      }
      setPhase("result");
      return;
    }
    setQIndex((i) => i + 1);
    setSelected(null);
    setAnswered(false);
    setReorderPicks([]);
    setTimedOut(false);
  }

  const modesByTier = useMemo(() => {
    const map: Record<QuizMode["tier"], QuizMode[]> = {
      easy: [],
      fun: [],
      tactical: [],
      hard: [],
    };
    for (const m of QUIZ_MODES) map[m.tier].push(m);
    return map;
  }, []);

  if (phase === "result" && mode) {
    const finalScore = score;
    const pct = total > 0 ? Math.round((finalScore / total) * 100) : 0;
    const thr = Math.round(quizPassThreshold(mode.kind) * 100);
    const passed = pct >= thr;
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="text-5xl mb-4">
          {pct >= 90 ? "⭐" : passed ? "📖" : "💪"}
        </div>
        <h1 className="text-2xl font-bold">انتهى الاختبار</h1>
        <p className="mt-2 text-muted-foreground">{mode.title}</p>
        <Badge className="mt-2" variant={passed ? "success" : "warning"}>
          {passed ? "ناجح" : "يحتاج تثبيت"} · عتبة {formatArabicNumber(thr)}٪
        </Badge>
        <p className="mt-6 text-4xl font-bold text-primary">
          {formatArabicNumber(finalScore)}/{formatArabicNumber(total)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {formatArabicNumber(pct)}%
        </p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <Button variant="premium" onClick={() => start(mode)}>
            إعادة
          </Button>
          <Button variant="outline" onClick={() => setPhase("select")}>
            أنواع أخرى
          </Button>
          <Button variant="ghost" onClick={exitQuiz}>
            خروج / رجوع
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "play" && mode && q) {
    const isReorder = q.format === "reorder" && q.reorderItems;
    return (
      <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exitQuiz}
            >
              خروج / رجوع
            </Button>
            <div>
              <h1 className="text-xl font-bold">{mode.title}</h1>
              <p className="text-sm text-muted-foreground">
                سؤال {formatArabicNumber(qIndex + 1)} من{" "}
                {formatArabicNumber(total)}
                {q.meta?.source ? (
                  <span className="ms-2 text-[11px] opacity-70">
                    · مصدر:{" "}
                    {q.meta.source === "memory"
                      ? "ذاكرة"
                      : q.meta.source === "mistake"
                        ? "خطأ"
                        : q.meta.source === "progress"
                          ? "تقدم"
                          : q.meta.source === "mutashabih"
                            ? "متشابه"
                            : q.meta.source === "scoped"
                              ? "نطاق"
                              : q.meta.source === "edge"
                                ? "أوائل/أواخر"
                                : "تأسيس"}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {timeLeft !== null && q.timeLimitSec && (
              <Badge
                variant={timeLeft <= 3 ? "danger" : "warning"}
                className="tabular-nums text-sm px-3 py-1"
              >
                ⏱️ {formatArabicNumber(timeLeft)}ث
              </Badge>
            )}
            <Badge>{formatArabicNumber(score)} صحيحة</Badge>
          </div>
        </div>
        <Progress
          value={((qIndex + (answered ? 1 : 0)) / Math.max(1, total)) * 100}
        />

        <Card className={cn(q.hardcore && "border-red-500/30")}>
          <CardHeader>
            <CardTitle className="text-lg">{q.prompt}</CardTitle>
            <CardDescription className="font-quran text-xl text-foreground pt-4 leading-loose">
              {q.ayah}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {isReorder ? (
              <>
                <p className="text-xs text-muted-foreground mb-1">
                  اختر الآيات بالترتيب الصحيح:
                </p>
                {reorderPicks.length > 0 && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1 mb-2">
                    <p className="text-[11px] text-muted-foreground">ترتيبك:</p>
                    {reorderPicks.map((t, i) => (
                      <p key={i} className="font-quran text-sm">
                        {formatArabicNumber(i + 1)}. {t}
                      </p>
                    ))}
                    {!answered && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={undoReorder}
                      >
                        تراجع
                      </Button>
                    )}
                  </div>
                )}
                {q.options
                  .filter((opt) => !reorderPicks.includes(opt))
                  .map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={answered}
                      onClick={() => pickReorder(opt)}
                      className="rounded-xl border px-4 py-3 text-start text-sm transition-all font-quran leading-relaxed hover:bg-accent disabled:opacity-50"
                    >
                      {opt}
                    </button>
                  ))}
                {answered && (
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm",
                      selected === 0
                        ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                        : "bg-red-500/15 text-red-800 dark:text-red-200"
                    )}
                  >
                    {selected === 0
                      ? "✅ ترتيب صحيح"
                      : "❌ الترتيب غير مطابق — راجع الورد"}
                  </div>
                )}
              </>
            ) : (
              q.options.map((opt, i) => {
                const isCorrect = i === q.correct;
                const isPick = selected === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => answer(i)}
                    disabled={answered}
                    className={cn(
                      "min-h-12 sm:min-h-0 rounded-xl border px-3 sm:px-4 py-3 text-start text-sm transition-all font-quran leading-relaxed touch-manipulation break-words",
                      !answered && "hover:bg-accent active:scale-[0.99]",
                      answered &&
                        isCorrect &&
                        "border-emerald-500 bg-emerald-500/10",
                      answered &&
                        isPick &&
                        !isCorrect &&
                        "border-red-500/50 bg-red-500/10",
                      !answered && isPick && "border-primary"
                    )}
                  >
                    {opt}
                  </button>
                );
              })
            )}
            {timedOut && (
              <p className="text-xs text-red-600 dark:text-red-300">
                انتهى الوقت — انتقل للسؤال التالي
              </p>
            )}
            {answered && (
              <Button variant="premium" className="mt-4" onClick={next}>
                {qIndex >= total - 1 ? "النتيجة" : "التالي"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "range" && mode) {
    const surahMeta = SURAHS.find((s) => s.number === customSurah);
    const maxAyah = surahMeta?.ayahCount ?? 286;
    return (
      <div className="mx-auto max-w-md space-y-4 py-8">
        <PageHeader
          title="نطاق مخصص"
          description="اختر السورة والآيات — اختبار فوري على هذا النطاق فقط"
          backHref="/quiz"
        />
        <Card>
          <CardContent className="space-y-3 p-5">
            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">السورة</span>
              <select
                className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
                value={customSurah}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCustomSurah(n);
                  setCustomFrom(1);
                  const meta = SURAHS.find((s) => s.number === n);
                  setCustomTo(Math.min(16, meta?.ayahCount ?? 16));
                }}
              >
                {SURAHS.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground text-xs">من آية</span>
                <input
                  type="number"
                  min={1}
                  max={maxAyah}
                  className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(Number(e.target.value) || 1)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground text-xs">إلى آية</span>
                <input
                  type="number"
                  min={1}
                  max={maxAyah}
                  className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
                  value={customTo}
                  onChange={(e) => setCustomTo(Number(e.target.value) || 1)}
                />
              </label>
            </div>
            <Button
              type="button"
              variant="premium"
              className="w-full"
              onClick={startCustomRange}
            >
              ابدأ الاختبار
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setPhase("select")}
            >
              رجوع
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Hub: pick surah shell + quiz category (no heavy hardcoded banks) ──
  if (phase === "hub") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="الاختبارات"
          description="اختر السورة ونوع الاختبار — بنك الأسئلة يُربط لاحقاً دون تحميل بيانات ١١٤ سورة الآن"
          backHref="/dashboard"
        />

        <Card className="border-[#D4AF37]/25">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">١ · تحديد السورة</CardTitle>
            <CardDescription>
              قائمة السور خفيفة (أسماء فقط) — المحتوى يأتي من قاعدة الاختبارات لاحقاً
            </CardDescription>
          </CardHeader>
          <CardContent>
            <select
              className="flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={customSurah}
              onChange={(e) => setCustomSurah(Number(e.target.value))}
            >
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
            <CardTitle className="text-base">٢ · نوع الاختبار</CardTitle>
            <CardDescription>
              هيكل واجهة فقط — المحرك جاهز للربط بقاعدة البيانات
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {(
              [
                {
                  id: "hifz" as const,
                  title: "حفظ",
                  desc: "تسميع واختبار آيات",
                  icon: "📖",
                },
                {
                  id: "meanings" as const,
                  title: "معاني آيات",
                  desc: "فهم المعاني والسياق",
                  icon: "💡",
                },
                {
                  id: "religious" as const,
                  title: "أسئلة دينية",
                  desc: "معرفة عامة مرتبطة بالسورة",
                  icon: "🕌",
                },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategory(c.id);
                  setPhase("select");
                }}
                className={cn(
                  "rounded-2xl border p-4 text-start transition-all touch-manipulation",
                  "hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5",
                  category === c.id && "border-[#D4AF37] bg-[#D4AF37]/10"
                )}
              >
                <div className="text-2xl mb-2">{c.icon}</div>
                <p className="font-semibold text-sm">{c.title}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {c.desc}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {poolHint}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl min-w-0 space-y-6 sm:space-y-8">
      <PageHeader
        title={
          category === "meanings"
            ? "اختبار معاني"
            : category === "religious"
              ? "أسئلة دينية"
              : "اختبار حفظ"
        }
        description={
          "سورة " +
          (SURAHS.find((s) => s.number === customSurah)?.nameAr || "") +
          " — " +
          poolHint
        }
        backHref="/quiz"
      />
      <div className="flex justify-start">
        <Button type="button" variant="outline" size="sm" onClick={exitQuiz}>
          خروج / رجوع
        </Button>
      </div>
      {category !== "hifz" && category !== null && (
        <Card className="border-dashed border-[#D4AF37]/30">
          <CardContent className="p-5 text-sm text-muted-foreground leading-relaxed">
            واجهة «{category === "meanings" ? "معاني الآيات" : "الأسئلة الدينية"}»
            جاهزة. بنك الأسئلة سيُربط بقاعدة البيانات لاحقاً — يمكنك استخدام
            مسارات الحفظ التفاعلية أدناه كمحرك مؤقت.
          </CardContent>
        </Card>
      )}
      {(["easy", "fun", "tactical", "hard"] as const).map((tier) => {
        const list = modesByTier[tier];
        if (!list.length) return null;
        return (
          <section key={tier} className="space-y-3 min-w-0">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full shrink-0",
                  tier === "easy" && "bg-emerald-500",
                  tier === "fun" && "bg-sky-500",
                  tier === "tactical" && "bg-amber-500",
                  tier === "hard" && "bg-red-500"
                )}
              />
              {TIER_LABEL[tier]}
            </h2>
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((m) => (
                <Card
                  key={m.id}
                  className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 active:scale-[0.99] touch-manipulation"
                  onClick={() => start(m)}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-2xl mb-2 sm:mb-3">{m.icon}</div>
                      <Badge variant="muted" className="text-[10px] shrink-0">
                        {TIER_LABEL[m.tier]}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm sm:text-base">
                      {m.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {m.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
