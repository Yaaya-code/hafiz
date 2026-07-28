/**
 * Fetch verified Wikipedia portraits for priority reciters (close-up when possible).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "public", "qaris");
const UA = "HafizApp/1.0 (educational Quran memorization app)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  ["fares_abbad", ["فارس_عباد", "Fares_Abbad"]],
  ["shuraim", ["سعود_الشريم", "Saud_Al-Shuraim"]],
  ["basfar", ["عبدالله_بصفر", "Abdullah_Basfar"]],
  ["jibreel", ["محمد_جبريل", "Muhammad_Jibril"]],
  ["shaatree", ["أبو_بكر_الشاطري", "Abu_Bakr_al-Shatri"]],
  ["ajamy", ["أحمد_العجمي", "Ahmed_Al-Ajmi"]],
  ["alafasy", ["مشاري_راشد_العفاسي", "Mishari_bin_Rashid_Alafasy"]],
  ["abdulbasit", ["عبد_الباسط_عبد_الصمد"]],
  ["ayyoub", ["محمد_أيوب", "Muhammad_Ayyub"]],
  ["mustafa_ismail", ["مصطفى_إسماعيل", "Mustafa_Ismail"]],
];

async function summary(lang, title) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.originalimage?.source || j.thumbnail?.source || null;
}

async function save(id, src) {
  if (!src || /quran_kareem|orange_lo|logo|cover/i.test(src)) return false;
  // Prefer attention crop for closer faces
  const pr =
    "https://images.weserv.nl/?url=" +
    encodeURIComponent(src) +
    "&w=480&h=480&fit=cover&a=attention&output=jpg&q=85";
  const ir = await fetch(pr, { headers: { "User-Agent": UA } });
  if (!ir.ok) return false;
  const buf = Buffer.from(await ir.arrayBuffer());
  if (buf.length < 10000) return false;
  fs.writeFileSync(path.join(out, id + ".jpg"), buf);
  console.log("SAVED", id, buf.length, src.slice(0, 70));
  return true;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  for (const [id, titles] of TARGETS) {
    await sleep(2000);
    let ok = false;
    for (const title of titles) {
      const lang = /[a-zA-Z]/.test(title[0]) ? "en" : "ar";
      try {
        const src = await summary(lang, title);
        console.log(id, lang, title, src ? "has-img" : "none");
        if (src && (await save(id, src))) {
          ok = true;
          break;
        }
      } catch (e) {
        console.log(id, e.message);
      }
      await sleep(700);
    }
    if (!ok) console.log("NONE", id);
  }
}

main();
