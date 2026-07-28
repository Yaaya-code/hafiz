import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../src/lib/quran/data");
const groupsPath = path.join(dataDir, "mutashabihat-groups.json");

const groups = JSON.parse(fs.readFileSync(groupsPath, "utf8"));

function cleanTip(t) {
  let s = String(t || "");
  const cutMarkers = [
    "/p>",
    '"/>',
    "meta name",
    "function ",
    "content=",
    "... /p",
  ];
  for (const m of cutMarkers) {
    const i = s.indexOf(m);
    if (i > 10) s = s.slice(0, i);
  }
  // cut Arabic site chrome if present
  const alukah = s.indexOf("قواعد ضبط");
  if (alukah > 15) s = s.slice(0, alukah);

  s = s
    .replace(/\s+/g, " ")
    .replace(/[♦·]+/g, " ")
    .replace(/\[\d+\]/g, "")
    .replace(/^[:\s]+/, "")
    .trim();

  // Prefer first clause before a numbered dump "1-"
  const dump = s.search(/\s1\s*[-–]/);
  if (dump > 20) s = s.slice(0, dump).trim();

  if (s.length > 180) s = s.slice(0, 177) + "…";
  if (s.length < 4) s = "راجع الفرق بين المواضع واحفظ السياق";
  return s;
}

for (const g of groups) {
  g.differenceExplain = cleanTip(g.differenceExplain);
  g.tips = [
    g.differenceExplain,
    "احفظ السياق قبل وبعد الآية",
    "ميّز الكلمة المختلفة",
  ];
}

// Drop subset groups when a superset already covers the same ayahs
const keys = groups.map(
  (g) => new Set(g.ayahs.map((a) => a.surahNumber + ":" + a.ayahNumber))
);
const keep = [];
for (let i = 0; i < groups.length; i++) {
  let isSubset = false;
  for (let j = 0; j < groups.length; j++) {
    if (i === j) continue;
    if (keys[i].size >= keys[j].size) continue;
    let all = true;
    for (const k of keys[i]) {
      if (!keys[j].has(k)) {
        all = false;
        break;
      }
    }
    if (all) {
      isSubset = true;
      break;
    }
  }
  if (!isSubset) keep.push(groups[i]);
}

keep.sort(
  (a, b) =>
    a.ayahs[0].surahNumber - b.ayahs[0].surahNumber ||
    a.ayahs[0].ayahNumber - b.ayahs[0].ayahNumber
);
keep.forEach((g, i) => {
  g.id = "mt_" + (i + 1);
});

fs.writeFileSync(groupsPath, JSON.stringify(keep, null, 2), "utf8");
console.log("kept", keep.length);
for (const g of keep.slice(0, 8)) {
  console.log(g.title, "||", g.differenceExplain);
}
