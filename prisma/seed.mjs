/**
 * Seed QuizCategory / Question / QuestionOption from data/quiz-bank.json
 * Usage: node prisma/seed.mjs
 * Requires DATABASE_URL and tables (prisma db push).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const bankPath = path.join(root, "data", "quiz-bank.json");

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — skip DB seed (JSON bank still available).");
    process.exit(0);
  }
  if (!fs.existsSync(bankPath)) {
    console.error("Run: node scripts/build-quiz-bank.mjs first");
    process.exit(1);
  }

  const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
  console.log(`Seeding ${bank.questions?.length || 0} questions…`);

  // Wipe existing bank (idempotent reseed)
  await prisma.questionOption.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.quizCategory.deleteMany({});

  const catMap = new Map();
  for (const [i, c] of (bank.categories || []).entries()) {
    const row = await prisma.quizCategory.create({
      data: {
        slug: c.slug,
        nameAr: c.nameAr,
        descriptionAr: c.descriptionAr || null,
        sortOrder: i,
      },
    });
    catMap.set(c.slug, row.id);
  }

  // Fallback category
  if (!catMap.has("hifz")) {
    const row = await prisma.quizCategory.create({
      data: { slug: "hifz", nameAr: "حفظ", sortOrder: 0 },
    });
    catMap.set("hifz", row.id);
  }

  let created = 0;
  const batch = bank.questions || [];
  for (const q of batch) {
    const categoryId =
      catMap.get(q.category || "hifz") || catMap.get("hifz");
    const question = await prisma.question.create({
      data: {
        categoryId,
        type: q.type || "mcq",
        prompt: q.prompt,
        contextAr: q.contextAr || null,
        answer: String(q.answer ?? ""),
        explanationAr: q.explanationAr || null,
        surahNumber: q.surahNumber ?? null,
        ayahNumber: q.ayahNumber ?? null,
        difficulty: q.difficulty ?? 1,
        source: q.source || "seed",
        options: q.options?.length
          ? {
              create: q.options.map((o, i) => ({
                key: o.key,
                text: o.text,
                sortOrder: i,
              })),
            }
          : undefined,
      },
    });
    created++;
    if (created % 100 === 0) console.log(`  … ${created}`);
  }

  console.log(`Done. Seeded ${created} questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
