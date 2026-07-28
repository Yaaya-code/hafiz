/**
 * Scan full Quran for verbal mutashabihat. Balanced coverage across 114 surahs.
 * Output: src/lib/quran/data/mutashabihat-corpus.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../src/lib/quran/data");
const uthmani = JSON.parse(
  fs.readFileSync(path.join(dataDir, "uthmani-by-surah.json"), "utf8")
);

const NAMES_FALLBACK = {
  1: "الفاتحة", 2: "البقرة", 3: "آل عمران", 4: "النساء", 5: "المائدة", 6: "الأنعام",
  7: "الأعراف", 8: "الأنفال", 9: "التوبة", 10: "يونس", 11: "هود", 12: "يوسف",
  13: "الرعد", 14: "إبراهيم", 15: "الحجر", 16: "النحل", 17: "الإسراء", 18: "الكهف",
  19: "مريم", 20: "طه", 21: "الأنبياء", 22: "الحج", 23: "المؤمنون", 24: "النور",
  25: "الفرقان", 26: "الشعراء", 27: "النمل", 28: "القصص", 29: "العنكبوت", 30: "الروم",
  31: "لقمان", 32: "السجدة", 33: "الأحزاب", 34: "سبأ", 35: "فاطر", 36: "يس",
  37: "الصافات", 38: "ص", 39: "الزمر", 40: "غافر", 41: "فصلت", 42: "الشورى",
  43: "الزخرف", 44: "الدخان", 45: "الجاثية", 46: "الأحقاف", 47: "محمد", 48: "الفتح",
  49: "الحجرات", 50: "ق", 51: "الذاريات", 52: "الطور", 53: "النجم", 54: "القمر",
  55: "الرحمن", 56: "الواقعة", 57: "الحديد", 58: "المجادلة", 59: "الحشر", 60: "الممتحنة",
  61: "الصف", 62: "الجمعة", 63: "المنافقون", 64: "التغابن", 65: "الطلاق", 66: "التحريم",
  67: "الملك", 68: "القلم", 69: "الحاقة", 70: "المعارج", 71: "نوح", 72: "الجن",
  73: "المزمل", 74: "المدثر", 75: "القيامة", 76: "الإنسان", 77: "المرسلات", 78: "النبأ",
  79: "النازعات", 80: "عبس", 81: "التكوير", 82: "الانفطار", 83: "المطففين", 84: "الانشقاق",
  85: "البروج", 86: "الطارق", 87: "الأعلى", 88: "الغاشية", 89: "الفجر", 90: "البلد",
  91: "الشمس", 92: "الليل", 93: "الضحى", 94: "الشرح", 95: "التين", 96: "العلق",
  97: "القدر", 98: "البينة", 99: "الزلزلة", 100: "العاديات", 101: "القارعة", 102: "التكاثر",
  103: "العصر", 104: "الهمزة", 105: "الفيل", 106: "قريش", 107: "الماعون", 108: "الكوثر",
  109: "الكافرون", 110: "النصر", 111: "المسد", 112: "الإخلاص", 113: "الفلق", 114: "الناس",
};

function surahName(s) {
  return NAMES_FALLBACK[s] || "سورة " + s;
}

const JUZ = {
  1:1,2:1,3:3,4:4,5:6,6:7,7:8,8:9,9:10,10:11,11:11,12:12,13:13,14:13,15:14,16:14,
  17:15,18:15,19:16,20:16,21:17,22:17,23:18,24:18,25:18,26:19,27:19,28:20,29:21,30:21,
  31:21,32:21,33:21,34:22,35:22,36:22,37:23,38:23,39:23,40:24,41:24,42:25,43:25,44:25,
  45:25,46:26,47:26,48:26,49:26,50:26,51:26,52:27,53:27,54:27,55:27,56:27,57:27,58:28,
  59:28,60:28,61:28,62:28,63:28,64:28,65:28,66:28,67:29,68:29,69:29,70:29,71:29,72:29,
  73:29,74:29,75:29,76:29,77:29,78:30,79:30,80:30,81:30,82:30,83:30,84:30,85:30,86:30,
  87:30,88:30,89:30,90:30,91:30,92:30,93:30,94:30,95:30,96:30,97:30,98:30,99:30,100:30,
  101:30,102:30,103:30,104:30,105:30,106:30,107:30,108:30,109:30,110:30,111:30,112:30,
  113:30,114:30,
};

function normalizeWord(word) {
  return word
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u06E5\u06E6]/g, "")
    .replace(/ٱ/g, "ا")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF]/g, "")
    .trim();
}

const STOP = new Set(
  ["و","في","من","على","الي","عن","ما","لا","ان","الا","او","ثم","بل","قد","لم","لن","لو","مع","هو","هي","هم","هذا","هذه","ذلك","تلك","الذين","الذي","التي","كل","بين","بعد","قبل","يا"].map(normalizeWord)
);

function tokenize(text) {
  return text.split(/\s+/).map(normalizeWord).filter((w) => w.length > 0);
}
function contentTokens(words) {
  return words.filter((w) => w.length > 1 && !STOP.has(w));
}

const ayahs = [];
for (let s = 1; s <= 114; s++) {
  const verses = uthmani[String(s)] || [];
  for (let a = 0; a < verses.length; a++) {
    const text = verses[a];
    const words = tokenize(text);
    const content = contentTokens(words);
    ayahs.push({
      idx: ayahs.length,
      surahNumber: s,
      ayahNumber: a + 1,
      text,
      words,
      content,
      fullKey: words.join(" "),
    });
  }
}
console.log("Loaded", ayahs.length, "ayahs");

function makeRef(ay) {
  return {
    surahNumber: ay.surahNumber,
    surahName: surahName(ay.surahNumber),
    ayahNumber: ay.ayahNumber,
    text: ay.text,
    highlightWords: [],
    contextNote: surahName(ay.surahNumber) + ": " + ay.ayahNumber,
  };
}

function groupFromMembers(members, phrase, kind) {
  const keys = new Set(members.map((m) => m.fullKey));
  const isExact = keys.size === 1;
  const title = members
    .slice(0, 5)
    .map((m) => surahName(m.surahNumber) + ":" + m.ayahNumber)
    .join(" / ");
  const juz = [...new Set(members.map((m) => JUZ[m.surahNumber] || 1))].sort(
    (a, b) => a - b
  );
  return {
    id: "tmp",
    type: kind || (isExact ? "SIMILAR_STRUCTURE" : "SIMILAR_PHRASES"),
    difficulty: Math.min(5, Math.max(2, Math.ceil(members.length / 2) + (isExact ? 0 : 1))),
    title,
    description: isExact
      ? "تطابق لفظي — نفس العبارة في مواضع متعددة"
      : "متشابه لفظي — مكتشف من مسح القرآن كاملاً",
    differenceExplain: isExact
      ? "النص متطابق في أكثر من موضع — احفظ رقم السورة والآية."
      : "عبارة متشابهة: «" + (phrase || "…") + "» — لاحظ الفرق في بقية الآية.",
    tips: [
      isExact ? "احفظ موضع كل تكرار (السورة والآية)" : "ميّز الكلمة المختلفة حول العبارة المشتركة",
      "راجع السياق قبل وبعد الآية",
    ],
    juz,
    ayahs: members.map(makeRef),
  };
}

const groups = [];
const seenKeys = new Set();

function addGroup(g) {
  const key = g.ayahs
    .map((a) => a.surahNumber + ":" + a.ayahNumber)
    .sort()
    .join("|");
  if (seenKeys.has(key)) return false;
  if (g.ayahs.length < 2) return false;
  seenKeys.add(key);
  groups.push(g);
  return true;
}

// 1) Exact full-text duplicates → one group per text
const exactMap = new Map();
for (const ay of ayahs) {
  if (ay.words.length < 2) continue;
  if (!exactMap.has(ay.fullKey)) exactMap.set(ay.fullKey, []);
  exactMap.get(ay.fullKey).push(ay);
}
for (const [, list] of exactMap) {
  if (list.length < 2) continue;
  // one group with all occurrences (cap display at 12, keep all up to 20)
  const members = list.slice(0, 20);
  addGroup(
    groupFromMembers(
      members,
      "تطابق كامل",
      list.length > 5 ? "SIMILAR_STRUCTURE" : "SIMILAR_PHRASES"
    )
  );
}

// 2) N-gram index 2/3/4 content words
const ngramMap = new Map();
function addGrams(ay, n) {
  const c = ay.content;
  if (c.length < n) return;
  for (let i = 0; i <= c.length - n; i++) {
    const gram = c.slice(i, i + n).join(" ");
    if (gram.length < 5) continue;
    if (!ngramMap.has(gram)) ngramMap.set(gram, new Set());
    ngramMap.get(gram).add(ay.idx);
  }
}
for (const ay of ayahs) {
  addGrams(ay, 2);
  addGrams(ay, 3);
  addGrams(ay, 4);
}

// Score pairs
const pairScore = new Map();
function bump(i, j, score, phrase) {
  if (i === j) return;
  const a = Math.min(i, j);
  const b = Math.max(i, j);
  const key = a + "|" + b;
  let rec = pairScore.get(key);
  if (!rec) {
    rec = { i: a, j: b, score: 0, phrases: [] };
    pairScore.set(key, rec);
  }
  rec.score += score;
  if (phrase && rec.phrases.length < 3 && !rec.phrases.includes(phrase)) {
    rec.phrases.push(phrase);
  }
}

for (const [gram, set] of ngramMap) {
  // skip ultra-common (e.g. very frequent short phrases)
  if (set.size < 2) continue;
  if (set.size > 35) continue;
  const n = gram.split(" ").length;
  let weight = n === 4 ? 10 : n === 3 ? 6 : 3;
  if (set.size > 15) weight *= 0.5;
  // skip pure 2-gram if too frequent
  if (n === 2 && set.size > 8) continue;
  const arr = [...set];
  for (let x = 0; x < arr.length; x++) {
    for (let y = x + 1; y < arr.length; y++) {
      // skip if exact same text (already grouped)
      if (ayahs[arr[x]].fullKey === ayahs[arr[y]].fullKey) continue;
      bump(arr[x], arr[y], weight, gram);
    }
  }
}

// endings / beginnings
const endMap = new Map();
const startMap = new Map();
for (const ay of ayahs) {
  const c = ay.content;
  if (c.length < 3) continue;
  const end = c.slice(-2).join(" ");
  const start = c.slice(0, 2).join(" ");
  if (end.length >= 5) {
    if (!endMap.has(end)) endMap.set(end, []);
    endMap.get(end).push(ay.idx);
  }
  if (start.length >= 5) {
    if (!startMap.has(start)) startMap.set(start, []);
    startMap.get(start).push(ay.idx);
  }
}
for (const [k, arr] of endMap) {
  if (arr.length < 2 || arr.length > 20) continue;
  for (let x = 0; x < arr.length; x++) {
    for (let y = x + 1; y < arr.length; y++) {
      if (ayahs[arr[x]].fullKey === ayahs[arr[y]].fullKey) continue;
      bump(arr[x], arr[y], 4, "خاتمة: " + k);
    }
  }
}
for (const [k, arr] of startMap) {
  if (arr.length < 2 || arr.length > 20) continue;
  for (let x = 0; x < arr.length; x++) {
    for (let y = x + 1; y < arr.length; y++) {
      if (ayahs[arr[x]].fullKey === ayahs[arr[y]].fullKey) continue;
      bump(arr[x], arr[y], 3, "بداية: " + k);
    }
  }
}

const pairs = [...pairScore.values()]
  .filter((p) => p.score >= 8)
  .sort((a, b) => b.score - a.score);

console.log("Scored pairs", pairs.length);

// Add best pairs, with per-surah quotas for balance
const surahQuota = {};
for (let s = 1; s <= 114; s++) surahQuota[s] = 0;
const MAX_PER_SURAH = 40;
const MAX_TOTAL = 1800;

for (const p of pairs) {
  if (groups.length >= MAX_TOTAL) break;
  const a = ayahs[p.i];
  const b = ayahs[p.j];
  // skip adjacent same-surah low-score noise
  if (
    a.surahNumber === b.surahNumber &&
    Math.abs(a.ayahNumber - b.ayahNumber) <= 1 &&
    p.score < 18
  ) {
    continue;
  }
  if (surahQuota[a.surahNumber] >= MAX_PER_SURAH && surahQuota[b.surahNumber] >= MAX_PER_SURAH) {
    continue;
  }
  const g = groupFromMembers(
    [a, b],
    p.phrases[0] || "",
    p.phrases[0]?.startsWith("خاتمة")
      ? "SIMILAR_ENDINGS"
      : p.phrases[0]?.startsWith("بداية")
        ? "SIMILAR_BEGINNINGS"
        : "SIMILAR_PHRASES"
  );
  if (addGroup(g)) {
    surahQuota[a.surahNumber]++;
    surahQuota[b.surahNumber]++;
  }
}

// 3) Extra pass for missing/short surahs — looser matching
const cover = {};
for (let s = 1; s <= 114; s++) cover[s] = 0;
for (const g of groups) {
  const sset = new Set(g.ayahs.map((a) => a.surahNumber));
  for (const s of sset) cover[s]++;
}

const missing = [];
for (let s = 1; s <= 114; s++) if (cover[s] === 0) missing.push(s);
console.log("After main pass, missing:", missing.join(","));

// For each missing surah ayah, find best partner by content overlap Jaccard
function jaccard(a, b) {
  const A = new Set(a.content);
  const B = new Set(b.content);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

for (const s of missing) {
  const local = ayahs.filter((a) => a.surahNumber === s && a.content.length >= 1);
  for (const ay of local) {
    let best = null;
    let bestScore = 0;
    // search whole corpus but prefer other surahs
    for (const other of ayahs) {
      if (other.idx === ay.idx) continue;
      if (other.fullKey === ay.fullKey) {
        best = other;
        bestScore = 1;
        break;
      }
      // require at least 2 shared content words for short ayahs
      const shared = ay.content.filter((w) => other.content.includes(w));
      if (shared.length < 2 && ay.content.length >= 2) continue;
      if (shared.length < 1) continue;
      const sc = jaccard(ay, other);
      // boost longer shared phrases
      let bonus = 0;
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i <= ay.content.length - n; i++) {
          const gram = ay.content.slice(i, i + n).join(" ");
          if (other.content.join(" ").includes(gram)) bonus += n * 0.1;
        }
      }
      const total = sc + bonus;
      if (total > bestScore && total >= 0.35) {
        bestScore = total;
        best = other;
      }
    }
    if (best) {
      addGroup(
        groupFromMembers(
          [ay, best],
          ay.content.slice(0, 3).join(" "),
          "SIMILAR_WORDS"
        )
      );
      cover[s]++;
    }
  }
}

// Known short-surah mutashabihat boost (قل-series, etc.)
const knownClusters = [
  // Qul openings
  [
    [109, 1],
    [112, 1],
    [113, 1],
    [114, 1],
  ],
  // Al-Fatiha praise vs others with الحمد
  [
    [1, 2],
    [6, 1],
    [18, 1],
    [34, 1],
    [35, 1],
  ],
  // isti'adha
  [
    [113, 1],
    [114, 1],
  ],
  // ربّك patterns — short surahs
  [
    [105, 1],
    [93, 3],
    [94, 1],
  ],
  // قريش / عبادة البيت
  [
    [106, 3],
    [2, 21],
  ],
  [
    [106, 4],
    [16, 112],
  ],
  // الكوثر / ربّك
  [
    [108, 2],
    [15, 98],
  ],
  [
    [108, 1],
    [108, 3],
  ],
  // الماعون / يتيم
  [
    [107, 2],
    [89, 17],
  ],
  // الفيل / ربك
  [
    [105, 1],
    [89, 6],
  ],
];

function findAyah(s, a) {
  return ayahs.find((x) => x.surahNumber === s && x.ayahNumber === a);
}

for (const cluster of knownClusters) {
  const members = cluster.map(([s, a]) => findAyah(s, a)).filter(Boolean);
  if (members.length >= 2) {
    addGroup(
      groupFromMembers(members, "بدايات متشابهة", "SIMILAR_BEGINNINGS")
    );
  }
}

// Sort and id
groups.sort(
  (a, b) =>
    a.ayahs[0].surahNumber - b.ayahs[0].surahNumber ||
    a.ayahs[0].ayahNumber - b.ayahs[0].ayahNumber
);
groups.forEach((g, i) => {
  g.id = "corp_" + (i + 1);
});

// Final coverage
const finalCover = {};
for (let s = 1; s <= 114; s++) finalCover[s] = 0;
for (const g of groups) {
  const sset = new Set(g.ayahs.map((a) => a.surahNumber));
  for (const s of sset) finalCover[s]++;
}
const stillMissing = [];
for (let s = 1; s <= 114; s++) if (finalCover[s] === 0) stillMissing.push(s);

const outPath = path.join(dataDir, "mutashabihat-corpus.json");
fs.writeFileSync(outPath, JSON.stringify(groups, null, 2), "utf8");
console.log("Wrote", groups.length, "groups");
console.log(
  "Surahs covered:",
  Object.values(finalCover).filter((n) => n > 0).length,
  "/ 114"
);
console.log("Still missing:", stillMissing.join(",") || "none");
console.log(
  "Sample counts:",
  [1, 2, 18, 55, 112, 113, 114]
    .map((s) => surahName(s) + "=" + finalCover[s])
    .join(", ")
);
