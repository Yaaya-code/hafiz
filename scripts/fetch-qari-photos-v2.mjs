/**
 * Fetch real reciter portraits via Wikipedia pageimages / Commons search.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "public", "qaris");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "HafizApp/1.0 (educational Quran memorization; contact: local-dev)";

const TARGETS = [
  { id: "alafasy", titles: ["مشاري راشد العفاسي", "Mishary Rashid Alafasy"] },
  { id: "ajamy", titles: ["أحمد العجمي", "Ahmed Al-Ajmi", "Ahmed ibn Ali Al-Ajmi"] },
  { id: "shuraim", titles: ["سعود الشريم", "Saud Al-Shuraim"] },
  { id: "abdulbasit", titles: ["عبد الباسط عبد الصمد", "Abdul Basit Abd us-Samad"] },
  { id: "ayyoub", titles: ["محمد أيوب", "Muhammad Ayyub"] },
  { id: "shaatree", titles: ["أبو بكر الشاطري", "Abu Bakr al-Shatri"] },
  { id: "basfar", titles: ["عبد الله بصفر", "Abdullah Basfar"] },
  { id: "jibreel", titles: ["محمد جبريل", "Muhammad Jibril"] },
  { id: "mustafa_ismail", titles: ["مصطفى إسماعيل", "Mustafa Ismail"] },
  { id: "fares_abbad", titles: ["فارس عباد", "Fares Abbad"] },
  // refresh known-good ones too
  { id: "sudais", titles: ["عبد الرحمن السديس", "Abdul Rahman Al-Sudais"] },
  { id: "maher", titles: ["ماهر المعيقلي", "Maher Al Mueaqly"] },
  { id: "dosari", titles: ["ياسر الدوسري", "Yasser al-Dosari"] },
  { id: "husary", titles: ["محمود خليل الحصري", "Mahmoud Khalil Al-Hussary"] },
  { id: "minshawi", titles: ["محمد صديق المنشاوي", "Mohamed Siddiq El-Minshawi"] },
  { id: "qatami", titles: ["ناصر القطامي", "Nasser Al-Qatami"] },
  { id: "ghamadi", titles: ["سعد الغامدي", "Saad al-Ghamdi"] },
  { id: "hudhaify", titles: ["علي الحذيفي", "Ali Al-Hudhaify"] },
  { id: "neana", titles: ["أحمد نعينع", "Ahmed Neana"] },
];

async function pageImage(lang, title) {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&titles=` +
    encodeURIComponent(title) +
    "&prop=pageimages|pageprops&piprop=thumbnail&pithumbsize=500&format=json&origin=*";
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const text = await r.text();
  if (text.startsWith("You are ma")) throw new Error("rate-limited");
  const j = JSON.parse(text);
  const page = Object.values(j.query?.pages || {})[0];
  if (!page || page.missing != null) return null;
  return page.thumbnail?.source || null;
}

async function commonsSearch(name) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=" +
    encodeURIComponent(name + " reciter OR qari OR quran") +
    "&srnamespace=6&srlimit=5&format=json&origin=*";
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const text = await r.text();
  if (text.startsWith("You are ma")) return null;
  const j = JSON.parse(text);
  const hits = j.query?.search || [];
  for (const h of hits) {
    const title = h.title; // File:Something.jpg
    if (!/\.(jpe?g|png|webp)$/i.test(title)) continue;
    const iu =
      "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
      encodeURIComponent(title) +
      "&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*";
    const ir = await fetch(iu, { headers: { "User-Agent": UA } });
    const ij = await ir.json();
    const page = Object.values(ij.query?.pages || {})[0];
    const src = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
    if (src) return src;
  }
  return null;
}

async function download(id, src) {
  const res = await fetch(src, {
    headers: { "User-Agent": UA, Accept: "image/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error("too small " + buf.length);
  fs.writeFileSync(path.join(out, id + ".jpg"), buf);
  return buf.length;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  for (const t of TARGETS) {
    await sleep(1200);
    let src = null;
    for (const title of t.titles) {
      const lang = /[a-zA-Z]/.test(title[0]) ? "en" : "ar";
      try {
        src = await pageImage(lang, title);
        if (src) break;
      } catch (e) {
        console.log(t.id, "page fail", e.message);
      }
      await sleep(400);
    }
    if (!src) {
      try {
        src = await commonsSearch(t.titles[0]);
      } catch (e) {
        console.log(t.id, "commons fail", e.message);
      }
    }
    if (!src) {
      console.log("NONE", t.id);
      continue;
    }
    try {
      const n = await download(t.id, src);
      console.log("OK", t.id, n, src.slice(0, 80));
    } catch (e) {
      console.log("DL_FAIL", t.id, e.message, src.slice(0, 80));
    }
  }
}

main();
