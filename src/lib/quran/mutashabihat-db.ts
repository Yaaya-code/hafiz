import type { MutashabihEntry, SimilarityType } from "./types";
import extractedGroups from "./data/mutashabihat-groups.json";
import corpusGroups from "./data/mutashabihat-corpus.json";
import { SURAHS } from "./surahs";
import { hasMultiWordPhrase } from "./mutashabihat-highlight";

/** Core curated seed groups (types, stories, structure examples) */
const SEED_GROUPS: MutashabihEntry[] = [
  {
    id: "m1",
    type: "SIMILAR_ENDINGS",
    difficulty: 2,
    title: "خاتمة القدرة",
    description: "إن الله على كل شيء قدير — سياقات مختلفة",
    differenceExplain:
      "الخاتمة واحدة؛ الفرق في ما قبلها (المنافقون، العفو، أحد).",
    tips: ["احفظ الجملة السابقة مباشرة", "اربط كل موضع بقصة السورة"],
    juz: [1, 3, 4],
    ayahs: [
      {
        surahNumber: 2,
        surahName: "البقرة",
        ayahNumber: 20,
        text: "… إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        highlightWords: ["قَدِيرٌ"],
        contextNote: "بعد مثل المنافقين",
      },
      {
        surahNumber: 2,
        surahName: "البقرة",
        ayahNumber: 109,
        text: "… فَاعْفُوا وَاصْفَحُوا … إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        highlightWords: ["فَاعْفُوا", "قَدِيرٌ"],
        contextNote: "العفو والصفح",
      },
      {
        surahNumber: 3,
        surahName: "آل عمران",
        ayahNumber: 165,
        text: "… قُلْ هُوَ مِنْ عِندِ أَنفُسِكُمْ ۗ إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        highlightWords: ["أَنفُسِكُمْ", "قَدِيرٌ"],
        contextNote: "بعد أحد",
      },
    ],
  },
  {
    id: "m2",
    type: "SIMILAR_PHRASES",
    difficulty: 3,
    title: "وما أوتيتم من العلم",
    description: "تشابه حول العلم والقلة",
    differenceExplain: "الإسراء تربط العلم بالقلة مع الروح؛ غيرها عن الحكمة.",
    tips: ["اربط «إلا قليلا» بالروح", "لا تخلط مع آيات الحكمة"],
    juz: [15, 3],
    ayahs: [
      {
        surahNumber: 17,
        surahName: "الإسراء",
        ayahNumber: 85,
        text: "وَيَسْأَلُونَكَ عَنِ الرُّوحِ … وَمَا أُوتِيتُم مِّنَ الْعِلْمِ إِلَّا قَلِيلًا",
        highlightWords: ["الرُّوحِ", "قَلِيلًا"],
        contextNote: "سؤال الروح",
      },
      {
        surahNumber: 2,
        surahName: "البقرة",
        ayahNumber: 269,
        text: "يُؤْتِي الْحِكْمَةَ مَن يَشَاءُ … خَيْرًا كَثِيرًا",
        highlightWords: ["الْحِكْمَةَ", "كَثِيرًا"],
        contextNote: "الحكمة والخير الكثير",
      },
    ],
  },
  {
    id: "m3",
    type: "SIMILAR_BEGINNINGS",
    difficulty: 2,
    title: "الحمد لله",
    description: "بدايات متشابهة بالثناء",
    differenceExplain: "الفاتحة عامة؛ الكهف تخص إنزال الكتاب.",
    tips: ["بعد الحمد لله انظر ماذا يتبع"],
    juz: [1, 15],
    ayahs: [
      {
        surahNumber: 1,
        surahName: "الفاتحة",
        ayahNumber: 2,
        text: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
        highlightWords: ["رَبِّ الْعَالَمِينَ"],
        contextNote: "ثناء عام",
      },
      {
        surahNumber: 18,
        surahName: "الكهف",
        ayahNumber: 1,
        text: "الْحَمْدُ لِلَّهِ الَّذِي أَنزَلَ عَلَىٰ عَبْدِهِ الْكِتَابَ وَلَمْ يَجْعَل لَّهُ عِوَجًا",
        highlightWords: ["أَنزَلَ", "الْكِتَابَ"],
        contextNote: "إنزال الكتاب",
      },
    ],
  },
  {
    id: "m4",
    type: "DIFFERENT_LETTERS",
    difficulty: 4,
    title: "فروقات حرفية",
    description: "تشابه بنية مع اختلاف حرف",
    differenceExplain: "دقّق آخر الجذر والحرف؛ لا تعتمد على السمع وحده.",
    tips: ["اكتب الكلمتين جنبا إلى جنب"],
    juz: [1, 4],
    ayahs: [
      {
        surahNumber: 2,
        surahName: "البقرة",
        ayahNumber: 85,
        text: "أَفَتُؤْمِنُونَ بِبَعْضِ الْكِتَابِ وَتَكْفُرُونَ بِبَعْضٍ",
        highlightWords: ["بِبَعْضِ", "بِبَعْضٍ"],
        contextNote: "بني إسرائيل",
      },
      {
        surahNumber: 3,
        surahName: "آل عمران",
        ayahNumber: 119,
        text: "هَا أَنتُمْ أُولَاءِ تُحِبُّونَهُمْ وَلَا يُحِبُّونَكُمْ",
        highlightWords: ["تُحِبُّونَهُمْ", "يُحِبُّونَكُمْ"],
        contextNote: "تشابه البنية",
      },
    ],
  },
  {
    id: "m5",
    type: "SIMILAR_WORDS",
    difficulty: 3,
    title: "سور تبدأ بـ قل",
    description: "الإخلاص / الفلق / الناس / الكافرون",
    differenceExplain: "كلها تبدأ بقل لكن المضمون مختلف تماما.",
    tips: ["احفظ ما بعد قل مباشرة"],
    juz: [30],
    ayahs: [
      {
        surahNumber: 112,
        surahName: "الإخلاص",
        ayahNumber: 1,
        text: "قُلْ هُوَ اللَّهُ أَحَدٌ",
        highlightWords: ["أَحَدٌ"],
        contextNote: "التوحيد",
      },
      {
        surahNumber: 113,
        surahName: "الفلق",
        ayahNumber: 1,
        text: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ",
        highlightWords: ["الْفَلَقِ"],
        contextNote: "الاستعاذة",
      },
      {
        surahNumber: 114,
        surahName: "الناس",
        ayahNumber: 1,
        text: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ",
        highlightWords: ["النَّاسِ"],
        contextNote: "الوسواس",
      },
      {
        surahNumber: 109,
        surahName: "الكافرون",
        ayahNumber: 1,
        text: "قُلْ يَا أَيُّهَا الْكَافِرُونَ",
        highlightWords: ["الْكَافِرُونَ"],
        contextNote: "البراءة",
      },
    ],
  },
  {
    id: "m6",
    type: "DIFFERENT_WORD_ORDER",
    difficulty: 4,
    title: "ترتيب الصفات",
    description: "العليم الحكيم بترتيبات",
    differenceExplain: "الترتيب يتبع السياق لا قاعدة ثابتة دائما.",
    tips: ["اختبر نفسك كتابة"],
    juz: [1, 4],
    ayahs: [
      {
        surahNumber: 2,
        surahName: "البقرة",
        ayahNumber: 32,
        text: "… إِنَّكَ أَنتَ الْعَلِيمُ الْحَكِيمُ",
        highlightWords: ["الْعَلِيمُ", "الْحَكِيمُ"],
        contextNote: "بعد سؤال الملائكة",
      },
      {
        surahNumber: 4,
        surahName: "النساء",
        ayahNumber: 26,
        text: "… وَاللَّهُ عَلِيمٌ حَكِيمٌ",
        highlightWords: ["عَلِيمٌ", "حَكِيمٌ"],
        contextNote: "صيغة نكرة",
      },
    ],
  },
  {
    id: "m7",
    type: "SIMILAR_MEANINGS",
    difficulty: 3,
    title: "الصراط المستقيم",
    description: "معان متقاربة حول الهداية",
    differenceExplain: "الفاتحة دعاء؛ مواضع اخرى خبر أو وصف.",
    tips: ["ميّز الدعاء عن الخبر"],
    juz: [1],
    ayahs: [
      {
        surahNumber: 1,
        surahName: "الفاتحة",
        ayahNumber: 6,
        text: "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
        highlightWords: ["اهْدِنَا"],
        contextNote: "دعاء",
      },
      {
        surahNumber: 1,
        surahName: "الفاتحة",
        ayahNumber: 7,
        text: "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ …",
        highlightWords: ["أَنْعَمْتَ"],
        contextNote: "تفسير الصراط",
      },
    ],
  },
  {
    id: "m8",
    type: "SIMILAR_STRUCTURE",
    difficulty: 5,
    title: "فبأي آلاء ربكما تكذبان",
    description: "تكرار بنيوي في الرحمن",
    differenceExplain: "نمط تكرار — احفظ ما قبل كل تكرار.",
    tips: ["قسّم السورة إلى مقاطع نعم"],
    juz: [27],
    ayahs: [
      {
        surahNumber: 55,
        surahName: "الرحمن",
        ayahNumber: 13,
        text: "فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ",
        highlightWords: ["آلَاءِ", "تُكَذِّبَانِ"],
        contextNote: "يكرر 31 مرة",
      },
    ],
  },
  {
    id: "m9",
    type: "SIMILAR_STORIES",
    difficulty: 4,
    title: "قصة موسى في مواضع",
    description: "قصة واحدة بأساليب مختلفة",
    differenceExplain:
      "التفاصيل والترتيب يختلفان حسب غرض السورة (تحدي فرعون، فضل الله، عبرة).",
    tips: ["اربط كل رواية بهدف السورة", "لا تنقل تفاصيل من موضع لآخر"],
    juz: [9, 16, 20],
    ayahs: [
      {
        surahNumber: 20,
        surahName: "طه",
        ayahNumber: 9,
        text: "وَهَلْ أَتَاكَ حَدِيثُ مُوسَىٰ",
        highlightWords: ["مُوسَىٰ"],
        contextNote: "افتتاح قصة موسى في طه",
      },
      {
        surahNumber: 28,
        surahName: "القصص",
        ayahNumber: 3,
        text: "نَتْلُو عَلَيْكَ مِن نَّبَإِ مُوسَىٰ وَفِرْعَوْنَ بِالْحَقِّ …",
        highlightWords: ["مُوسَىٰ", "فِرْعَوْنَ"],
        contextNote: "نبأ موسى وفرعون",
      },
    ],
  },
  {
    id: "m10",
    type: "DIFFERENT_GRAMMAR",
    difficulty: 5,
    title: "صيغ نحوية متقاربة",
    description: "اختلاف إعراب/صيغة مع تشابه المعنى",
    differenceExplain: "قد يتغير التعريف والتنكير أو الضمير حسب السياق النحوي.",
    tips: ["لاحظ الضمائر (هما / هم / كم)", "راجع خاتمة الآية كاملة"],
    juz: [27, 30],
    ayahs: [
      {
        surahNumber: 55,
        surahName: "الرحمن",
        ayahNumber: 13,
        text: "فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ",
        highlightWords: ["رَبِّكُمَا", "تُكَذِّبَانِ"],
        contextNote: "مثنى — الإنس والجن",
      },
      {
        surahNumber: 53,
        surahName: "النجم",
        ayahNumber: 55,
        text: "فَبِأَيِّ آلَاءِ رَبِّكَ تَتَمَارَىٰ",
        highlightWords: ["رَبِّكَ", "تَتَمَارَىٰ"],
        contextNote: "مفرد مخاطب",
      },
    ],
  },
  {
    id: "m11",
    type: "DIFFERENT_CONTEXT",
    difficulty: 3,
    title: "نفس اللفظ — سياق مختلف",
    description: "الفرق في سبب النزول والمقصود",
    differenceExplain:
      "اللفظ قد يتكرر لكن المخاطب والحدث مختلفان — السياق هو المفتاح.",
    tips: ["اسأل: من المخاطب؟ ومتى؟"],
    juz: [1, 15],
    ayahs: [
      {
        surahNumber: 2,
        surahName: "البقرة",
        ayahNumber: 2,
        text: "ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ",
        highlightWords: ["الْكِتَابُ", "هُدًى"],
        contextNote: "وصف القرآن للمؤمنين",
      },
      {
        surahNumber: 18,
        surahName: "الكهف",
        ayahNumber: 1,
        text: "… أَنزَلَ عَلَىٰ عَبْدِهِ الْكِتَابَ وَلَمْ يَجْعَل لَّهُ عِوَجًا",
        highlightWords: ["الْكِتَابَ", "عِوَجًا"],
        contextNote: "إنزال بلا عوج",
      },
    ],
  },
  {
    id: "m12",
    type: "SIMILAR_STRUCTURE",
    difficulty: 3,
    title: "إياك … وإياك",
    description: "بنية التقديم والتكرار",
    differenceExplain: "تكرار البنية يثبّت المعنى؛ لا تخلط مع آيات مشابهة في الثناء.",
    tips: ["احفظ الزوج معا", "اختبر نفسك بالصوت"],
    juz: [1],
    ayahs: [
      {
        surahNumber: 1,
        surahName: "الفاتحة",
        ayahNumber: 5,
        text: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
        highlightWords: ["نَعْبُدُ", "نَسْتَعِينُ"],
        contextNote: "محور الفاتحة",
      },
    ],
  },
];

type RawGroup = {
  id: string;
  type?: string;
  difficulty?: number;
  title: string;
  description: string;
  differenceExplain: string;
  tips?: string[];
  juz?: number[];
  ayahs: {
    surahNumber: number;
    surahName: string;
    ayahNumber: number;
    text: string;
    highlightWords?: string[];
    contextNote?: string;
  }[];
};

function asEntry(raw: RawGroup): MutashabihEntry {
  const difficulty = Math.min(
    5,
    Math.max(1, Number(raw.difficulty) || 3)
  ) as 1 | 2 | 3 | 4 | 5;
  return {
    id: String(raw.id),
    type: (raw.type as SimilarityType) || "SIMILAR_PHRASES",
    difficulty,
    title: raw.title,
    description: raw.description,
    differenceExplain: raw.differenceExplain,
    tips: Array.isArray(raw.tips) ? raw.tips.map(String) : [],
    juz: Array.isArray(raw.juz) ? raw.juz.map(Number) : [],
    ayahs: (raw.ayahs || []).map((a) => ({
      surahNumber: Number(a.surahNumber),
      surahName: String(a.surahName),
      ayahNumber: Number(a.ayahNumber),
      text: String(a.text),
      highlightWords: Array.isArray(a.highlightWords)
        ? a.highlightWords.map(String)
        : [],
      contextNote: String(a.contextNote || ""),
    })),
  };
}

function ayahKey(entry: MutashabihEntry): string {
  return entry.ayahs
    .map((a) => a.surahNumber + ":" + a.ayahNumber)
    .sort()
    .join("|");
}

const FROM_BOOK: MutashabihEntry[] = (
  extractedGroups as RawGroup[]
).map(asEntry);

const FROM_CORPUS: MutashabihEntry[] = (
  corpusGroups as RawGroup[]
).map(asEntry);

/**
 * Merge seed + book + full-Quran scan.
 * Drop duplicates AND any group that only matches on a single word
 * (must share a consecutive phrase of 2+ words).
 */
function buildDb(): MutashabihEntry[] {
  const out: MutashabihEntry[] = [];
  const seen = new Set<string>();
  for (const g of [...SEED_GROUPS, ...FROM_BOOK, ...FROM_CORPUS]) {
    const key = ayahKey(g);
    if (seen.has(key)) continue;
    // Require multi-word phrase similarity — no single-word mutashabihat
    const texts = g.ayahs.map((a) => a.text);
    if (texts.length < 2) continue;
    if (!hasMultiWordPhrase(texts, 2)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/**
 * Full mutashabihat knowledge base:
 * seed + book rules + full-Quran scan (all 114 surahs).
 */
export const MUTASHABIHAT_DB: MutashabihEntry[] = buildDb();

/** How many mutashabih groups touch each surah (1–114) */
export const MUTASHABIHAT_BY_SURAH: Record<number, number> = (() => {
  const counts: Record<number, number> = {};
  for (const s of SURAHS) counts[s.number] = 0;
  for (const g of MUTASHABIHAT_DB) {
    const seen = new Set<number>();
    for (const a of g.ayahs) {
      if (!seen.has(a.surahNumber)) {
        counts[a.surahNumber] = (counts[a.surahNumber] || 0) + 1;
        seen.add(a.surahNumber);
      }
    }
  }
  return counts;
})();

export const MUTASHABIHAT_STATS = {
  total: MUTASHABIHAT_DB.length,
  seed: SEED_GROUPS.length,
  book: FROM_BOOK.length,
  corpus: FROM_CORPUS.length,
  surahsCovered: Object.values(MUTASHABIHAT_BY_SURAH).filter((n) => n > 0)
    .length,
};

export const SIMILARITY_TYPE_LABELS: Record<SimilarityType | "ALL", string> = {
  ALL: "الكل",
  SIMILAR_WORDS: "كلمات متشابهة",
  SIMILAR_PHRASES: "عبارات متشابهة",
  SIMILAR_STRUCTURE: "تركيب جملة",
  SIMILAR_ENDINGS: "خواتيم",
  SIMILAR_BEGINNINGS: "بدايات",
  SIMILAR_MEANINGS: "معانٍ",
  SIMILAR_STORIES: "قصص متشابهة",
  DIFFERENT_LETTERS: "اختلاف حروف",
  DIFFERENT_WORD_ORDER: "ترتيب كلمات",
  DIFFERENT_GRAMMAR: "نحو/إعراب",
  DIFFERENT_CONTEXT: "سياق مختلف",
};

export function filterMutashabihat(opts: {
  query?: string;
  type?: string;
  juz?: number;
  difficulty?: number;
  surah?: number;
}): MutashabihEntry[] {
  return MUTASHABIHAT_DB.filter((m) => {
    if (opts.type && opts.type !== "ALL" && m.type !== opts.type) return false;
    if (opts.difficulty && m.difficulty !== opts.difficulty) return false;
    if (opts.juz && m.juz && m.juz.indexOf(opts.juz) < 0) return false;
    if (opts.surah) {
      if (!m.ayahs.some((a) => a.surahNumber === opts.surah)) return false;
    }
    if (opts.query) {
      const q = opts.query.trim();
      if (
        m.title.indexOf(q) < 0 &&
        m.description.indexOf(q) < 0 &&
        m.differenceExplain.indexOf(q) < 0 &&
        !m.ayahs.some(
          (a) =>
            a.text.indexOf(q) >= 0 ||
            a.surahName.indexOf(q) >= 0 ||
            String(a.ayahNumber) === q
        )
      ) {
        return false;
      }
    }
    return true;
  });
}

/** Quiz items from groups with 2+ ayahs (shuffled, capped) */
export function buildMutashabihQuiz(limit = 8) {
  const pool = MUTASHABIHAT_DB.filter((m) => m.ayahs.length >= 2);
  // Prefer extracted book pairs for practice variety
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, limit);
  return shuffled.map((m) => {
    const correct = m.ayahs[0];
    const wrong = m.ayahs[1];
    return {
      id: m.id,
      prompt: "أي آية تناسب هذا السياق؟",
      context: "الموضع: " + (correct.contextNote || m.title || ""),
      options: [
        {
          text: correct.text,
          surah: correct.surahName,
          surahNumber: correct.surahNumber,
          ayahNumber: correct.ayahNumber,
          ok: true,
        },
        {
          text: wrong.text,
          surah: wrong.surahName,
          surahNumber: wrong.surahNumber,
          ayahNumber: wrong.ayahNumber,
          ok: false,
        },
      ].sort(() => Math.random() - 0.5),
      tip: m.differenceExplain || m.tips?.[0] || "",
      type: m.type,
    };
  });
}
