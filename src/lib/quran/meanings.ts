/**
 * Fetch short Arabic meaning / tafsir for ayahs (runtime CDN).
 * Cached in sessionStorage per surah.
 */

type MeaningMap = Record<number, string>; // ayahNumber -> text

const cache: Record<number, MeaningMap> = {};

export async function fetchSurahMeanings(
  surahNumber: number
): Promise<MeaningMap> {
  if (cache[surahNumber]) return cache[surahNumber];
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem("hafiz_meanings_" + surahNumber);
      if (raw) {
        const parsed = JSON.parse(raw) as MeaningMap;
        cache[surahNumber] = parsed;
        return parsed;
      }
    } catch {
      /* ignore */
    }
  }

  // Arabic concise tafsir (muyassar) — short "meaning" under each ayah
  const url =
    "https://api.alquran.cloud/v1/surah/" + surahNumber + "/ar.muyassar";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as {
      data?: { ayahs?: { numberInSurah: number; text: string }[] };
    };
    const map: MeaningMap = {};
    for (const a of data.data?.ayahs || []) {
      map[a.numberInSurah] = a.text;
    }
    cache[surahNumber] = map;
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "hafiz_meanings_" + surahNumber,
          JSON.stringify(map)
        );
      } catch {
        /* ignore quota */
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function getCachedMeaning(
  surahNumber: number,
  ayahNumber: number
): string | undefined {
  return cache[surahNumber]?.[ayahNumber];
}
