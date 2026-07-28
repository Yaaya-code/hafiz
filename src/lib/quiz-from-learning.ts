/**
 * Gamified multi-tier quiz generator from real learning data:
 * revision memory, mistakes (error bank), mutashabihat, scoped ranges, Quran text.
 */

import { getAyah, getSurah, getSurahAyahs } from "@/lib/quran";
import { MUTASHABIHAT_DB } from "@/lib/quran/mutashabihat-db";
import { loadMistakes, type MistakeItem } from "@/lib/user-activity";
import { loadAyahProgress } from "@/lib/memorization-store";
import type { LearningSnapshot, RevisionMemoryItem } from "@/application";

export type QuizQuestionFormat = "mcq" | "reorder" | "speed";

export type QuizQuestion = {
  id: string;
  prompt: string;
  ayah: string;
  options: string[];
  correct: number;
  /** reorder: texts in correct sequential order */
  reorderItems?: string[];
  format?: QuizQuestionFormat;
  /** speed challenge countdown (seconds) */
  timeLimitSec?: number;
  /** hardcore: stricter scoring hint for UI */
  hardcore?: boolean;
  meta?: {
    surahNumber: number;
    ayahNumber: number;
    source:
      | "memory"
      | "mistake"
      | "progress"
      | "foundation"
      | "mutashabih"
      | "scoped"
      | "edge";
    tier?: "easy" | "fun" | "tactical" | "hard";
  };
};

export type QuizMode = {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: "easy" | "fun" | "tactical" | "hard";
  kind:
    | "weak"
    | "mistakes"
    | "next_ayah"
    | "next_ayah_speed"
    | "identify_surah"
    | "daily"
    | "mixed"
    | "mutashabihat"
    | "reorder"
    | "first_last"
    | "hardcore"
    | "custom_range";
};

export const QUIZ_MODES: QuizMode[] = [
  {
    id: "mutashabihat",
    title: "معركة المتشابهات",
    description: "آية متشابهة — حدّد السورة أو أكمل الموضع الشبيه",
    icon: "⚔️",
    tier: "tactical",
    kind: "mutashabihat",
  },
  {
    id: "next_speed",
    title: "تحدي الآية التالية (سرعة)",
    description: "عداد زمني — أظهر سلاسة استحضار الآية التالية",
    icon: "⏱️",
    tier: "fun",
    kind: "next_ayah_speed",
  },
  {
    id: "reorder",
    title: "اختبار الترتيب",
    description: "٣–٥ آيات مبعثرة من وردك — رتّبها صحّاً",
    icon: "🧩",
    tier: "fun",
    kind: "reorder",
  },
  {
    id: "surah",
    title: "اسم السورة",
    description: "مقطع أو آية — اختر اسم السورة من بين الخيارات",
    icon: "📗",
    tier: "easy",
    kind: "identify_surah",
  },
  {
    id: "first_last",
    title: "أوائل وأواخر السور",
    description: "اختبر أوائل السور وأواخرها (الكهف، البقرة، …)",
    icon: "🏁",
    tier: "tactical",
    kind: "first_last",
  },
  {
    id: "hardcore",
    title: "الامتحان الشامل الصعب",
    description: "بنك أخطاء + متشابهات + فواصل صعبة — تسامح أقل",
    icon: "🔥",
    tier: "hard",
    kind: "hardcore",
  },
  {
    id: "mistakes",
    title: "بنك الأخطاء",
    description: "أسئلة من أخطاء التسميع الصوتي المسجّلة",
    icon: "⚠️",
    tier: "tactical",
    kind: "mistakes",
  },
  {
    id: "next",
    title: "الآية التالية",
    description: "بدون مؤقت — أكمل بما يلي الآية المعروضة",
    icon: "➡️",
    tier: "easy",
    kind: "next_ayah",
  },
  {
    id: "weak",
    title: "المواضع الضعيفة",
    description: "من ذاكرة المراجعة ودرجات القوة المنخفضة",
    icon: "🎯",
    tier: "tactical",
    kind: "weak",
  },
  {
    id: "custom",
    title: "نطاق مخصص",
    description: "أي سورة + من/إلى آية — اختبار فوري",
    icon: "📐",
    tier: "easy",
    kind: "custom_range",
  },
  {
    id: "daily",
    title: "اختبار اليوم",
    description: "مزيج ذكي من الضعيف + الأخطاء + SRS",
    icon: "📅",
    tier: "easy",
    kind: "daily",
  },
];

type RefSource = NonNullable<QuizQuestion["meta"]>["source"];
type Ref = { surah: number; ayah: number; source: RefSource };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function memoryToRefs(memory: RevisionMemoryItem[]): Ref[] {
  const refs: Ref[] = [];
  for (const m of memory) {
    const surah = m.content.surah ?? m.content.fromSurah;
    if (!surah || surah < 1 || surah > 114) continue;
    const from = m.content.fromAyah ?? 1;
    const to = m.content.toAyah ?? from;
    const mid = Math.floor((from + to) / 2);
    const strength = m.strengthScore ?? 0.5;
    const weak = m.urgent || strength < 0.55 || (m.mistakesCount || 0) >= 2;
    if (!weak && strength >= 0.75) continue;
    refs.push({ surah, ayah: mid, source: "memory" });
  }
  return refs;
}

function mistakesToRefs(mistakes: MistakeItem[]): Ref[] {
  return mistakes
    .filter((m) => m.surahNumber >= 1 && m.surahNumber <= 114)
    .sort((a, b) => b.frequency - a.frequency)
    .map((m) => ({
      surah: m.surahNumber,
      ayah: Math.max(1, m.ayahNumber || 1),
      source: "mistake" as const,
    }));
}

function progressToRefs(): Ref[] {
  return Object.values(loadAyahProgress())
    .filter(
      (p) =>
        p.status === "WEAK" ||
        p.status === "NEEDS_REVIEW" ||
        (p.failTests || 0) > (p.successTests || 0)
    )
    .sort(
      (a, b) =>
        (a.confidence || 0) - (b.confidence || 0) ||
        (b.failTests || 0) - (a.failTests || 0)
    )
    .slice(0, 20)
    .map((p) => ({
      surah: p.surahNumber,
      ayah: p.ayahNumber,
      source: "progress" as const,
    }));
}

function foundationRefs(): Ref[] {
  const seeds = [
    { surah: 1, ayah: 1 },
    { surah: 1, ayah: 2 },
    { surah: 112, ayah: 1 },
    { surah: 112, ayah: 2 },
    { surah: 113, ayah: 1 },
    { surah: 114, ayah: 1 },
    { surah: 103, ayah: 1 },
    { surah: 108, ayah: 1 },
    { surah: 2, ayah: 1 },
    { surah: 2, ayah: 255 },
    { surah: 18, ayah: 1 },
    { surah: 67, ayah: 1 },
  ];
  return seeds.map((s) => ({ ...s, source: "foundation" as const }));
}

function uniqueRefs(refs: Ref[], limit: number): Ref[] {
  const seen = new Set<string>();
  const out: Ref[] = [];
  for (const r of refs) {
    const key = `${r.surah}:${r.ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function memorizedSurahSet(snapshot: LearningSnapshot | null): Set<number> {
  const set = new Set<number>();
  for (const m of snapshot?.revisionMemory ?? []) {
    const s = m.content.surah ?? m.content.fromSurah;
    if (s && s >= 1 && s <= 114) set.add(s);
  }
  for (const p of Object.values(loadAyahProgress())) {
    if (p.status && p.status !== "NOT_STARTED") {
      set.add(p.surahNumber);
    }
  }
  return set;
}

function mutashabihatRefs(snapshot: LearningSnapshot | null): Ref[] {
  const known = memorizedSurahSet(snapshot);
  const refs: Ref[] = [];
  for (const g of MUTASHABIHAT_DB.slice(0, 80)) {
    const members = g.ayahs ?? [];
    if (known.size > 0 && !members.some((a) => known.has(a.surahNumber))) {
      continue;
    }
    for (const a of members) {
      if (!a.surahNumber || !a.ayahNumber) continue;
      refs.push({
        surah: a.surahNumber,
        ayah: a.ayahNumber,
        source: "mutashabih",
      });
    }
  }
  return uniqueRefs(refs, 16);
}

/** Famous first/last edges used for First & Last challenge */
const EDGE_SEEDS: Ref[] = [
  { surah: 1, ayah: 1, source: "edge" },
  { surah: 1, ayah: 7, source: "edge" },
  { surah: 2, ayah: 1, source: "edge" },
  { surah: 2, ayah: 286, source: "edge" },
  { surah: 2, ayah: 285, source: "edge" },
  { surah: 18, ayah: 1, source: "edge" },
  { surah: 18, ayah: 10, source: "edge" },
  { surah: 36, ayah: 1, source: "edge" },
  { surah: 55, ayah: 1, source: "edge" },
  { surah: 67, ayah: 1, source: "edge" },
  { surah: 78, ayah: 1, source: "edge" },
  { surah: 112, ayah: 1, source: "edge" },
  { surah: 113, ayah: 1, source: "edge" },
  { surah: 114, ayah: 1, source: "edge" },
  { surah: 114, ayah: 6, source: "edge" },
  { surah: 103, ayah: 1, source: "edge" },
];

function firstLastRefs(snapshot: LearningSnapshot | null): Ref[] {
  const known = memorizedSurahSet(snapshot);
  const fromMem: Ref[] = [];
  for (const s of known.size ? known : new Set([1, 2, 18, 36, 112, 113, 114])) {
    const meta = getSurah(s);
    if (!meta) continue;
    fromMem.push({ surah: s, ayah: 1, source: "edge" });
    fromMem.push({ surah: s, ayah: meta.ayahCount, source: "edge" });
    if (meta.ayahCount > 2) {
      fromMem.push({ surah: s, ayah: meta.ayahCount - 1, source: "edge" });
    }
  }
  return uniqueRefs([...fromMem, ...EDGE_SEEDS], 20);
}

export function buildScopedQuiz(
  surahNumber: number,
  fromAyah: number,
  toAyah: number,
  count = 6
): QuizQuestion[] {
  const ayahs = getSurahAyahs(surahNumber).filter(
    (a) => a.ayahNumber >= fromAyah && a.ayahNumber <= toAyah
  );
  const refs: Ref[] = ayahs.map((a) => ({
    surah: a.surahNumber,
    ayah: a.ayahNumber,
    source: "scoped",
  }));
  if (!refs.length) return [];

  const questions: QuizQuestion[] = [];
  const shuffled = shuffle(refs);
  for (let i = 0; i < shuffled.length && questions.length < count; i++) {
    const ref = shuffled[i];
    let q: QuizQuestion | null = null;
    const style = i % 4;
    if (style === 0) q = makeNextAyahQ(ref, i);
    else if (style === 1) q = makeIdentifySurahQ(ref, i);
    else if (style === 2) q = makeReorderQ(ref, i);
    else q = makeChooseTextQ(ref, i);
    q = q || makeChooseTextQ(ref, i);
    if (q && (q.format === "reorder" || q.correct >= 0)) {
      if (q.meta) q.meta.source = "scoped";
      questions.push(q);
    }
  }
  // Prefer one reorder if range is wide enough
  if (toAyah - fromAyah >= 3 && !questions.some((q) => q.format === "reorder")) {
    const rq = makeReorderQ(
      { surah: surahNumber, ayah: fromAyah, source: "scoped" },
      99
    );
    if (rq) questions.unshift(rq);
  }
  return questions.slice(0, count);
}

function collectPool(
  kind: QuizMode["kind"],
  snapshot: LearningSnapshot | null
): Ref[] {
  const memory = snapshot?.revisionMemory ?? [];
  const memRefs = memoryToRefs(memory);
  const mistakeRefs = mistakesToRefs(loadMistakes());
  const progRefs = progressToRefs();
  const mutaRefs = mutashabihatRefs(snapshot);

  if (kind === "weak") {
    return uniqueRefs([...memRefs, ...progRefs, ...mistakeRefs], 12);
  }
  if (kind === "mistakes") {
    return uniqueRefs([...mistakeRefs, ...memRefs, ...progRefs], 12);
  }
  if (kind === "mutashabihat") {
    return uniqueRefs([...mutaRefs, ...memRefs, ...foundationRefs()], 16);
  }
  if (kind === "first_last") {
    return uniqueRefs([...firstLastRefs(snapshot), ...memRefs], 16);
  }
  if (kind === "hardcore") {
    return uniqueRefs(
      [...mistakeRefs, ...mutaRefs, ...memRefs, ...progRefs, ...EDGE_SEEDS],
      18
    );
  }
  if (kind === "reorder") {
    return uniqueRefs(
      [...memRefs, ...progRefs, ...mistakeRefs, ...foundationRefs()],
      12
    );
  }
  if (kind === "daily" || kind === "mixed") {
    return uniqueRefs(
      [...mistakeRefs, ...memRefs, ...progRefs, ...foundationRefs()],
      12
    );
  }
  return uniqueRefs(
    [...memRefs, ...progRefs, ...mistakeRefs, ...foundationRefs()],
    16
  );
}

function distractorAyahs(surah: number, ayah: number, count: number): string[] {
  const same = getSurahAyahs(surah).filter((a) => a.ayahNumber !== ayah);
  const pool = shuffle(same).slice(0, count);
  if (pool.length >= count) return pool.map((a) => a.text);

  const extras: string[] = [];
  for (const s of [112, 113, 114, 103, 108, 1, 36, 67, 18, 2]) {
    if (s === surah) continue;
    const verses = getSurahAyahs(s);
    if (verses[0]) extras.push(verses[0].text);
    if (extras.length + pool.length >= count) break;
  }
  return [...pool.map((a) => a.text), ...extras].slice(0, count);
}

function makeNextAyahQ(
  ref: Ref,
  idx: number,
  opts?: { speed?: boolean; hardcore?: boolean }
): QuizQuestion | null {
  const current = getAyah(ref.surah, ref.ayah);
  const next = getAyah(ref.surah, ref.ayah + 1);
  if (!next || next.text === "…" || next.ayahNumber !== ref.ayah + 1) {
    return null;
  }
  const wrongs = distractorAyahs(ref.surah, next.ayahNumber, 3);
  const options = shuffle([next.text, ...wrongs]).slice(0, 4);
  if (!options.includes(next.text)) options[0] = next.text;
  return {
    id: `next_${ref.surah}_${ref.ayah}_${idx}`,
    prompt: opts?.speed
      ? "⚡ بسرعة: ما الآية التالية؟"
      : "ما الآية التالية؟",
    ayah: current.text,
    options,
    correct: options.indexOf(next.text),
    format: opts?.speed ? "speed" : "mcq",
    timeLimitSec: opts?.speed ? (opts.hardcore ? 8 : 12) : undefined,
    hardcore: opts?.hardcore,
    meta: {
      surahNumber: ref.surah,
      ayahNumber: ref.ayah,
      source: ref.source,
      tier: opts?.hardcore ? "hard" : opts?.speed ? "fun" : "easy",
    },
  };
}

function makeIdentifySurahQ(ref: Ref, idx: number): QuizQuestion | null {
  const a = getAyah(ref.surah, ref.ayah);
  if (!a || a.text === "…") return null;
  const correctName = getSurah(ref.surah)?.nameAr || "سورة " + ref.surah;
  const wrongNames = shuffle(
    [2, 18, 36, 55, 67, 78, 112, 113, 114, 1, 103, 19, 12]
      .filter((n) => n !== ref.surah)
      .map((n) => getSurah(n)?.nameAr || "سورة " + n)
  ).slice(0, 3);
  const options = shuffle([correctName, ...wrongNames]);
  return {
    id: `surah_${ref.surah}_${ref.ayah}_${idx}`,
    prompt: "من أي سورة هذه الآية؟",
    ayah: a.text,
    options,
    correct: options.indexOf(correctName),
    format: "mcq",
    meta: {
      surahNumber: ref.surah,
      ayahNumber: ref.ayah,
      source: ref.source,
      tier: "easy",
    },
  };
}

function makeChooseTextQ(ref: Ref, idx: number): QuizQuestion | null {
  const a = getAyah(ref.surah, ref.ayah);
  if (!a || a.text === "…") return null;
  const name = getSurah(ref.surah)?.nameAr || "";
  const wrongs = distractorAyahs(ref.surah, ref.ayah, 3);
  const options = shuffle([a.text, ...wrongs]).slice(0, 4);
  if (!options.includes(a.text)) options[0] = a.text;
  return {
    id: `text_${ref.surah}_${ref.ayah}_${idx}`,
    prompt: "اختر النص الصحيح — " + name + " آية " + ref.ayah,
    ayah: name + " · آية " + ref.ayah,
    options,
    correct: options.indexOf(a.text),
    format: "mcq",
    meta: {
      surahNumber: ref.surah,
      ayahNumber: ref.ayah,
      source: ref.source,
    },
  };
}

/** Mutashabihat Battle: identify surah among similar members when possible */
function makeMutashabihBattleQ(ref: Ref, idx: number): QuizQuestion | null {
  const group = MUTASHABIHAT_DB.find((g) =>
    (g.ayahs ?? []).some(
      (a) => a.surahNumber === ref.surah && a.ayahNumber === ref.ayah
    )
  );
  const a = getAyah(ref.surah, ref.ayah);
  if (!a || a.text === "…") return null;

  if (group && (group.ayahs?.length || 0) >= 2) {
    const correctName = getSurah(ref.surah)?.nameAr || "سورة " + ref.surah;
    const otherNames = shuffle(
      (group.ayahs || [])
        .map((m) => getSurah(m.surahNumber)?.nameAr || "سورة " + m.surahNumber)
        .filter((n) => n !== correctName)
    );
    const distractors = [
      ...otherNames,
      ...[2, 3, 18, 36, 67, 112]
        .filter((n) => n !== ref.surah)
        .map((n) => getSurah(n)?.nameAr || ""),
    ].filter(Boolean);
    const options = shuffle([
      correctName,
      ...shuffle(distractors).slice(0, 3),
    ]).slice(0, 4);
    if (!options.includes(correctName)) options[0] = correctName;
    return {
      id: `muta_battle_${ref.surah}_${ref.ayah}_${idx}`,
      prompt:
        "⚔️ معركة المتشابهات: هذه آية من مجموعة متشابهة — من أي سورة هي؟",
      ayah: a.text,
      options,
      correct: options.indexOf(correctName),
      format: "mcq",
      meta: {
        surahNumber: ref.surah,
        ayahNumber: ref.ayah,
        source: "mutashabih",
        tier: "tactical",
      },
    };
  }
  return makeIdentifySurahQ(ref, idx);
}

/** 3–5 consecutive ayahs shuffled — user reorders */
function makeReorderQ(ref: Ref, idx: number): QuizQuestion | null {
  const surahAyahs = getSurahAyahs(ref.surah);
  if (surahAyahs.length < 3) return null;
  const start = Math.min(
    Math.max(1, ref.ayah),
    Math.max(1, surahAyahs.length - 2)
  );
  const len = Math.min(5, Math.max(3, surahAyahs.length - start + 1));
  const slice = surahAyahs.slice(start - 1, start - 1 + len);
  if (slice.length < 3) return null;
  const ordered = slice.map((a) => a.text);
  let scrambled = shuffle(ordered);
  // ensure not already correct
  let guard = 0;
  while (
    guard < 8 &&
    scrambled.every((t, i) => t === ordered[i])
  ) {
    scrambled = shuffle(ordered);
    guard++;
  }
  return {
    id: `reorder_${ref.surah}_${start}_${idx}`,
    prompt:
      "🧩 رتّب الآيات بالترتيب الصحيح (اضغط بالترتيب من الأولى للأخيرة)",
    ayah:
      (getSurah(ref.surah)?.nameAr || "") +
      " · من آية " +
      start +
      " إلى " +
      (start + slice.length - 1),
    options: scrambled,
    correct: 0,
    reorderItems: ordered,
    format: "reorder",
    meta: {
      surahNumber: ref.surah,
      ayahNumber: start,
      source: ref.source,
      tier: "fun",
    },
  };
}

function makeFirstLastQ(ref: Ref, idx: number): QuizQuestion | null {
  const meta = getSurah(ref.surah);
  const a = getAyah(ref.surah, ref.ayah);
  if (!meta || !a || a.text === "…") return null;
  const isFirst = ref.ayah === 1;
  const isLast = ref.ayah === meta.ayahCount;
  const isNearLast = ref.ayah >= meta.ayahCount - 1;

  if (isFirst || isLast || isNearLast) {
    // Ask: which edge is this?
    const label = isFirst
      ? "أول آية من السورة"
      : isLast
        ? "آخر آية من السورة"
        : "آية قريبة من الخاتمة";
    const options = shuffle([
      label,
      "وسط السورة",
      "آية عشوائية بلا دلالة",
      isFirst ? "آخر آية من السورة" : "أول آية من السورة",
    ]);
    return {
      id: `edge_${ref.surah}_${ref.ayah}_${idx}`,
      prompt:
        "🏁 أوائل/أواخر: أين موقع هذه الآية في سورة " + meta.nameAr + "؟",
      ayah: a.text,
      options,
      correct: options.indexOf(label),
      format: "mcq",
      meta: {
        surahNumber: ref.surah,
        ayahNumber: ref.ayah,
        source: "edge",
        tier: "tactical",
      },
    };
  }
  // Fallback: identify surah from edge-ish text
  return makeIdentifySurahQ(ref, idx);
}

/**
 * Build a quiz set for the selected mode from live learning data.
 */
export function buildLearningQuiz(
  kind: QuizMode["kind"],
  snapshot: LearningSnapshot | null,
  count = 6
): QuizQuestion[] {
  if (kind === "custom_range") {
    // UI collects range separately via buildScopedQuiz
    return buildScopedQuiz(1, 1, 7, count);
  }

  let pool = collectPool(kind, snapshot);
  if (pool.length === 0) pool = foundationRefs();

  const questions: QuizQuestion[] = [];
  const refs = shuffle(pool);
  const target = kind === "hardcore" ? Math.max(count, 8) : count;

  for (let i = 0; i < refs.length && questions.length < target; i++) {
    const ref = refs[i];
    let q: QuizQuestion | null = null;

    if (kind === "next_ayah") q = makeNextAyahQ(ref, i);
    else if (kind === "next_ayah_speed")
      q = makeNextAyahQ(ref, i, { speed: true });
    else if (kind === "identify_surah") q = makeIdentifySurahQ(ref, i);
    else if (kind === "mutashabihat") q = makeMutashabihBattleQ(ref, i);
    else if (kind === "reorder") q = makeReorderQ(ref, i);
    else if (kind === "first_last") q = makeFirstLastQ(ref, i);
    else if (kind === "hardcore") {
      const style = i % 5;
      if (style === 0) q = makeMutashabihBattleQ(ref, i);
      else if (style === 1) q = makeNextAyahQ(ref, i, { speed: true, hardcore: true });
      else if (style === 2) q = makeReorderQ(ref, i);
      else if (style === 3) q = makeFirstLastQ(ref, i);
      else q = makeChooseTextQ(ref, i);
      if (q) {
        q.hardcore = true;
        if (q.timeLimitSec) q.timeLimitSec = Math.min(q.timeLimitSec, 8);
      }
    } else if (kind === "mistakes" || kind === "weak") {
      q =
        i % 2 === 0
          ? makeChooseTextQ(ref, i)
          : makeNextAyahQ(ref, i) || makeChooseTextQ(ref, i);
    } else {
      const style = i % 3;
      if (style === 0) q = makeNextAyahQ(ref, i);
      else if (style === 1) q = makeIdentifySurahQ(ref, i);
      else q = makeChooseTextQ(ref, i);
      q = q || makeChooseTextQ(ref, i);
    }

    if (q && (q.format === "reorder" || q.correct >= 0)) {
      questions.push(q);
    }
  }

  if (questions.length < Math.min(3, target)) {
    for (const ref of foundationRefs()) {
      if (questions.length >= target) break;
      const q =
        kind === "reorder"
          ? makeReorderQ(ref, questions.length)
          : makeChooseTextQ(ref, questions.length);
      if (q) questions.push(q);
    }
  }

  return questions.slice(0, target);
}

/** Pass threshold: hardcore 80%, speed 70%, default 60% */
export function quizPassThreshold(kind: QuizMode["kind"]): number {
  if (kind === "hardcore") return 0.8;
  if (kind === "next_ayah_speed") return 0.7;
  return 0.6;
}
