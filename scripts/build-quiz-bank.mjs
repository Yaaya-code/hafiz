/**
 * Generates a massive real quiz bank from 114 surahs metadata +
 * curated Islamic Q&A. Writes data/quiz-bank.json for seed + API.
 *
 * Run: node scripts/build-quiz-bank.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Minimal surah meta (authoritative Madani counts)
const SURAHS = [
  [1, "الفاتحة", 7, "Meccan"],
  [2, "البقرة", 286, "Medinan"],
  [3, "آل عمران", 200, "Medinan"],
  [4, "النساء", 176, "Medinan"],
  [5, "المائدة", 120, "Medinan"],
  [6, "الأنعام", 165, "Meccan"],
  [7, "الأعراف", 206, "Meccan"],
  [8, "الأنفال", 75, "Medinan"],
  [9, "التوبة", 129, "Medinan"],
  [10, "يونس", 109, "Meccan"],
  [11, "هود", 123, "Meccan"],
  [12, "يوسف", 111, "Meccan"],
  [13, "الرعد", 43, "Medinan"],
  [14, "إبراهيم", 52, "Meccan"],
  [15, "الحجر", 99, "Meccan"],
  [16, "النحل", 128, "Meccan"],
  [17, "الإسراء", 111, "Meccan"],
  [18, "الكهف", 110, "Meccan"],
  [19, "مريم", 98, "Meccan"],
  [20, "طه", 135, "Meccan"],
  [21, "الأنبياء", 112, "Meccan"],
  [22, "الحج", 78, "Medinan"],
  [23, "المؤمنون", 118, "Meccan"],
  [24, "النور", 64, "Medinan"],
  [25, "الفرقان", 77, "Meccan"],
  [26, "الشعراء", 227, "Meccan"],
  [27, "النمل", 93, "Meccan"],
  [28, "القصص", 88, "Meccan"],
  [29, "العنكبوت", 69, "Meccan"],
  [30, "الروم", 60, "Meccan"],
  [31, "لقمان", 34, "Meccan"],
  [32, "السجدة", 30, "Meccan"],
  [33, "الأحزاب", 73, "Medinan"],
  [34, "سبأ", 54, "Meccan"],
  [35, "فاطر", 45, "Meccan"],
  [36, "يس", 83, "Meccan"],
  [37, "الصافات", 182, "Meccan"],
  [38, "ص", 88, "Meccan"],
  [39, "الزمر", 75, "Meccan"],
  [40, "غافر", 85, "Meccan"],
  [41, "فصلت", 54, "Meccan"],
  [42, "الشورى", 53, "Meccan"],
  [43, "الزخرف", 89, "Meccan"],
  [44, "الدخان", 59, "Meccan"],
  [45, "الجاثية", 37, "Meccan"],
  [46, "الأحقاف", 35, "Meccan"],
  [47, "محمد", 38, "Medinan"],
  [48, "الفتح", 29, "Medinan"],
  [49, "الحجرات", 18, "Medinan"],
  [50, "ق", 45, "Meccan"],
  [51, "الذاريات", 60, "Meccan"],
  [52, "الطور", 49, "Meccan"],
  [53, "النجم", 62, "Meccan"],
  [54, "القمر", 55, "Meccan"],
  [55, "الرحمن", 78, "Medinan"],
  [56, "الواقعة", 96, "Meccan"],
  [57, "الحديد", 29, "Medinan"],
  [58, "المجادلة", 22, "Medinan"],
  [59, "الحشر", 24, "Medinan"],
  [60, "الممتحنة", 13, "Medinan"],
  [61, "الصف", 14, "Medinan"],
  [62, "الجمعة", 11, "Medinan"],
  [63, "المنافقون", 11, "Medinan"],
  [64, "التغابن", 18, "Medinan"],
  [65, "الطلاق", 12, "Medinan"],
  [66, "التحريم", 12, "Medinan"],
  [67, "الملك", 30, "Meccan"],
  [68, "القلم", 52, "Meccan"],
  [69, "الحاقة", 52, "Meccan"],
  [70, "المعارج", 44, "Meccan"],
  [71, "نوح", 28, "Meccan"],
  [72, "الجن", 28, "Meccan"],
  [73, "المزمل", 20, "Meccan"],
  [74, "المدثر", 56, "Meccan"],
  [75, "القيامة", 40, "Meccan"],
  [76, "الإنسان", 31, "Medinan"],
  [77, "المرسلات", 50, "Meccan"],
  [78, "النبأ", 40, "Meccan"],
  [79, "النازعات", 46, "Meccan"],
  [80, "عبس", 42, "Meccan"],
  [81, "التكوير", 29, "Meccan"],
  [82, "الانفطار", 19, "Meccan"],
  [83, "المطففين", 36, "Meccan"],
  [84, "الانشقاق", 25, "Meccan"],
  [85, "البروج", 22, "Meccan"],
  [86, "الطارق", 17, "Meccan"],
  [87, "الأعلى", 19, "Meccan"],
  [88, "الغاشية", 26, "Meccan"],
  [89, "الفجر", 30, "Meccan"],
  [90, "البلد", 20, "Meccan"],
  [91, "الشمس", 15, "Meccan"],
  [92, "الليل", 21, "Meccan"],
  [93, "الضحى", 11, "Meccan"],
  [94, "الشرح", 8, "Meccan"],
  [95, "التين", 8, "Meccan"],
  [96, "العلق", 19, "Meccan"],
  [97, "القدر", 5, "Meccan"],
  [98, "البينة", 8, "Medinan"],
  [99, "الزلزلة", 8, "Medinan"],
  [100, "العاديات", 11, "Meccan"],
  [101, "القارعة", 11, "Meccan"],
  [102, "التكاثر", 8, "Meccan"],
  [103, "العصر", 3, "Meccan"],
  [104, "الهمزة", 9, "Meccan"],
  [105, "الفيل", 5, "Meccan"],
  [106, "قريش", 4, "Meccan"],
  [107, "الماعون", 7, "Meccan"],
  [108, "الكوثر", 3, "Meccan"],
  [109, "الكافرون", 6, "Meccan"],
  [110, "النصر", 3, "Medinan"],
  [111, "المسد", 5, "Meccan"],
  [112, "الإخلاص", 4, "Meccan"],
  [113, "الفلق", 5, "Meccan"],
  [114, "الناس", 6, "Meccan"],
].map(([number, nameAr, ayahCount, revelationType]) => ({
  number,
  nameAr,
  ayahCount,
  revelationType,
}));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(correct, pool, n = 3) {
  const others = pool.filter((x) => x !== correct);
  return shuffle(others).slice(0, n);
}

function mcq(id, prompt, correctText, wrongTexts, extra = {}) {
  const opts = shuffle([
    { key: "a", text: correctText },
    ...wrongTexts.map((t, i) => ({ key: String.fromCharCode(98 + i), text: t })),
  ]);
  // remap keys a-d in display order but answer = key of correct
  const remapped = opts.map((o, i) => ({
    key: String.fromCharCode(97 + i),
    text: o.text,
  }));
  const answer = remapped.find((o) => o.text === correctText).key;
  return {
    id,
    type: "mcq",
    prompt,
    answer,
    options: remapped,
    ...extra,
  };
}

const questions = [];
let qn = 0;
const nextId = (prefix) => `${prefix}_${++qn}`;

// ── Surah bank: ~5 questions × 114 = 570+ ───────────────────────────────
const names = SURAHS.map((s) => s.nameAr);
const counts = [...new Set(SURAHS.map((s) => String(s.ayahCount)))];

for (const s of SURAHS) {
  const wrongNames = pickDistractors(s.nameAr, names, 3);
  questions.push(
    mcq(
      nextId("sname"),
      `ما اسم السورة رقم ${s.number} في المصحف؟`,
      s.nameAr,
      wrongNames,
      {
        category: "hifz",
        surahNumber: s.number,
        difficulty: 1,
        source: "surah-meta",
        explanationAr: `السورة رقم ${s.number} هي ${s.nameAr}.`,
      }
    )
  );

  const wrongCounts = pickDistractors(String(s.ayahCount), counts, 3);
  questions.push(
    mcq(
      nextId("scount"),
      `كم عدد آيات سورة ${s.nameAr}؟`,
      String(s.ayahCount),
      wrongCounts,
      {
        category: "hifz",
        surahNumber: s.number,
        difficulty: 2,
        source: "surah-meta",
        explanationAr: `سورة ${s.nameAr} عدد آياتها ${s.ayahCount}.`,
      }
    )
  );

  const revAr = s.revelationType === "Meccan" ? "مكية" : "مدنية";
  const wrongRev = revAr === "مكية" ? "مدنية" : "مكية";
  questions.push({
    id: nextId("srev"),
    type: "true_false",
    prompt: `سورة ${s.nameAr} ${revAr === "مكية" ? "مكية" : "مدنية"}.`,
    answer: "t",
    options: [
      { key: "t", text: "صحيح" },
      { key: "f", text: "خطأ" },
    ],
    category: "hifz",
    surahNumber: s.number,
    difficulty: 1,
    source: "surah-meta",
    explanationAr: `سورة ${s.nameAr} ${revAr}. (الخيار الخاطئ: ${wrongRev})`,
  });

  // reverse: name → number
  const wrongNums = pickDistractors(
    String(s.number),
    SURAHS.map((x) => String(x.number)),
    3
  );
  questions.push(
    mcq(
      nextId("snum"),
      `ما رقم سورة ${s.nameAr} في ترتيب المصحف؟`,
      String(s.number),
      wrongNums,
      {
        category: "hifz",
        surahNumber: s.number,
        difficulty: 2,
        source: "surah-meta",
      }
    )
  );

  // fill blank name
  questions.push({
    id: nextId("sfill"),
    type: "fill_blank",
    prompt: `أكمل: السورة رقم ${s.number} اسمها «____».`,
    answer: s.nameAr,
    category: "hifz",
    surahNumber: s.number,
    difficulty: 2,
    source: "surah-meta",
  });

  // ayah count fill
  questions.push({
    id: nextId("scfill"),
    type: "fill_blank",
    prompt: `أكمل بالرقم: عدد آيات سورة ${s.nameAr} هو ____.`,
    answer: String(s.ayahCount),
    category: "hifz",
    surahNumber: s.number,
    difficulty: 2,
    source: "surah-meta",
  });

  // longer/shorter comparison with neighbor
  if (s.number < 114) {
    const next = SURAHS[s.number]; // 0-index: number N is index N-1, next is index N
    if (next) {
      const longer =
        s.ayahCount >= next.ayahCount ? s.nameAr : next.nameAr;
      const other = longer === s.nameAr ? next.nameAr : s.nameAr;
      questions.push(
        mcq(
          nextId("slen"),
          `أيّ السورتين أطول عدد آيات: ${s.nameAr} أم ${next.nameAr}؟`,
          longer,
          [other, "متساويتان دائماً", "لا يُعلم"],
          {
            category: "hifz",
            surahNumber: s.number,
            difficulty: 2,
            source: "surah-meta",
          }
        )
      );
    }
  }
}

// Neighbor order questions (113)
for (let i = 0; i < SURAHS.length - 1; i++) {
  const a = SURAHS[i];
  const b = SURAHS[i + 1];
  const wrong = pickDistractors(b.nameAr, names, 3);
  questions.push(
    mcq(
      nextId("snext"),
      `ما السورة التي تلي سورة ${a.nameAr} مباشرة؟`,
      b.nameAr,
      wrong,
      {
        category: "hifz",
        surahNumber: a.number,
        difficulty: 3,
        source: "surah-order",
      }
    )
  );
}

// ── Religious / general Islamic bank (curated real Qs) ─────────────────
const RELIGIOUS = [
  ["كم عدد أركان الإسلام؟", "خمسة", ["أربعة", "ستة", "سبعة"]],
  ["كم عدد أركان الإيمان؟", "ستة", ["خمسة", "سبعة", "أربعة"]],
  ["ما أول أركان الإسلام؟", "الشهادتان", ["الصلاة", "الزكاة", "الصيام"]],
  ["في أي شهر فُرض صيام رمضان؟", "شعبان في السنة الثانية", ["رمضان الأول", "محرم", "ذو الحجة"]],
  ["كم عدد الصلوات المفروضة في اليوم والليلة؟", "خمس", ["ثلاث", "أربع", "ست"]],
  ["ما قبلة المسلمين؟", "الكعبة المشرفة", ["المسجد الأقصى", "المسجد النبوي", "جبل عرفات"]],
  ["من أول الرسل إلى أهل الأرض؟", "نوح عليه السلام", ["إبراهيم", "موسى", "آدم كأول البشر وليس رسولاً بنفس المعنى الشائع — اختر نوحاً في كثير من المتون"]],
  ["ما اسم أم النبي محمد ﷺ؟", "آمنة بنت وهب", ["خديجة", "فاطمة", "حليمة"]],
  ["ما اسم والد النبي محمد ﷺ؟", "عبد الله بن عبد المطلب", ["أبو طالب", "عبد المطلب", "حمزة"]],
  ["في أي عام وُلد النبي ﷺ تقريباً؟", "عام الفيل", ["عام الحزن", "عام الهجرة", "عام الفتح"]],
  ["إلى أين كانت الهجرة النبوية؟", "المدينة المنورة", ["الطائف", "الشام", "اليمن"]],
  ["ما اسم الغار الذي نزل فيه أول وحي؟", "غار حراء", ["غار ثور", "غار أحد", "غار حنين"]],
  ["من أول من آمن من الرجال؟", "أبو بكر الصديق", ["عمر", "عثمان", "علي"]],
  ["من أول من آمن من الصبيان؟", "علي بن أبي طالب", ["زيد", "أنس", "ابن عباس"]],
  ["كم سنة استمرت الدعوة في مكة قبل الهجرة؟", "نحو ١٣ سنة", ["١٠", "٧", "٢٠"]],
  ["ما آخر سورة نزلت كاملة على الأرجح عند كثير من العلماء؟", "النصر", ["البقرة", "المائدة", "التوبة"]],
  ["كم جزءاً في المصحف؟", "ثلاثون", ["ستون", "أربعة عشر", "عشرون"]],
  ["كم حزبًا في المصحف على التقسيم الشائع؟", "ستون", ["ثلاثون", "أربعة عشر", "١٢٠"]],
  ["ما أقصر سورة في القرآن؟", "الكوثر", ["العصر", "الإخلاص", "النصر"]],
  ["ما أطول سورة في القرآن؟", "البقرة", ["آل عمران", "النساء", "الأعراف"]],
  ["سورة تسمى قلب القرآن في حديث مشهور؟", "يس", ["الفاتحة", "الإخلاص", "الرحمن"]],
  ["كم عدد آيات سورة الإخلاص؟", "أربع", ["ثلاث", "خمس", "ست"]],
  ["ما السورة التي لا تبدأ بالبسملة؟", "التوبة", ["الأنفال", "النور", "الفتح"]],
  ["في أي ليلة يُرجى ليلة القدر؟", "الوتر من العشر الأواخر من رمضان", ["أول رمضان", "نصف شعبان فقط", "يوم عرفة"]],
  ["ما ركن الحج الأعظم؟", "الوقوف بعرفة", ["الطواف", "السعي", "الرمي"]],
  ["كم سجدة للتلاوة في القرآن على القول المشهور؟", "١٥ أو ١٤ حسب المذاهب", ["٧", "١٠", "٢٠"]],
  ["من جمع القرآن في مصحف واحد في عهد أبي بكر؟", "زيد بن ثابت بأمر أبي بكر", ["ابن مسعود", "أبيّ بن كعب وحده", "عمر فقط"]],
  ["ما اسم زوجة النبي الأولى؟", "خديجة بنت خويلد", ["عائشة", "حفصة", "سودة"]],
  ["كم غزوة غزاها النبي ﷺ تقريباً؟", "نحو ٢٧ غزوة", ["١٠", "٥", "٥٠"]],
  ["ما اسم معركة انتصر فيها المسلمون يوم الفرقان؟", "بدر", ["أحد", "الخندق", "حنين"]],
  ["في أي سنة هجرية فُتحت مكة؟", "٨ هـ", ["١ هـ", "٥ هـ", "١٠ هـ"]],
  ["ما نصاب زكاة النقدين تقريباً بالفضة الشرعية؟", "٢٠٠ درهم فضة", ["١٠ دراهم", "١٠٠٠ درهم", "لا نصاب"]],
  ["من هم الخلفاء الراشدون الأربعة؟", "أبو بكر وعمر وعثمان وعلي", ["معاوية ويزيد", "العباس والزبير", "أبو عبيدة وسعد"]],
  ["ما الكتاب الذي أُنزل على موسى عليه السلام؟", "التوراة", ["الإنجيل", "الزبور", "الصحف"]],
  ["ما الكتاب الذي أُنزل على داود عليه السلام؟", "الزبور", ["التوراة", "الإنجيل", "القرآن"]],
  ["ما الكتاب الذي أُنزل على عيسى عليه السلام؟", "الإنجيل", ["التوراة", "الزبور", "الصحف"]],
  ["كم عدة المطلقة غير الحامل ذوات الأقراء؟", "ثلاثة قروء", ["شهر", "أربعة أشهر وعشر", "حولين"]],
  ["ما حكم تارك الصلاة تكاسلاً عند جمهور العلماء؟", "فاسق عاصٍ يُستتاب", ["كافر بالإجماع دون خلاف", "مباح", "مستحب الترك"]],
  ["ما أول ما يُحاسب عليه العبد يوم القيامة من عمله؟", "الصلاة", ["الزكاة", "الصيام", "بر الوالدين"]],
  ["ما أعظم آية في القرآن في حديث مشهور؟", "آية الكرسي", ["آخر البقرة", "الفاتحة", "الإخلاص"]],
  ["سورة تُقرأ في كل ركعة من الصلاة؟", "الفاتحة", ["الإخلاص", "الكوثر", "العصر"]],
  ["ما اسم ملك الوحي؟", "جبريل عليه السلام", ["ميكائيل", "إسرافيل", "مالك"]],
  ["من هو خاتم الأنبياء؟", "محمد ﷺ", ["عيسى", "موسى", "إبراهيم"]],
  ["كم عدد زوجات النبي ﷺ أمهات المؤمنين المشهورات؟", "إحدى عشرة", ["أربع", "تسع", "سبع"]],
  ["ما اسم غزوة حفر فيها الخندق؟", "الأحزاب / الخندق", ["بدر", "أحد", "تبوك"]],
  ["أين دُفن النبي ﷺ؟", "في حجرة عائشة بالمدينة", ["البقيع", "مكة", "أحد"]],
  ["ما حكم صيام يوم عرفة لغير الحاج؟", "مستحب", ["واجب", "محرم", "مكروه تحريماً"]],
  ["ما حكم صيام يوم عاشوراء؟", "مستحب", ["واجب", "محرم", "مباح بلا فضل"]],
  ["كم سجدة في صلاة الصبح؟", "أربع سجدات (ركعتان × ٢)", ["سجدتان", "ست", "ثمان"]],
  ["ما الطهارة من الحدث الأكبر؟", "الغسل", ["الوضوء فقط", "التيمم دائماً", "المسح على الخفين"]],
];

for (const [prompt, correct, wrongs] of RELIGIOUS) {
  questions.push(
    mcq(nextId("rel"), prompt, correct, wrongs.slice(0, 3), {
      category: "religious",
      difficulty: 2,
      source: "islamic-general",
    })
  );
}

// Meanings samples tied to famous surahs
const MEANINGS = [
  [1, "ما معنى «رب العالمين»؟", "خالق ومالك جميع الخلق", ["رب قريش فقط", "ملك الأرض فقط", "اسم نبي"]],
  [1, "ما معنى «يوم الدين»؟", "يوم الجزاء والحساب", ["يوم الجمعة", "يوم عرفة", "يوم الميلاد"]],
  [2, "ما موضوع بارز في أوائل البقرة؟", "صفات المؤمنين والكاففين والمنافقين", ["أحكام الحج فقط", "قصص يوسف فقط", "غزوات النبي فقط"]],
  [18, "من أصحاب الكهف؟", "فتية آمنوا بربهم فآواهم الله في الكهف", ["قوم نوح", "أصحاب الفيل", "جنود فرعون"]],
  [36, "سورة يس تُسمى في الأثر الشائع؟", "قلب القرآن", ["أم الكتاب", "العروس", "الكنز"]],
  [55, "بأي شيء تتكرر آية في الرحمن؟", "فبأي آلاء ربكما تكذبان", ["ألا بذكر الله", "إن مع العسر يسرا", "حسبنا الله"]],
  [112, "سورة الإخلاص تتحدث أساساً عن؟", "توحيد الله وصفاته", ["أحكام الطهارة", "قصص الأنبياء", "مناسك الحج"]],
  [113, "الفلق والناس تُسميان؟", "المعوذتين", ["الزهراوين", "المسبحات", "الحواميم"]],
];

for (const [surahNumber, prompt, correct, wrongs] of MEANINGS) {
  questions.push(
    mcq(nextId("mean"), prompt, correct, wrongs, {
      category: "meanings",
      surahNumber,
      difficulty: 2,
      source: "meanings-core",
    })
  );
}

// Expand meanings with per-surah "what is this surah about" style using revelation type
for (const s of SURAHS) {
  if (s.number % 2 === 0) {
    questions.push(
      mcq(
        nextId("mrev"),
        `سورة ${s.nameAr} من حيث النزول تُصنَّف غالباً كـ:`,
        s.revelationType === "Meccan" ? "مكية" : "مدنية",
        s.revelationType === "Meccan"
          ? ["مدنية", "لا تُصنَّف", "مختلطة بلا قول"]
          : ["مكية", "لا تُصنَّف", "مختلطة بلا قول"],
        {
          category: "meanings",
          surahNumber: s.number,
          difficulty: 1,
          source: "surah-meta",
        }
      )
    );
  }
}

const bank = {
  version: 1,
  generatedAt: new Date().toISOString(),
  categories: [
    {
      slug: "hifz",
      nameAr: "حفظ ومعرفة السور",
      descriptionAr: "أسئلة عن أسماء السور وأعداد الآيات وترتيبها",
    },
    {
      slug: "meanings",
      nameAr: "معاني وتفسير مبسّط",
      descriptionAr: "أسئلة فهم عامة مرتبطة بسور مشهورة",
    },
    {
      slug: "religious",
      nameAr: "أسئلة دينية عامة",
      descriptionAr: "عقيدة · فقه مبسّط · سيرة · أركان",
    },
  ],
  questions,
  stats: {
    total: questions.length,
    byCategory: {
      hifz: questions.filter((q) => q.category === "hifz").length,
      meanings: questions.filter((q) => q.category === "meanings").length,
      religious: questions.filter((q) => q.category === "religious").length,
    },
  },
};

const outDir = path.join(root, "data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "quiz-bank.json");
fs.writeFileSync(outPath, JSON.stringify(bank, null, 0), "utf8");
console.log(
  `Wrote ${bank.stats.total} questions → ${outPath}`,
  bank.stats.byCategory
);
