"use client";

/**
 * Dynamic Quiz Hub — UI shell ready for external JSON/API banks.
 * Demo payload illustrates MCQ + fill_blank without inventing a 114-surah hardcode.
 */

import { useMemo, useState } from "react";
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

type Phase = "hub" | "play";
type Category = "hifz" | "meanings" | "religious";

/**
 * Placeholder samples only — real banks arrive via JSON/API later.
 * Structure matches DynamicQuizPayload exactly.
 */
function buildDemoQuiz(
  category: Category,
  surahNumber: number
): DynamicQuizPayload {
  const name =
    SURAHS.find((s) => s.number === surahNumber)?.nameAr ||
    String(surahNumber);
  if (category === "meanings") {
    return {
      id: `demo_meanings_${surahNumber}`,
      titleAr: `معاني — ${name}`,
      descriptionAr: "نموذج واجهة — يُستبدل ببنك خارجي",
      category: "meanings",
      surahNumber,
      questions: [
        {
          id: "m1",
          type: "mcq",
          prompt: "ما المقصود بـ «ربّ العالمين»؟ (نموذج واجهة)",
          choices: [
            { id: "a", text: "خالق ومالك جميع المخلوقات" },
            { id: "b", text: "رب قريش فقط" },
            { id: "c", text: "اسم سورة" },
            { id: "d", text: "لا معنى محدد" },
          ],
          answer: "a",
          explanationAr: "سؤال توضيحي لهيكل الواجهة — ليس بنكاً نهائياً.",
          meta: { surahNumber, source: "demo-json" },
        },
        {
          id: "m2",
          type: "fill_blank",
          prompt: "أكمل: الحمد لله ___ العالمين (نموذج)",
          answer: "رب",
          meta: { surahNumber, source: "demo-json" },
        },
      ],
    };
  }
  if (category === "religious") {
    return {
      id: `demo_rel_${surahNumber}`,
      titleAr: `أسئلة دينية — ${name}`,
      category: "religious",
      surahNumber,
      questions: [
        {
          id: "r1",
          type: "true_false",
          prompt: "قراءة الفاتحة ركن من أركان الصلاة. (نموذج واجهة)",
          choices: [
            { id: "t", text: "صحيح" },
            { id: "f", text: "خطأ" },
          ],
          answer: "t",
          meta: { source: "demo-json" },
        },
      ],
    };
  }
  // hifz
  return {
    id: `demo_hifz_${surahNumber}`,
    titleAr: `حفظ — ${name}`,
    descriptionAr: "محرك ديناميكي جاهز لسحب أسئلة JSON/API",
    category: "hifz",
    surahNumber,
    questions: [
      {
        id: "h1",
        type: "mcq",
        prompt: "ما الآية الأولى من السورة المحددة؟ (نموذج — سيُستبدل)",
        contextAr: "…",
        choices: [
          { id: "a", text: "بسم الله الرحمن الرحيم / أو فاتحة السورة" },
          { id: "b", text: "خيار توضيحي ٢" },
          { id: "c", text: "خيار توضيحي ٣" },
          { id: "d", text: "خيار توضيحي ٤" },
        ],
        answer: "a",
        meta: { surahNumber, source: "demo-json" },
      },
      {
        id: "h2",
        type: "fill_blank",
        prompt: "أكمل مطلع السورة (نموذج واجهة — فارغ حتى يُربط الـ API)",
        answer: "",
        meta: { surahNumber, source: "demo-json" },
      },
    ],
  };
}

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("hub");
  const [surah, setSurah] = useState(1);
  const [category, setCategory] = useState<Category>("hifz");
  const [active, setActive] = useState<DynamicQuizPayload | null>(null);

  const categories = useMemo(
    () =>
      [
        {
          id: "hifz" as const,
          title: "حفظ",
          desc: "أسئلة تسميع/آيات من بنك خارجي",
          icon: "📖",
        },
        {
          id: "meanings" as const,
          title: "معاني آيات",
          desc: "فهم وتفسير — من JSON/API",
          icon: "💡",
        },
        {
          id: "religious" as const,
          title: "أسئلة دينية",
          desc: "معرفة مرتبطة بالسورة",
          icon: "🕌",
        },
      ] as const,
    []
  );

  function startDemo() {
    const quiz = buildDemoQuiz(category, surah);
    setActive(quiz);
    setPhase("play");
  }

  function exit() {
    setPhase("hub");
    setActive(null);
  }

  if (phase === "play" && active) {
    return (
      <div className="py-4">
        <DynamicQuizPlayer quiz={active} onExit={exit} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="الاختبارات"
        description="محرك واجهات مرن — يسحب الأسئلة من JSON/API لاحقاً دون اختراع بنك داخلي لـ ١١٤ سورة"
        backHref="/dashboard"
      />

      <Card className="border-[#D4AF37]/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">١ · السورة</CardTitle>
          <CardDescription>
            أسماء فقط — المحتوى يأتي من مصدر الاختبارات الخارجي
          </CardDescription>
        </CardHeader>
        <CardContent>
          <select
            className="flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
            value={surah}
            onChange={(e) => setSurah(Number(e.target.value))}
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
            الواجهة تدعم: اختيار من متعدد · أكمل الفراغ · صح/خطأ
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {categories.map((c) => (
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
              <p className="text-[11px] text-muted-foreground mt-1">{c.desc}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="border-dashed border-[#D4AF37]/30">
        <CardContent className="p-4 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">للمطورين:</strong> حمّل{" "}
          <code className="text-[10px]">DynamicQuizPayload</code> من API/JSON
          ثم مرّره إلى{" "}
          <code className="text-[10px]">DynamicQuizPlayer</code>. الزر أدناه
          يشغّل عينة توضيحية للواجهة فقط.
        </CardContent>
      </Card>

      <Button
        type="button"
        variant="premium"
        className="w-full h-12"
        onClick={startDemo}
      >
        فتح واجهة الاختبار (عينة ديناميكية)
      </Button>
    </div>
  );
}
