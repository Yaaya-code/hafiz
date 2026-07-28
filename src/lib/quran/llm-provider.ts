/**
 * Pluggable free-first LLM layer.
 *
 * Priority:
 * 1) FREE local RAG synthesizer (always available, no key)
 * 2) Optional Ollama (http://localhost:11434) if running — free self-hosted
 * 3) Optional paid providers later via env (never required)
 *
 * Swap providers without changing the UI.
 */

import {
  detectIntent,
  formatRagContext,
  retrieveQuranKnowledge,
  type RagChunk,
  type RagQueryContext,
} from "./quran-rag";
import { getAyah, getSurah, getSurahAyahs } from "@/lib/quran";

export type LlmMessage = { role: "user" | "assistant" | "system"; content: string };

export type LlmChatInput = {
  messages: LlmMessage[];
  context: RagQueryContext;
};

export type LlmChatResult = {
  content: string;
  source: "free-rag" | "ollama" | "xai" | "openai-compatible";
  chunksUsed: number;
};

/**
 * FREE RAG synthesizer — natural Arabic answers from retrieved chunks only.
 * Not keyword templates: builds multi-paragraph teacher-style answers from data.
 */
export function freeRagAnswer(
  question: string,
  ctx: RagQueryContext,
  history: LlmMessage[] = []
): LlmChatResult {
  const chunks = retrieveQuranKnowledge(question, ctx, 14);
  const intent = detectIntent(question);
  const surah = getSurah(ctx.surahNumber);
  const name = surah?.nameAr || "السورة";
  const focus =
    ctx.focusAyah ||
    (() => {
      const m = question.match(/(?:آية|ايه)\s*(\d+)/i);
      return m ? Number(m[1]) : undefined;
    })();

  const ayahChunks = chunks.filter((c) => c.kind === "ayah");
  const meaningChunks = chunks.filter((c) => c.kind === "meaning");
  const mutChunks = chunks.filter((c) => c.kind === "mutashabih");
  const meta = chunks.find((c) => c.kind === "surah_meta");

  // Follow-up resolution from history
  let resolvedFocus = focus;
  if (!resolvedFocus && /هذه|هذي|نفس|أكثر|وضح/i.test(question)) {
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i].content.match(/آية\s*(\d+)/);
      if (m) {
        resolvedFocus = Number(m[1]);
        break;
      }
    }
  }
  if (!resolvedFocus) resolvedFocus = ctx.focusAyah || ctx.fromAyah || 1;

  let content = "";

  if (intent === "smalltalk") {
    content = synthesizeSmalltalk(question, name);
  } else if (intent === "explain" || /معنى|اشرح|فسر/i.test(question)) {
    const n = resolvedFocus!;
    const a =
      ayahChunks.find((c) => c.ayahNumber === n) ||
      ({
        text: getAyah(ctx.surahNumber, n).text,
        ayahNumber: n,
      } as RagChunk);
    const mean =
      meaningChunks.find((c) => c.ayahNumber === n)?.text ||
      ctx.meanings?.[n];
    content = synthesizeExplain(name, n, a.text, mean, mutChunks);
  } else if (intent === "summary") {
    content = synthesizeSummary(name, meta?.text, ayahChunks, meaningChunks, surah);
  } else if (intent === "lessons") {
    content = synthesizeLessons(name, meaningChunks, ayahChunks);
  } else if (intent === "mutashabih") {
    content = synthesizeMutashabihat(name, mutChunks, resolvedFocus);
  } else if (intent === "tips") {
    content = synthesizeTips(name, resolvedFocus, ctx.lastCompletedAyah);
  } else if (intent === "quiz") {
    content = synthesizeQuiz(ctx);
  } else if (intent === "words") {
    content = synthesizeWords(name, resolvedFocus!, ctx);
  } else if (intent === "connections") {
    content = synthesizeMutashabihat(name, mutChunks, undefined);
  } else {
    // General: blend top chunks into a conversational answer
    content = synthesizeGeneral(question, name, resolvedFocus, chunks);
  }

  return {
    content,
    source: "free-rag",
    chunksUsed: chunks.length,
  };
}

function synthesizeSmalltalk(question: string, surahName: string): string {
  if (/how are you|كيف حالك|كيفك|شلونك|عامل ايه|ازيك/i.test(question)) {
    return (
      "الحمد لله، بخير — أنا هنا معك في رحلتك مع القرآن" +
      (surahName ? " (سورة " + surahName + " الآن)" : "") +
      ".\nكيف يمكنني مساعدتك؟ شرح آية، متشابهات، نصيحة حفظ، أو اختبار؟"
    );
  }
  if (/السلام|مرحبا|hello|hi\b|أهلا|هاي/i.test(question)) {
    return (
      "وعليكم السلام ورحمة الله. أهلاً بك. نراجع معاً سورة " +
      surahName +
      " إن أحببت — أو اسألني أي سؤال."
    );
  }
  if (/thank|شكرا|جزاك/i.test(question)) {
    return "وإياك. وفّقك الله في حفظك. هل نكمل آية أخرى أو اختباراً سريعاً؟";
  }
  if (/bye|مع السلامة|وداعا/i.test(question)) {
    return "مع السلامة. ثبّت ما حفظت اليوم، وأراك في الجلسة القادمة إن شاء الله.";
  }
  if (/who are you|من أنت|ماذا تستطيع|what can you/i.test(question)) {
    return (
      "أنا مساعدك المجاني في تطبيق حافظ: أشرح الآيات من قاعدة القرآن والمعاني والمتشابهات داخل التطبيق، وأرافقك في التلاوة.\nلا أحتاج اشتراكاً. اسألني بحرية."
    );
  }
  // Generic short chat that isn't Quran-forced dump
  return (
    "سمعتك. " +
    (surahName
      ? "إن كان سؤالك عن سورة " + surahName + " فأنا جاهز. "
      : "") +
    "يمكنك أيضاً أن تسألني عن معنى آية، متشابهات، أو تقول «اختبرني»."
  );
}

function synthesizeExplain(
  name: string,
  n: number,
  text: string,
  meaning: string | undefined,
  mut: RagChunk[]
): string {
  const lines = [
    "حسناً — نتوقف عند آية " + n + " من سورة " + name + ".",
    "",
    "﴿ " + text + " ﴾",
    "",
  ];
  if (meaning) {
    lines.push(
      "المعنى الذي يهمّك كحافظ: " + meaning,
      "",
      "اربط هذا المعنى بصورة واحدة في ذهنك قبل أن تغيب عن النظر؛ الفهم يثبّت اللفظ أكثر من التكرار الأجوف."
    );
  } else {
    lines.push(
      "المعنى الميسّر يُحمَّل في صفحة المراجعة تحت الآية. اقرأ اللفظ بتمهل ولاحظ ما قبله وما بعده في السورة."
    );
  }
  const related = mut.slice(0, 2);
  if (related.length) {
    lines.push(
      "",
      "ولهذه الآية/السورة مواضع قد تُخلط معها:",
      ...related.map((m) => "• " + m.title + ": " + m.text.slice(0, 120))
    );
  }
  lines.push("", "هل تريد أن نربطها بالآية التالية، أو نتمرّن عليها باختبار سريع؟");
  return lines.join("\n");
}

function synthesizeSummary(
  name: string,
  meta: string | undefined,
  ayahs: RagChunk[],
  meanings: RagChunk[],
  surah: ReturnType<typeof getSurah>
): string {
  const lines = [
    "سورة " + name + " بإيجاز للحافظ:",
    meta || "",
    "",
    "مقاطع تمثّل روح السورة:",
  ];
  const picks = ayahs.slice(0, 4);
  for (const a of picks) {
    const m = meanings.find((x) => x.ayahNumber === a.ayahNumber);
    lines.push(
      "• آية " +
        a.ayahNumber +
        ": " +
        (m ? m.text.slice(0, 110) : a.text.slice(0, 60) + "…")
    );
  }
  lines.push(
    "",
    "اقترح عليك تقسيم " +
      (surah?.ayahCount || "") +
      " آية إلى مقاطع يومية ثابتة، ومراجعة آخر مقطع قبل النوم.",
    "هل تريد دروساً عملية أم متشابهات هذه السورة؟"
  );
  return lines.filter(Boolean).join("\n");
}

function synthesizeLessons(
  name: string,
  meanings: RagChunk[],
  ayahs: RagChunk[]
): string {
  const lines = ["من سورة " + name + "، هذه إشارات عملية للحافظ:", ""];
  const src = meanings.length ? meanings : ayahs;
  for (const c of src.slice(0, 4)) {
    lines.push(
      "• " +
        (c.ayahNumber ? "آية " + c.ayahNumber + ": " : "") +
        c.text.slice(0, 130) +
        (c.text.length > 130 ? "…" : "")
    );
  }
  lines.push(
    "",
    "اجعل كل مقطع تحفظه مربوطاً بدرس واحد فقط — يسهل الاسترجاع عند النسيان.",
    "أي مقطع تريد أن نثبّته معاً الآن؟"
  );
  return lines.join("\n");
}

function synthesizeMutashabihat(
  name: string,
  mut: RagChunk[],
  focus?: number
): string {
  if (!mut.length) {
    return (
      "في قاعدة المتشابهات المحلية لم أجد مجموعات مخصّصة لسورة " +
      name +
      (focus ? " حول آية " + focus : "") +
      ".\nيمكنك رغم ذلك مقارنة خواتيم الآيات المتشابهة صوتياً عند المراجعة."
    );
  }
  return [
    "متشابهات تهمّ حافظ سورة " + name + ":",
    "",
    ...mut.slice(0, 6).map((m, i) => i + 1 + ") " + m.title + "\n" + m.text),
    "",
    "احفظ الضابط قبل أن تُثبّت المقطع. هل تريد اختباراً يركّز على هذه المواضع؟",
  ].join("\n");
}

function synthesizeTips(
  name: string,
  focus?: number,
  lastCompleted?: number
): string {
  return [
    "خطة حفظ عملية لسورة " + name + ":",
    "",
    "1) استمع للآية ثلاث مرات ثم أعدها غيباً.",
    "2) اقرأ المعنى المختصر مرة قبل التثبيت.",
    "3) المدّ جزء من الكلمة — لا تفصلها ذهنياً أثناء التلاوة.",
    "4) راجع المتشابهات في نفس اليوم.",
    lastCompleted
      ? "5) توقفت سابقاً عند الآية " +
        lastCompleted +
        " — ابدأ الغد من " +
        (lastCompleted + 1) +
        " بعد مراجعة سريعة لما قبلها."
      : "5) ابدأ كل جلسة بمراجعة آخر ما حفظت أمس.",
    focus ? "6) آية " + focus + " هي محور جلستك الآن — كرّرها حتى تطمئن." : "",
    "",
    "قل «اختبرني» لتمرين فوري من السورة.",
  ]
    .filter(Boolean)
    .join("\n");
}

function synthesizeQuiz(ctx: RagQueryContext): string {
  const surah = getSurah(ctx.surahNumber);
  const from = ctx.fromAyah || 1;
  const to = ctx.toAyah || surah?.ayahCount || 1;
  const ayahs = getSurahAyahs(ctx.surahNumber).filter(
    (a) => a.ayahNumber >= from && a.ayahNumber <= to
  );
  if (ayahs.length < 2) {
    return "النطاق ضيق لبناء اختبار. أكمل مراجعة آيات أكثر ثم أعد الطلب.";
  }
  const pick = ayahs[Math.floor(Math.random() * ayahs.length)];
  const wrong = ayahs.find((a) => a.ayahNumber !== pick.ayahNumber) || ayahs[0];
  const words = pick.text.split(/\s+/).filter(Boolean);
  const bi = Math.min(words.length - 1, Math.floor(words.length / 2));
  const blanked = words.map((w, i) => (i === bi ? "……" : w)).join(" ");
  return [
    "اختبار من " + (surah?.nameAr || "") + " — أجب أولاً ثم انظر الإجابات:",
    "",
    "١) أكمل: " + blanked,
    "٢) أي النص لآية " + pick.ayahNumber + "؟",
    "   أ) " + pick.text,
    "   ب) " + wrong.text,
    "٣) ما رقم الآية التي تبدأ: «" +
      words.slice(0, Math.min(3, words.length)).join(" ") +
      "»؟",
    "",
    "الإجابات: ١) " +
      words[bi] +
      " · ٢) أ · ٣) " +
      pick.ayahNumber,
  ].join("\n");
}

function synthesizeWords(
  name: string,
  n: number,
  ctx: RagQueryContext
): string {
  const a = getAyah(ctx.surahNumber, n);
  const words = a.text
    .split(/\s+/)
    .filter((w) => w.replace(/[^\u0600-\u06FF]/g, "").length >= 4)
    .slice(0, 5);
  return [
    "كلمات للتركيز في آية " + n + " من " + name + ":",
    "﴿ " + a.text + " ﴾",
    ctx.meanings?.[n] ? "المعنى: " + ctx.meanings[n] : "",
    "",
    ...words.map((w) => "• " + w),
    "",
    "أعد كل كلمة ضمن الآية كاملة لا منفردة فقط.",
  ]
    .filter(Boolean)
    .join("\n");
}

function synthesizeGeneral(
  question: string,
  name: string,
  focus: number | undefined,
  chunks: RagChunk[]
): string {
  const top = chunks.slice(0, 5);
  const lines = [
    "سؤالك عن سورة " + name + ": «" + question + "»",
    "",
    "مما في قاعدة القرآن عندنا:",
  ];
  for (const c of top) {
    lines.push(
      "• (" +
        c.kind +
        (c.ayahNumber != null ? " · آية " + c.ayahNumber : "") +
        ") " +
        c.text.slice(0, 160) +
        (c.text.length > 160 ? "…" : "")
    );
  }
  if (focus) {
    lines.push(
      "",
      "وبما أن تركيزك على آية " +
        focus +
        "، يمكنك أن تقول: «اشرح آية " +
        focus +
        "» لأفصّل لك."
    );
  }
  lines.push(
    "",
    "هذا المساعد مجاني ويعتمد على نص المصحف والمعاني والمتشابهات داخل حافظ — اسأل بأي صياغة."
  );
  return lines.join("\n");
}

/** Optional: Ollama local free model */
async function tryOllama(
  system: string,
  messages: LlmMessage[]
): Promise<string | null> {
  if (process.env.OLLAMA_DISABLED === "1") return null;
  const base = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.2";
  try {
    const res = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      message?: { content?: string };
    };
    return data.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Main entry: free RAG first; try Ollama if available; never requires paid API.
 */
export async function chatWithTeacher(
  input: LlmChatInput
): Promise<LlmChatResult> {
  const lastUser = [...input.messages]
    .reverse()
    .find((m) => m.role === "user");
  const question = lastUser?.content || "";
  const chunks = retrieveQuranKnowledge(question, input.context, 14);
  const ragText = formatRagContext(chunks);

  const system = [
    "أنت معلم قرآن في تطبيق حافظ. أجب بالعربية من السياق المسترجَع فقط قدر الإمكان.",
    "السورة الحالية رقم " + input.context.surahNumber + ".",
    "=== معرفة مسترجعة ===",
    ragText,
  ].join("\n");

  // Free self-hosted if user runs Ollama
  const ollama = await tryOllama(
    system,
    input.messages.filter((m) => m.role !== "system").slice(-12)
  );
  if (ollama) {
    return { content: ollama, source: "ollama", chunksUsed: chunks.length };
  }

  // Always-available free path
  return freeRagAnswer(question, input.context, input.messages);
}
