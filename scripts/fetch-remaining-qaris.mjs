import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "public", "qaris");
const UA = "HafizApp/1.0 education";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const queries = [
  ["ajamy", "Al-Ajmi qari OR العجمي"],
  ["basfar", "Basfar OR بصفر"],
  ["jibreel", "Muhammad Jibreel OR محمد جبريل"],
  ["shaatree", "Shatri OR الشاطري"],
  ["fares_abbad", "Fares Abbad OR فارس عباد"],
];

async function main() {
  for (const [id, q] of queries) {
    await sleep(2000);
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(q) +
      "&srnamespace=6&srlimit=12&format=json&origin=*";
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      const t = await r.text();
      if (t.startsWith("You")) {
        console.log(id, "rate-limited");
        continue;
      }
      const j = JSON.parse(t);
      const titles = (j.query?.search || []).map((s) => s.title);
      console.log(id, titles.slice(0, 8));
      for (const title of titles) {
        if (!/\.(jpe?g|png|webp)$/i.test(title)) continue;
        if (/quran|mushaf|logo|cover|book|page/i.test(title)) continue;
        const iu =
          "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
          encodeURIComponent(title) +
          "&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*";
        const ir = await fetch(iu, { headers: { "User-Agent": UA } });
        const ij = await ir.json();
        const page = Object.values(ij.query.pages)[0];
        const src =
          page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
        if (!src) continue;
        const pr =
          "https://images.weserv.nl/?url=" +
          encodeURIComponent(src) +
          "&w=480&h=480&fit=cover&a=attention&output=jpg";
        const img = await fetch(pr, { headers: { "User-Agent": UA } });
        if (!img.ok) continue;
        const buf = Buffer.from(await img.arrayBuffer());
        if (buf.length < 12000) continue;
        fs.writeFileSync(path.join(out, id + ".jpg"), buf);
        console.log("SAVED", id, buf.length, title);
        break;
      }
    } catch (e) {
      console.log(id, e.message);
    }
  }
}

main();
