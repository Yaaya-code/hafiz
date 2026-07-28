import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "public", "qaris");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = [
  ["alafasy", "مشاري راشد العفاسي", "Mishary Rashid Alafasy"],
  ["abdulbasit", "عبد الباسط عبد الصمد", "Abdul Basit Abd us-Samad"],
  ["ajamy", "أحمد العجمي", "Ahmed Al-Ajmi"],
  ["shuraim", "سعود الشريم", "Saud Al-Shuraim"],
  ["husary", "محمود خليل الحصري", "Mahmoud Khalil Al-Hussary"],
  ["ayyoub", "محمد أيوب", "Muhammad Ayyub"],
  ["jibreel", "محمد جبريل", "Muhammad Jibreel"],
  ["basfar", "عبد الله بصفر", "Abdullah Basfar"],
  ["shaatree", "أبو بكر الشاطري", "Abu Bakr al-Shatri"],
  ["neana", "أحمد نعينع", "Ahmed Neana"],
  ["mustafa_ismail", "مصطفى إسماعيل", "Mustafa Ismail"],
  ["fares_abbad", "فارس عباد", "Fares Abbad"],
  ["hudhaify", "علي الحذيفي", "Ali Al-Hudhaify"],
  ["sudais", "عبد الرحمن السديس", "Abdul Rahman Al-Sudais"],
  ["maher", "ماهر المعيقلي", "Maher Al Mueaqly"],
  ["dosari", "ياسر الدوسري", "Yasser al-Dosari"],
  ["minshawi", "محمد صديق المنشاوي", "Mohamed Siddiq El-Minshawi"],
  ["qatami", "ناصر القطامي", "Nasser Al-Qatami"],
  ["ghamadi", "سعد الغامدي", "Saad al-Ghamdi"],
];

async function wikiThumb(lang, title) {
  const url =
    "https://" +
    lang +
    ".wikipedia.org/w/api.php?action=query&titles=" +
    encodeURIComponent(title) +
    "&prop=pageimages&format=json&pithumbsize=400&origin=*";
  const r = await fetch(url, {
    headers: {
      "User-Agent": "HafizApp/1.0 (educational Quran memorization app)",
    },
  });
  const text = await r.text();
  if (text.startsWith("You are ma")) throw new Error("rate limited");
  const j = JSON.parse(text);
  const pages = Object.values(j.query.pages);
  return pages[0]?.thumbnail?.source || null;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  for (const [id, ar, en] of list) {
    await sleep(900);
    let src = null;
    try {
      src = await wikiThumb("ar", ar);
    } catch (e) {
      console.log(id, "ar fail", e.message);
    }
    if (!src) {
      await sleep(600);
      try {
        src = await wikiThumb("en", en);
      } catch (e) {
        console.log(id, "en fail", e.message);
      }
    }
    console.log(id, "->", src || "NONE");
    if (!src) continue;
    try {
      const img = await fetch(src, {
        headers: { "User-Agent": "HafizApp/1.0" },
      });
      if (!img.ok) {
        console.log("  fetch fail", img.status);
        continue;
      }
      const buf = Buffer.from(await img.arrayBuffer());
      fs.writeFileSync(path.join(out, id + ".jpg"), buf);
      console.log("  saved", buf.length);
    } catch (e) {
      console.log("  err", e.message);
    }
  }
}

main();
