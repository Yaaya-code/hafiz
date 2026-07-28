/**
 * Fetch exact Madani (604) page → ayah ranges from api.quran.com
 * and write a compact JSON map for the app.
 *
 * Output: src/lib/quran/data/madani-pages.json
 * Shape:
 * {
 *   "version": 1,
 *   "source": "api.quran.com v4 madani",
 *   "pageCount": 604,
 *   "pages": [ { "page": 1, "spans": [ { "surah": 1, "from": 1, "to": 7 } ] }, ... ],
 *   "ayahPage": { "1:1": 1, "2:1": 2, ... }  // surah:ayah → page
 * }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "quran",
  "data",
  "madani-pages.json"
);

const BASE = "https://api.quran.com/api/v4/verses/by_page";

async function fetchPage(page) {
  const url = `${BASE}/${page}?language=en&words=false&per_page=50`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`page ${page}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const verses = data.verses || [];
  // verse_key like "2:255"
  const keys = verses.map((v) => v.verse_key);
  return keys;
}

function spansFromKeys(keys) {
  /** @type {{ surah: number, from: number, to: number }[]} */
  const spans = [];
  for (const key of keys) {
    const [s, a] = key.split(":").map(Number);
    const last = spans[spans.length - 1];
    if (last && last.surah === s && last.to + 1 === a) {
      last.to = a;
    } else {
      spans.push({ surah: s, from: a, to: a });
    }
  }
  return spans;
}

async function main() {
  /** @type {{ page: number, spans: { surah: number, from: number, to: number }[] }[]} */
  const pages = [];
  /** @type {Record<string, number>} */
  const ayahPage = {};

  for (let page = 1; page <= 604; page++) {
    let keys;
    let attempt = 0;
    while (true) {
      try {
        keys = await fetchPage(page);
        break;
      } catch (e) {
        attempt++;
        if (attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    const spans = spansFromKeys(keys);
    pages.push({ page, spans });
    for (const key of keys) {
      ayahPage[key] = page;
    }
    if (page % 50 === 0 || page === 1) {
      console.log(`fetched page ${page}/604 (${keys.length} ayahs)`);
    }
    // polite rate limit
    await new Promise((r) => setTimeout(r, 40));
  }

  // Sanity
  if (pages.length !== 604) throw new Error("expected 604 pages");
  if (!ayahPage["1:1"] || ayahPage["1:1"] !== 1) {
    throw new Error("Fatiha 1:1 must be page 1");
  }
  if (!ayahPage["114:6"]) {
    throw new Error("missing An-Nas");
  }

  const out = {
    version: 1,
    source: "api.quran.com/v4/verses/by_page (Madani)",
    pageCount: 604,
    pages,
    ayahPage,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("Wrote", OUT, "ayahs:", Object.keys(ayahPage).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
