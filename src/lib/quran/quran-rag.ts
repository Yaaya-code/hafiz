/**
 * Free Quran RAG layer — retrieves from local databases before answering.
 * No paid API. Used by the free teacher + pluggable LLM providers.
 */

import { getSurah, getSurahAyahs, getAyah, SURAHS } from "@/lib/quran";
import { MUTASHABIHAT_DB } from "@/lib/quran/mutashabihat-db";
import { quranNormalize } from "@/lib/quran/quran-phonetic";

export type RagChunk = {
  id: string;
  kind: "ayah" | "meaning" | "mutashabih" | "surah_meta" | "tip";
  surahNumber: number;
  ayahNumber?: number;
  title: string;
  text: string;
  score: number;
};

export type RagQueryContext = {
  surahNumber: number;
  focusAyah?: number;
  fromAyah?: number;
  toAyah?: number;
  meanings?: Record<number, string>;
  lastCompletedAyah?: number;
};

function scoreText(query: string, text: string): number {
  const q = quranNormalize(query);
  const t = quranNormalize(text);
  if (!q || !t) return 0;
  let score = 0;
  if (t.includes(q)) score += 10;
  const qWords = q.split(" ").filter((w) => w.length > 2);
  for (const w of qWords) {
    if (t.includes(w)) score += 2;
  }
  return score;
}

/**
 * Retrieve relevant Quran knowledge for a user question + session context.
 */
export function retrieveQuranKnowledge(
  question: string,
  ctx: RagQueryContext,
  limit = 12
): RagChunk[] {
  const chunks: RagChunk[] = [];
  const surah = getSurah(ctx.surahNumber);
  const from = ctx.fromAyah || 1;
  const to = ctx.toAyah || surah?.ayahCount || 1;
  const focus = ctx.focusAyah;

  // Surah meta always
  if (surah) {
    chunks.push({
      id: "meta-" + surah.number,
      kind: "surah_meta",
      surahNumber: surah.number,
      title: "معلومات السورة",
      text:
        "سورة " +
        surah.nameAr +
        " (" +
        surah.nameEn +
        ") · " +
        (surah.revelationType === "Meccan" ? "مكية" : "مدنية") +
        " · " +
        surah.ayahCount +
        " آية · جزء ~" +
        surah.startJuz +
        " · نطاق الجلسة " +
        from +
        "–" +
        to +
        (ctx.lastCompletedAyah
          ? " · آخر آية مكتملة في التلاوة: " + ctx.lastCompletedAyah
          : ""),
      score: 5,
    });
  }

  // Focus ayah priority
  if (focus) {
    const a = getAyah(ctx.surahNumber, focus);
    chunks.push({
      id: "ayah-" + focus,
      kind: "ayah",
      surahNumber: ctx.surahNumber,
      ayahNumber: focus,
      title: "الآية الحالية " + focus,
      text: a.text,
      score: 20,
    });
    const m = ctx.meanings?.[focus];
    if (m) {
      chunks.push({
        id: "mean-" + focus,
        kind: "meaning",
        surahNumber: ctx.surahNumber,
        ayahNumber: focus,
        title: "معنى آية " + focus,
        text: m,
        score: 18,
      });
    }
  }

  // Score ayahs in range against question
  const ayahs = getSurahAyahs(ctx.surahNumber).filter(
    (a) => a.ayahNumber >= from && a.ayahNumber <= to
  );
  for (const a of ayahs) {
    let sc = scoreText(question, a.text);
    if (ctx.meanings?.[a.ayahNumber]) {
      sc += scoreText(question, ctx.meanings[a.ayahNumber]);
    }
    if (a.ayahNumber === focus) sc += 5;
    if (sc > 0 || a.ayahNumber === focus) {
      chunks.push({
        id: "a-" + a.ayahNumber,
        kind: "ayah",
        surahNumber: ctx.surahNumber,
        ayahNumber: a.ayahNumber,
        title: "آية " + a.ayahNumber,
        text: a.text,
        score: sc || 1,
      });
      if (ctx.meanings?.[a.ayahNumber]) {
        chunks.push({
          id: "m-" + a.ayahNumber,
          kind: "meaning",
          surahNumber: ctx.surahNumber,
          ayahNumber: a.ayahNumber,
          title: "معنى " + a.ayahNumber,
          text: ctx.meanings[a.ayahNumber],
          score: (sc || 1) + 1,
        });
      }
    }
  }

  // Always include a few sample ayahs if nothing scored
  if (chunks.filter((c) => c.kind === "ayah").length < 2) {
    for (const a of ayahs.slice(0, 5)) {
      chunks.push({
        id: "sample-" + a.ayahNumber,
        kind: "ayah",
        surahNumber: ctx.surahNumber,
        ayahNumber: a.ayahNumber,
        title: "آية " + a.ayahNumber,
        text: a.text,
        score: 2,
      });
      if (ctx.meanings?.[a.ayahNumber]) {
        chunks.push({
          id: "ms-" + a.ayahNumber,
          kind: "meaning",
          surahNumber: ctx.surahNumber,
          ayahNumber: a.ayahNumber,
          title: "معنى " + a.ayahNumber,
          text: ctx.meanings[a.ayahNumber],
          score: 2,
        });
      }
    }
  }

  // Mutashabihat
  for (const g of MUTASHABIHAT_DB) {
    if (!g.ayahs.some((a) => a.surahNumber === ctx.surahNumber)) continue;
    const refs = g.ayahs
      .map((a) => a.surahName + ":" + a.ayahNumber)
      .join(" · ");
    const body =
      refs +
      "\n" +
      (g.differenceExplain || "") +
      "\n" +
      (g.tips || []).join(" · ");
    let sc = 4 + scoreText(question, body + g.title);
    if (focus && g.ayahs.some((a) => a.ayahNumber === focus)) sc += 8;
    chunks.push({
      id: "mut-" + g.id,
      kind: "mutashabih",
      surahNumber: ctx.surahNumber,
      title: g.title,
      text: body,
      score: sc,
    });
  }

  // Tips chunk
  chunks.push({
    id: "tip-general",
    kind: "tip",
    surahNumber: ctx.surahNumber,
    title: "منهج الحفظ",
    text:
      "استمع ثم أعد غيباً، اربط المعنى باللفظ، راجع المتشابهات، ولا تقطع كلمة المد. ابدأ غداً من موضع الضعف لا من أول السورة دائماً.",
    score: scoreText(question, "حفظ نصيحة تثبيت مراجعة") || 1,
  });

  // Deduplicate by id, sort by score
  const byId = new Map<string, RagChunk>();
  for (const c of chunks) {
    const prev = byId.get(c.id);
    if (!prev || c.score > prev.score) byId.set(c.id, c);
  }

  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Build a grounded context string for any LLM (local or remote).
 */
export function formatRagContext(chunks: RagChunk[]): string {
  return chunks
    .map(
      (c) =>
        "[" +
        c.kind +
        (c.ayahNumber != null ? " ayah=" + c.ayahNumber : "") +
        "] " +
        c.title +
        "\n" +
        c.text
    )
    .join("\n\n---\n\n");
}

export function detectIntent(question: string): string {
  const q = question.trim();
  // Smalltalk / general conversation first — never force Quran dump
  if (
    /^(hi|hello|hey|how are you|how's it going|good morning|good evening)\b/i.test(
      q
    ) ||
    /كيف حالك|كيفك|شلونك|أخبارك|عامل ايه|ازيك|مرحبا|السلام عليكم|أهلا|هاي|هلو/i.test(
      q
    ) ||
    /who are you|what can you do|ماذا تستطيع|من أنت|مين انت/i.test(q) ||
    /thank|شكرا|جزاك|thanks/i.test(q) ||
    /bye|مع السلامة|وداعا/i.test(q)
  ) {
    return "smalltalk";
  }
  if (/اختبار|اسألني|اختبر|quiz/i.test(q)) return "quiz";
  if (/متشابه|خلط|mutashabih/i.test(q)) return "mutashabih";
  if (/لخّص|لخص|ملخص|موضوع/i.test(q)) return "summary";
  if (/درس|عبرة|فائدة|lesson/i.test(q)) return "lessons";
  if (/نصيحة|حفظ|كيف أحفظ|طريقة/i.test(q)) return "tips";
  if (/كلمة|مفرد|صعب/i.test(q)) return "words";
  if (/معنى|اشرح|فسر|وضح|explain|meaning/i.test(q)) return "explain";
  if (/صلات|ربط|سور أخرى/i.test(q)) return "connections";
  // Quran-related loose
  if (
    /قرآن|سور|آية|ايه|حفظ|تلاوة|تجويد|quran|ayah|surah/i.test(q)
  ) {
    return "general";
  }
  // Unknown non-Quran chat
  if (q.length < 80 && !/\d/.test(q)) return "smalltalk";
  return "general";
}

export function findSurahMention(question: string): number | null {
  for (const s of SURAHS) {
    if (question.includes(s.nameAr)) return s.number;
  }
  return null;
}
