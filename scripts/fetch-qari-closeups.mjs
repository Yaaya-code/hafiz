/**
 * Close-up portraits for priority reciters (Wikimedia + attention crop).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "public", "qaris");
const UA = "HafizApp/1.0 (educational Quran app)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Direct verified sources + attention crop for face-centered result */
const DIRECT = {
  // Classic restored portrait of Mustafa Ismail
  mustafa_ismail:
    "https://upload.wikimedia.org/wikipedia/commons/5/55/Mostafa_Ismaeel.jpg",
  // Shuraim — use commons + heavy attention crop
  shuraim:
    "https://upload.wikimedia.org/wikipedia/commons/5/5d/Saud_Shuraim_doing_the_Khutbah.png",
  // Alafasy (RU wiki portrait)
  alafasy:
    "https://upload.wikimedia.org/wikipedia/commons/2/24/%D0%9C%D0%B8%D1%88%D0%B0%D1%80%D0%B8_%D0%A0%D0%B0%D1%88%D0%B8%D0%B4.jpg",
  abdulbasit:
    "https://upload.wikimedia.org/wikipedia/ar/7/73/%D8%B5%D9%88%D8%B1%D8%A9_%D8%B4%D8%AE%D8%B5%D9%8A%D8%A9_%D8%B9%D8%A8%D8%AF_%D8%A7%D9%84%D8%A8%D8%A7%D8%B3%D8%B7_%D8%B9%D8%A8%D8%AF_%D8%A7%D9%84%D8%B5%D9%85%D8%AF.png",
  ayyoub:
    "https://upload.wikimedia.org/wikipedia/en/4/40/Muhammad_Ayyub.jpeg",
  jibreel:
    "https://upload.wikimedia.org/wikipedia/commons/9/9a/Qari_Muhammad_Jebril%2C_Ramadan_2019.png",
  maher: "https://upload.wikimedia.org/wikipedia/commons/9/90/Maher_Al_Mueaqly.png",
  husary: "https://upload.wikimedia.org/wikipedia/commons/7/70/Hussary.jpg",
  minshawi: "https://upload.wikimedia.org/wikipedia/commons/e/ee/Elminshwey.jpg",
  dosari:
    "https://upload.wikimedia.org/wikipedia/commons/8/8b/Yasser_Al-Dosari_%28cropped%29.jpg",
  ghamadi: "https://upload.wikimedia.org/wikipedia/commons/4/43/Saad_al_Ghamdi.jpg",
  sudais:
    "https://upload.wikimedia.org/wikipedia/commons/1/18/Abdul-Rahman_Al-Sudais_%28Cropped%2C_2011%29.jpg",
  neana: "https://upload.wikimedia.org/wikipedia/commons/a/a9/DrAhmedNeinaa.jpg",
  hudhaify: "https://upload.wikimedia.org/wikipedia/commons/d/d7/Huthaify.jpg",
};

// Commons search fallbacks for hard-to-find names
const SEARCH = {
  ajamy: ["File:صورة عبدالمجيد العجمي.jpg", "File:أحمد العجمي.jpg"],
  shaatree: ["File:ShatriCr 1.jpg", "File:ShatriCr 3.jpg"],
  basfar: ["File:Abdullah Basfar.jpg"],
  fares_abbad: ["File:Fares Abbad.jpg", "File:فارس عباد.jpg"],
};

function proxy(url) {
  return (
    "https://images.weserv.nl/?url=" +
    encodeURIComponent(url) +
    "&w=520&h=520&fit=cover&a=attention&we&sharp=1&output=jpg&q=90"
  );
}

async function save(id, url) {
  const r = await fetch(proxy(url), {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 8000) throw new Error("small " + buf.length);
  fs.writeFileSync(path.join(out, id + ".jpg"), buf);
  console.log("OK", id, buf.length);
}

async function fromTitle(id, title) {
  const iu =
    "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
    encodeURIComponent(title) +
    "&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*";
  const ir = await fetch(iu, { headers: { "User-Agent": UA } });
  const ij = await ir.json();
  const page = Object.values(ij.query?.pages || {})[0];
  const src = page?.imageinfo?.[0]?.url || page?.imageinfo?.[0]?.thumburl;
  if (!src) return false;
  await save(id, src);
  return true;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  for (const [id, url] of Object.entries(DIRECT)) {
    await sleep(800);
    try {
      await save(id, url);
    } catch (e) {
      console.log("FAIL", id, e.message);
    }
  }
  for (const [id, titles] of Object.entries(SEARCH)) {
    await sleep(1500);
    let ok = false;
    for (const t of titles) {
      try {
        if (await fromTitle(id, t)) {
          ok = true;
          break;
        }
      } catch (e) {
        console.log(id, t, e.message);
      }
      await sleep(600);
    }
    if (!ok) console.log("NONE", id);
  }
}

main();
