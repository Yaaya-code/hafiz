/**
 * Direct Wikimedia Commons portrait URLs for Hafiz reciters.
 * Run: node scripts/fetch-qari-images-direct.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "public", "qaris");

/** Known working portrait URLs (Commons / educational fair use) */
const DIRECT = {
  sudais:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Abdul-Rahman_Al-Sudais_%28Cropped%2C_2011%29.jpg/440px-Abdul-Rahman_Al-Sudais_%28Cropped%2C_2011%29.jpg",
  maher:
    "https://upload.wikimedia.org/wikipedia/commons/9/90/Maher_Al_Mueaqly.png",
  dosari:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Yasser_Al-Dosari_%28cropped%29.jpg/440px-Yasser_Al-Dosari_%28cropped%29.jpg",
  minshawi:
    "https://upload.wikimedia.org/wikipedia/commons/e/ee/Elminshwey.jpg",
  qatami:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/%D8%B5%D9%88%D8%B1%D8%A9_%D8%B4%D8%AE%D8%B5%D9%8A%D8%A9_%D8%A7%D9%84%D8%B4%D9%8A%D8%AE_%D9%86%D8%A7%D8%B5%D8%B1_%D8%A7%D9%84%D9%82%D8%B7%D8%A7%D9%85%D9%8A.jpg/440px-%D8%B5%D9%88%D8%B1%D8%A9_%D8%B4%D8%AE%D8%B5%D9%8A%D8%A9_%D8%A7%D9%84%D8%B4%D9%8A%D8%AE_%D9%86%D8%A7%D8%B5%D8%B1_%D8%A7%D9%84%D9%82%D8%B7%D8%A7%D9%85%D9%8A.jpg",
  ghamadi:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Saad_al_Ghamdi.jpg/440px-Saad_al_Ghamdi.jpg",
  husary: "https://upload.wikimedia.org/wikipedia/commons/7/70/Hussary.jpg",
  shuraim:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Saud_Shuraim_doing_the_Khutbah.png/440px-Saud_Shuraim_doing_the_Khutbah.png",
  neana:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/DrAhmedNeinaa.jpg/440px-DrAhmedNeinaa.jpg",
  mustafa_ismail:
    "https://upload.wikimedia.org/wikipedia/commons/5/55/Mostafa_Ismaeel.jpg",
  hudhaify: "https://upload.wikimedia.org/wikipedia/commons/d/d7/Huthaify.jpg",
  // Additional commons candidates (may 404 — script skips failures)
  alafasy:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Mishary_Rashid_Alafasy_2011.jpg/440px-Mishary_Rashid_Alafasy_2011.jpg",
  abdulbasit:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Abdulbasit_Abdussamad.jpg/440px-Abdulbasit_Abdussamad.jpg",
  ayyoub:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Muhammad_Ayyub.jpg/440px-Muhammad_Ayyub.jpg",
  basfar:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Abdullah_Basfar.jpg/440px-Abdullah_Basfar.jpg",
  ajamy:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Ahmed_Al-Ajmi.jpg/440px-Ahmed_Al-Ajmi.jpg",
  jibreel:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Muhammad_Jibreel.jpg/440px-Muhammad_Jibreel.jpg",
  shaatree:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Abu_Bakr_al-Shatri.jpg/440px-Abu_Bakr_al-Shatri.jpg",
  fares_abbad:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Fares_Abbad.jpg/440px-Fares_Abbad.jpg",
};

async function main() {
  fs.mkdirSync(out, { recursive: true });
  for (const [id, url] of Object.entries(DIRECT)) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "HafizApp/1.0 (educational Quran app)",
          Accept: "image/*",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        console.log("FAIL", id, res.status);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) {
        console.log("SKIP small", id, buf.length);
        continue;
      }
      fs.writeFileSync(path.join(out, id + ".jpg"), buf);
      console.log("OK", id, buf.length);
    } catch (e) {
      console.log("ERR", id, e.message);
    }
  }
}

main();
