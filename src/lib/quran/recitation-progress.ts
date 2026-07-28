/**
 * Persist recitation stop points per surah (local-first).
 */

import {
  STORAGE_KEYS,
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";

const KEY = STORAGE_KEYS.recitation;

export type SurahRecitationProgress = {
  surahNumber: number;
  /** Last fully completed ayah (0 = none) */
  lastCompletedAyah: number;
  /** Next ayah to continue from */
  continueFromAyah: number;
  totalAyahs: number;
  lastSessionAt: string;
  accuracy?: number;
  mistakesCount?: number;
};

type Store = Record<string, SurahRecitationProgress>;

function loadStore(): Store {
  if (!isBrowser()) return {};
  return safeGetJSON<Store>(KEY, {});
}

function saveStore(s: Store) {
  if (!isBrowser()) return;
  safeSetJSON(KEY, s);
}

export function getSurahRecitationProgress(
  surahNumber: number
): SurahRecitationProgress | null {
  return loadStore()[String(surahNumber)] || null;
}

export function saveSurahRecitationProgress(
  p: SurahRecitationProgress
): void {
  const s = loadStore();
  s[String(p.surahNumber)] = p;
  saveStore(s);
  emitStorageEvent("hafiz-recitation-progress", p);
}

export function clearSurahRecitationProgress(surahNumber: number): void {
  const s = loadStore();
  delete s[String(surahNumber)];
  saveStore(s);
}

export type AyahReviewStatus = "correct" | "hesitation" | "mistake" | "pending";

export type AyahReviewItem = {
  ayahNumber: number;
  status: AyahReviewStatus;
  missing: string[];
  incorrect: string[];
  note?: string;
};

/**
 * Build per-ayah review from live word statuses.
 */
export function buildAyahReview(
  words: {
    ayahNumber: number;
    status: string;
    text: string;
    note?: string;
  }[]
): AyahReviewItem[] {
  const map = new Map<number, AyahReviewItem>();
  for (const w of words) {
    if (!map.has(w.ayahNumber)) {
      map.set(w.ayahNumber, {
        ayahNumber: w.ayahNumber,
        status: "pending",
        missing: [],
        incorrect: [],
      });
    }
    const item = map.get(w.ayahNumber)!;
    if (w.status === "missing") {
      item.missing.push(w.text);
      item.status = "mistake";
      item.note = w.note;
    } else if (w.status === "incorrect") {
      item.incorrect.push(w.text);
      item.status = "mistake";
      item.note = w.note;
    } else if (w.status === "partial" || w.status === "current") {
      if (item.status === "pending") item.status = "hesitation";
    }
  }
  // Ayahs fully correct if all words correct
  for (const [num, item] of map) {
    const ayahWords = words.filter((w) => w.ayahNumber === num);
    if (
      ayahWords.length &&
      ayahWords.every((w) => w.status === "correct")
    ) {
      item.status = "correct";
    } else if (
      ayahWords.some((w) => w.status === "correct") &&
      item.status === "pending"
    ) {
      item.status = "hesitation";
    }
  }
  return [...map.values()].sort((a, b) => a.ayahNumber - b.ayahNumber);
}
