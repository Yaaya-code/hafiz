import type {
  Achievement,
  AISuggestion,
  Ayah,
  ClassRoom,
  DailyAnalytics,
  Goal,
  Mistake,
  MushafPage,
  MutashabihGroup,
  NotificationItem,
  PageStatus,
  RevisionItem,
  StudentSummary,
  Surah,
  UserProfile,
} from "./types";
import { calculateHafizScore } from "./hafiz-score";
import { prioritizeRevisionQueue, predictForgetting } from "./srs";
import { getAyah, getSurahAyahs } from "@/lib/quran/ayahs";

export const surahs: Surah[] = [
  { id: 1, number: 1, nameAr: "الفاتحة", nameEn: "Al-Fatihah", ayahCount: 7, revelationType: "Meccan", startPage: 1, endPage: 1 },
  { id: 2, number: 2, nameAr: "البقرة", nameEn: "Al-Baqarah", ayahCount: 286, revelationType: "Medinan", startPage: 2, endPage: 49 },
  { id: 18, number: 18, nameAr: "الكهف", nameEn: "Al-Kahf", ayahCount: 110, revelationType: "Meccan", startPage: 293, endPage: 304 },
  { id: 36, number: 36, nameAr: "يس", nameEn: "Ya-Sin", ayahCount: 83, revelationType: "Meccan", startPage: 440, endPage: 445 },
  { id: 55, number: 55, nameAr: "الرحمن", nameEn: "Ar-Rahman", ayahCount: 78, revelationType: "Medinan", startPage: 531, endPage: 534 },
  { id: 67, number: 67, nameAr: "الملك", nameEn: "Al-Mulk", ayahCount: 30, revelationType: "Meccan", startPage: 562, endPage: 564 },
  { id: 78, number: 78, nameAr: "النبأ", nameEn: "An-Naba", ayahCount: 40, revelationType: "Meccan", startPage: 582, endPage: 583 },
  { id: 112, number: 112, nameAr: "الإخلاص", nameEn: "Al-Ikhlas", ayahCount: 4, revelationType: "Meccan", startPage: 604, endPage: 604 },
];

/** Real Uthmani ayahs for UI surfaces that still import sampleAyahs */
export const sampleAyahs: Ayah[] = [
  ...getSurahAyahs(1).map((a, i) => ({
    id: i + 1,
    surahId: 1,
    number: a.ayahNumber,
    text: a.text,
    page: a.page,
    juz: a.juz,
    hizb: a.hizb,
  })),
  ...[2, 255, 285, 286].map((n, i) => {
    const a = getAyah(2, n);
    return {
      id: 20 + i,
      surahId: 2,
      number: a.ayahNumber,
      text: a.text,
      page: a.page,
      juz: a.juz,
      hizb: a.hizb,
    };
  }),
  ...getSurahAyahs(18).slice(0, 5).map((a, i) => ({
    id: 30 + i,
    surahId: 18,
    number: a.ayahNumber,
    text: a.text,
    page: a.page,
    juz: a.juz,
    hizb: a.hizb,
  })),
  ...getSurahAyahs(36).slice(0, 5).map((a, i) => ({
    id: 40 + i,
    surahId: 36,
    number: a.ayahNumber,
    text: a.text,
    page: a.page,
    juz: a.juz,
    hizb: a.hizb,
  })),
  ...getSurahAyahs(112).map((a, i) => ({
    id: 50 + i,
    surahId: 112,
    number: a.ayahNumber,
    text: a.text,
    page: a.page,
    juz: a.juz,
    hizb: a.hizb,
  })),
];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function generateMushafPages(): MushafPage[] {
  const pages: MushafPage[] = [];
  for (let i = 1; i <= 604; i++) {
    const r = seededRandom(i * 17);
    let status: PageStatus = "NOT_MEMORIZED";
    if (i <= 50) {
      status = r < 0.45 ? "MASTERED" : r < 0.7 ? "GOOD" : r < 0.85 ? "NEEDS_REVIEW" : r < 0.95 ? "WEAK" : "FORGOTTEN";
    } else if (i <= 150) {
      status = r < 0.25 ? "MASTERED" : r < 0.5 ? "GOOD" : r < 0.7 ? "NEEDS_REVIEW" : r < 0.85 ? "WEAK" : "NOT_MEMORIZED";
    } else if (i <= 300) {
      status = r < 0.1 ? "GOOD" : r < 0.25 ? "NEEDS_REVIEW" : r < 0.35 ? "WEAK" : "NOT_MEMORIZED";
    } else {
      status = r < 0.05 ? "NEEDS_REVIEW" : "NOT_MEMORIZED";
    }

    const daysAgo = Math.floor(seededRandom(i * 3) * 20);
    const last = new Date();
    last.setDate(last.getDate() - daysAgo);
    const interval = status === "MASTERED" ? 21 : status === "GOOD" ? 7 : status === "NEEDS_REVIEW" ? 3 : 1;
    const next = new Date(last);
    next.setDate(next.getDate() + interval);

    pages.push({
      number: i,
      juz: Math.min(30, Math.ceil(i / 20.13)),
      hizb: Math.min(60, Math.ceil(i / 10.07)),
      startSurah: 1,
      endSurah: 1,
      status,
      lastReviewedAt: status === "NOT_MEMORIZED" ? undefined : last.toISOString(),
      nextReviewAt: status === "NOT_MEMORIZED" ? undefined : next.toISOString(),
      easeFactor: 1.3 + seededRandom(i * 5) * 1.2,
      intervalDays: interval,
      mistakeCount: status === "WEAK" || status === "FORGOTTEN" ? Math.floor(seededRandom(i) * 6) + 1 : Math.floor(seededRandom(i) * 2),
      confidence:
        status === "MASTERED"
          ? 0.9 + seededRandom(i) * 0.1
          : status === "GOOD"
            ? 0.75
            : status === "NEEDS_REVIEW"
              ? 0.6
              : status === "WEAK"
                ? 0.4
                : status === "FORGOTTEN"
                  ? 0.2
                  : 0,
    });
  }
  // Mark a few as forgotten
  [12, 28, 45, 88, 102].forEach((n) => {
    const p = pages[n - 1];
    if (p) {
      p.status = "FORGOTTEN";
      p.confidence = 0.2;
      p.mistakeCount = 6;
    }
  });
  return pages;
}

export const mushafPages = generateMushafPages();

export const currentUser: UserProfile = {
  id: "user_1",
  name: "أحمد بن محمد",
  email: "ahmad@example.com",
  role: "STUDENT",
  startPage: 1,
  currentPage: 150,
  pagesPerDay: 2,
  revisionSessionsPerDay: 3,
  dailyMinutes: 45,
  memorizationStrength: 3,
  goals: ["إتمام مراجعة الجزء الأول", "تقوية المتشابهات", "سلسلة 30 يوماً"],
  revisionStyle: "balanced",
  hafizScore: calculateHafizScore({
    consistency: 0.82,
    mistakeRate: 0.18,
    reviewFrequency: 0.88,
    quizAccuracy: 0.79,
    revisionCompletion: 0.85,
    mutashabihatMastery: 0.62,
    streakDays: 14,
    longestStreak: 42,
  }),
  streak: 14,
  longestStreak: 42,
  onboardingComplete: true,
};

export const mistakes: Mistake[] = [
  {
    id: "m1",
    pageNumber: 12,
    surahId: 2,
    surahName: "البقرة",
    type: "MUTASHABIH",
    difficulty: 4,
    frequency: 5,
    note: "خلط مع آية مشابهة في آل عمران",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "m2",
    pageNumber: 28,
    surahId: 2,
    surahName: "البقرة",
    type: "HARAKA",
    difficulty: 2,
    frequency: 3,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "m3",
    pageNumber: 45,
    surahId: 2,
    surahName: "البقرة",
    type: "WORD",
    difficulty: 3,
    frequency: 4,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    id: "m4",
    pageNumber: 88,
    surahId: 4,
    surahName: "النساء",
    type: "ORDER",
    difficulty: 5,
    frequency: 2,
    createdAt: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    id: "m5",
    pageNumber: 102,
    surahId: 4,
    surahName: "النساء",
    type: "LETTER",
    difficulty: 3,
    frequency: 3,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

const prioritized = prioritizeRevisionQueue(mushafPages, mistakes, 12);

export const todayRevision: RevisionItem[] = prioritized.map((p, i) => ({
  id: `rev_${p.number}`,
  pageNumber: p.number,
  priority: i + 1,
  reason:
    p.status === "FORGOTTEN"
      ? "منسية — أولوية قصوى"
      : p.status === "WEAK"
        ? "ضعيفة وتحتاج تعزيز"
        : p.mistakeCount > 2
          ? "أخطاء متكررة"
          : "موعد المراجعة",
  status: p.status,
  estimatedMinutes: p.status === "WEAK" || p.status === "FORGOTTEN" ? 4 : 2,
  surahName: p.number <= 49 ? "البقرة" : p.number <= 76 ? "آل عمران" : "النساء",
}));

export const predictivePages = predictForgetting(mushafPages, 2).slice(0, 6);

export const mutashabihat: MutashabihGroup[] = [
  {
    id: "mut_1",
    title: "وَمَا أُوتِيتُم مِّنَ الْعِلْمِ",
    description: "آيات متشابهة حول العلم والكتاب",
    ayahs: [
      {
        surahId: 17,
        surahName: "الإسراء",
        ayahNumber: 85,
        text: "وَيَسْأَلُونَكَ عَنِ الرُّوحِ ۖ قُلِ الرُّوحُ مِنْ أَمْرِ رَبِّي وَمَا أُوتِيتُم مِّنَ الْعِلْمِ إِلَّا قَلِيلًا",
        highlightWords: ["الرُّوحِ", "قَلِيلًا"],
        contextNote: "في سياق السؤال عن الروح",
      },
      {
        surahId: 2,
        surahName: "البقرة",
        ayahNumber: 269,
        text: "يُؤْتِي الْحِكْمَةَ مَن يَشَاءُ ۚ وَمَن يُؤْتَ الْحِكْمَةَ فَقَدْ أُوتِيَ خَيْرًا كَثِيرًا",
        highlightWords: ["الْحِكْمَةَ", "كَثِيرًا"],
        contextNote: "في سياق الحكمة والخير الكثير",
      },
    ],
    tips: [
      "اربط «إلا قليلاً» بالروح في الإسراء",
      "اربط «خيراً كثيراً» بالحكمة في البقرة",
      "راجع الفرق بين العلم والحكمة في السياق",
    ],
  },
  {
    id: "mut_2",
    title: "إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
    description: "خواتيم آيات القدرة المتشابهة",
    ayahs: [
      {
        surahId: 2,
        surahName: "البقرة",
        ayahNumber: 20,
        text: "يَكَادُ الْبَرْقُ يَخْطَفُ أَبْصَارَهُمْ ۚ ... إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        highlightWords: ["قَدِيرٌ"],
        contextNote: "بعد مثل المنافقين والبرق",
      },
      {
        surahId: 2,
        surahName: "البقرة",
        ayahNumber: 109,
        text: "... فَاعْفُوا وَاصْفَحُوا حَتَّىٰ يَأْتِيَ اللَّهُ بِأَمْرِهِ ۗ إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        highlightWords: ["قَدِيرٌ"],
        contextNote: "في سياق العفو والصفح",
      },
      {
        surahId: 3,
        surahName: "آل عمران",
        ayahNumber: 165,
        text: "... قُلْ هُوَ مِنْ عِندِ أَنفُسِكُمْ ۗ إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        highlightWords: ["قَدِيرٌ"],
        contextNote: "بعد أحد — من عند أنفسكم",
      },
    ],
    tips: [
      "احفظ السياق السابق لكل خاتمة",
      "اربط كل آية بقصة أو موضوع السورة",
    ],
  },
  {
    id: "mut_3",
    title: "فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ",
    description: "تكرار الرحمن — نمط وليس متشابه اختلاط",
    ayahs: [
      {
        surahId: 55,
        surahName: "الرحمن",
        ayahNumber: 13,
        text: "فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ",
        highlightWords: ["آلَاءِ", "تُكَذِّبَانِ"],
        contextNote: "تُكرر 31 مرة — ركّز على الآية السابقة لكل تكرار",
      },
    ],
    tips: [
      "احفظ ترتيب النعم قبل كل تكرار",
      "قسّم السورة إلى مقاطع موضوعية",
    ],
  },
];

export const achievements: Achievement[] = [
  { id: "a1", title: "أول مراجعة", description: "أكملت أول جلسة مراجعة", icon: "🌱", unlocked: true, unlockedAt: "2026-06-01", progress: 1, target: 1 },
  { id: "a2", title: "أتممت مراجعة البقرة", description: "أنهيت مراجعة سورة البقرة", icon: "📗", unlocked: true, unlockedAt: "2026-06-20", progress: 1, target: 1 },
  { id: "a3", title: "أتقنت ٥٠٠ آية", description: "وصلت إلى ٥٠٠ آية متقنة", icon: "🏆", unlocked: false, progress: 120, target: 500 },
  { id: "a4", title: "حافظت على وردك ٣٠ يوماً", description: "انتظام شهر كامل في الورد", icon: "🔥", unlocked: false, progress: 14, target: 30 },
  { id: "a5", title: "سلسلة ٩٠ يوماً", description: "تسعون يوماً متتالية مع القرآن", icon: "💎", unlocked: false, progress: 14, target: 90 },
  { id: "a6", title: "جزء مكتمل", description: "أتقنت مراجعة جزء كامل", icon: "📖", unlocked: true, unlockedAt: "2026-07-01", progress: 1, target: 1 },
  { id: "a7", title: "سيد المتشابهات", description: "أتقنت ٥٠ مجموعة متشابهات", icon: "✨", unlocked: false, progress: 12, target: 50 },
  { id: "a8", title: "يوم بلا أخطاء", description: "يوم مراجعة ناجح بدون أخطاء", icon: "🎯", unlocked: true, unlockedAt: "2026-07-15", progress: 1, target: 1 },
  { id: "a9", title: "اختبار مثالي", description: "حصلت على ١٠٠٪ في اختبار تسميع", icon: "⭐", unlocked: true, unlockedAt: "2026-07-10", progress: 1, target: 1 },
];

export const goals: Goal[] = [
  { id: "g1", title: "ورد المراجعة اليوم", period: "DAILY", target: 12, current: 5, unit: "صفحة", completed: false },
  { id: "g2", title: "وقت مع القرآن", period: "DAILY", target: 45, current: 18, unit: "دقيقة", completed: false },
  { id: "g3", title: "مراجعة الأسبوع", period: "WEEKLY", target: 70, current: 38, unit: "صفحة", completed: false },
  { id: "g4", title: "آيات حفظ جديد", period: "MONTHLY", target: 100, current: 28, unit: "آية", completed: false },
];

export const notifications: NotificationItem[] = [
  {
    id: "n1",
    title: "تنبيه مراجعة",
    body: "لم تراجع سورة الكهف منذ 12 يوماً.",
    type: "reminder",
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "n2",
    title: "قبل النسيان",
    body: "الصفحة 28 معرضة للنسيان غداً — راجعها اليوم.",
    type: "prediction",
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "n3",
    title: "خطة اليوم",
    body: "مراجعة اليوم تستغرق حوالي 18 دقيقة فقط.",
    type: "system",
    read: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

export const aiSuggestions: AISuggestion[] = [
  {
    id: "ai1",
    title: "راجع هذه قبل النسيان",
    body: "٦ صفحات ضعيفة قد تُنسى خلال يومين. نوصي بمراجعة سريعة الآن.",
    actionLabel: "ابدأ المراجعة الذكية",
    href: "/plans/journey",
    urgency: "high",
  },
  {
    id: "ai2",
    title: "تحدّي متشابهات",
    body: "لديك 3 مجموعات متشابهات لم تُراجع هذا الأسبوع.",
    actionLabel: "استكشف المتشابهات",
    href: "/mutashabihat",
    urgency: "medium",
  },
  {
    id: "ai3",
    title: "اختبار الصفحات الضعيفة",
    body: "اختبار قصير (٥ دقائق) على أضعف صفحاتك يرفع درجة الحفظ.",
    actionLabel: "ابدأ الاختبار",
    href: "/quiz?type=weak",
    urgency: "low",
  },
];

export const weeklyAnalytics: DailyAnalytics[] = Array.from({ length: 14 }).map((_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  const r = seededRandom(i + 100);
  return {
    date: d.toISOString().slice(0, 10),
    reviewsCompleted: Math.floor(r * 15) + 3,
    reviewsPlanned: 12,
    quizScore: Math.floor(r * 30) + 65,
    studyMinutes: Math.floor(r * 40) + 15,
    mistakes: Math.floor(r * 5),
    retentionRate: 70 + Math.floor(r * 25),
  };
});

export const scoreHistory = [620, 635, 648, 655, 670, 682, 690, 705, 712, 720, 728, 735, 742, 748];

export const teacherClasses: ClassRoom[] = [
  { id: "c1", name: "حلقة الفجر — المستوى الأول", studentsCount: 18, averageScore: 712, attendanceRate: 94 },
  { id: "c2", name: "حلقة العصر — المتقدمون", studentsCount: 12, averageScore: 845, attendanceRate: 91 },
  { id: "c3", name: "حلقة النساء — البقرة", studentsCount: 22, averageScore: 678, attendanceRate: 88 },
];

export const students: StudentSummary[] = [
  { id: "s1", name: "يوسف العتيبي", hafizScore: 820, streak: 21, weakPages: 4, lastActive: "منذ ساعة", progressPercent: 78 },
  { id: "s2", name: "عمر الحربي", hafizScore: 690, streak: 7, weakPages: 12, lastActive: "منذ 3 ساعات", progressPercent: 54 },
  { id: "s3", name: "خالد الشمري", hafizScore: 910, streak: 45, weakPages: 1, lastActive: "الآن", progressPercent: 92 },
  { id: "s4", name: "سعد القحطاني", hafizScore: 540, streak: 2, weakPages: 28, lastActive: "أمس", progressPercent: 31 },
  { id: "s5", name: "فهد الدوسري", hafizScore: 755, streak: 14, weakPages: 8, lastActive: "منذ ساعتين", progressPercent: 66 },
];

export const pageStats = {
  mastered: mushafPages.filter((p) => p.status === "MASTERED").length,
  good: mushafPages.filter((p) => p.status === "GOOD").length,
  needsReview: mushafPages.filter((p) => p.status === "NEEDS_REVIEW").length,
  weak: mushafPages.filter((p) => p.status === "WEAK").length,
  forgotten: mushafPages.filter((p) => p.status === "FORGOTTEN").length,
  notMemorized: mushafPages.filter((p) => p.status === "NOT_MEMORIZED").length,
};

export const quizTypes = [
  { id: "fill", type: "FILL_BLANK" as const, title: "أكمل الفراغ", description: "أكمل الكلمات المحذوفة من الآية", icon: "✏️" },
  { id: "next", type: "NEXT_AYAH" as const, title: "الآية التالية", description: "ما الآية التي تلي هذه؟", icon: "➡️" },
  { id: "prev", type: "PREV_AYAH" as const, title: "الآية السابقة", description: "ما الآية التي تسبق هذه؟", icon: "⬅️" },
  { id: "arrange", type: "ARRANGE" as const, title: "رتّب الآيات", description: "رتّب الآيات بالترتيب الصحيح", icon: "🔢" },
  { id: "word", type: "CHOOSE_WORD" as const, title: "اختر الكلمة", description: "اختر الكلمة الصحيحة", icon: "🔤" },
  { id: "surah", type: "IDENTIFY_SURAH" as const, title: "حدّد السورة", description: "من أي سورة هذه الآية؟", icon: "📗" },
  { id: "page", type: "IDENTIFY_PAGE" as const, title: "حدّد الصفحة", description: "في أي صفحة تقع الآية؟", icon: "📄" },
  { id: "juz", type: "IDENTIFY_JUZ" as const, title: "حدّد الجزء", description: "في أي جزء تقع الآية؟", icon: "📚" },
  { id: "mut", type: "MUTASHABIH_CHALLENGE" as const, title: "تحدي المتشابهات", description: "ميّز بين الآيات المتشابهة", icon: "✨" },
  { id: "speed", type: "SPEED" as const, title: "اختبار السرعة", description: "أجب بأقصى سرعة ممكنة", icon: "⚡" },
  { id: "weak", type: "WEAK_PAGES" as const, title: "الصفحات الضعيفة", description: "ركّز على نقاط ضعفك", icon: "🎯" },
  { id: "daily", type: "DAILY" as const, title: "اختبار اليوم", description: "اختبار يومي مخصّص لك", icon: "📅" },
  { id: "timed", type: "TIMED" as const, title: "موقوت", description: "اختبار بوقت محدد", icon: "⏱️" },
  { id: "random", type: "RANDOM" as const, title: "عشوائي", description: "مزيج عشوائي من كل الأنواع", icon: "🎲" },
];
