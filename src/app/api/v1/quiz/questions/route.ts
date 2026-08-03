import { NextRequest, NextResponse } from "next/server";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import fs from "fs";
import path from "path";

/**
 * GET /api/v1/quiz/questions?category=hifz&surah=2&limit=20
 * Prefers Prisma bank; falls back to data/quiz-bank.json (local-first).
 */

type BankQ = {
  id: string;
  type: string;
  prompt: string;
  contextAr?: string;
  answer: string;
  explanationAr?: string;
  category?: string;
  surahNumber?: number;
  difficulty?: number;
  source?: string;
  options?: { key: string; text: string }[];
};

function loadJsonBank(): {
  categories: { slug: string; nameAr: string; descriptionAr?: string }[];
  questions: BankQ[];
} | null {
  try {
    const p = path.join(process.cwd(), "data", "quiz-bank.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || undefined;
  const surah = searchParams.get("surah")
    ? Number(searchParams.get("surah"))
    : undefined;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));

  // ── DB path (models may be missing until prisma generate + db push) ──
  if (isDatabaseConfigured() && prisma) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = prisma as any;
      if (typeof db.question?.findMany === "function") {
        const rows = await db.question.findMany({
          where: {
            ...(category ? { category: { slug: category } } : {}),
            ...(surah && surah >= 1 && surah <= 114
              ? { surahNumber: surah }
              : {}),
          },
          include: {
            options: { orderBy: { sortOrder: "asc" } },
            category: true,
          },
          take: Math.min(500, limit * 5),
          orderBy: { id: "asc" },
        });

        if (rows.length > 0) {
          const shuffled = [...rows]
            .sort(() => Math.random() - 0.5)
            .slice(0, limit);
          const questions = shuffled.map(
            (q: {
              id: string;
              type: string;
              prompt: string;
              contextAr: string | null;
              answer: string;
              explanationAr: string | null;
              surahNumber: number | null;
              source: string | null;
              difficulty: number;
              options: { key: string; text: string }[];
              category: { slug: string };
            }) => ({
              id: q.id,
              type: q.type as "mcq" | "fill_blank" | "true_false",
              prompt: q.prompt,
              contextAr: q.contextAr || undefined,
              answer: q.answer,
              explanationAr: q.explanationAr || undefined,
              choices: q.options.map((o) => ({ id: o.key, text: o.text })),
              meta: {
                surahNumber: q.surahNumber ?? undefined,
                source: q.source || undefined,
                difficulty: q.difficulty,
                category: q.category.slug,
              },
            })
          );

          return NextResponse.json({
            ok: true,
            source: "database",
            count: questions.length,
            questions,
          });
        }
      }
    } catch (e) {
      console.error("[quiz/questions] db", e);
    }
  }

  // ── JSON fallback (works offline / without seed) ─────────────────────
  const bank = loadJsonBank();
  if (!bank?.questions?.length) {
    return NextResponse.json(
      { ok: false, error: "no_quiz_bank", questions: [] },
      { status: 404 }
    );
  }

  let list = bank.questions;
  if (category) list = list.filter((q) => q.category === category);
  if (surah && surah >= 1)
    list = list.filter((q) => !q.surahNumber || q.surahNumber === surah);

  const shuffled = [...list].sort(() => Math.random() - 0.5).slice(0, limit);
  const questions = shuffled.map((q) => ({
    id: q.id,
    type: q.type as "mcq" | "fill_blank" | "true_false",
    prompt: q.prompt,
    contextAr: q.contextAr,
    answer: q.answer,
    explanationAr: q.explanationAr,
    choices: (q.options || []).map((o) => ({ id: o.key, text: o.text })),
    meta: {
      surahNumber: q.surahNumber,
      source: q.source,
      difficulty: q.difficulty,
      category: q.category,
    },
  }));

  return NextResponse.json({
    ok: true,
    source: "json-bank",
    count: questions.length,
    totalInBank: bank.questions.length,
    questions,
  });
}
