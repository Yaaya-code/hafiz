/** Last Quran reader position + simple bookmarks/notes (local) */

import {
  STORAGE_KEYS,
  isBrowser,
  safeGetJSON,
  safeSetJSON,
} from "@/lib/storage/safe-storage";

const POS_KEY = STORAGE_KEYS.readerPos;
const BM_KEY = "hafiz_reader_bookmarks_v1";
const NOTES_KEY = "hafiz_reader_notes_v1";

export type ReaderPos = {
  surahNumber: number;
  ayahNumber: number;
  qariId: string;
  updatedAt: string;
};

export type ReaderBookmark = {
  surahNumber: number;
  ayahNumber: number;
  label?: string;
  createdAt: string;
};

export type ReaderNote = {
  surahNumber: number;
  ayahNumber: number;
  text: string;
  updatedAt: string;
};

const defaultPos = (): ReaderPos => ({
  surahNumber: 1,
  ayahNumber: 1,
  qariId: "alafasy",
  updatedAt: "",
});

export function loadReaderPos(): ReaderPos {
  if (!isBrowser()) return defaultPos();
  return {
    ...defaultPos(),
    ...safeGetJSON<Partial<ReaderPos>>(POS_KEY, {}),
  };
}

export function saveReaderPos(pos: ReaderPos) {
  if (!isBrowser()) return;
  safeSetJSON(POS_KEY, {
    ...pos,
    updatedAt: new Date().toISOString(),
  });
}

export function loadBookmarks(): ReaderBookmark[] {
  if (!isBrowser()) return [];
  return safeGetJSON<ReaderBookmark[]>(BM_KEY, []);
}

export function toggleBookmark(surah: number, ayah: number) {
  const list = loadBookmarks();
  const i = list.findIndex(
    (b) => b.surahNumber === surah && b.ayahNumber === ayah
  );
  if (i >= 0) list.splice(i, 1);
  else
    list.unshift({
      surahNumber: surah,
      ayahNumber: ayah,
      createdAt: new Date().toISOString(),
    });
  safeSetJSON(BM_KEY, list);
  return list;
}

export function loadNotes(): ReaderNote[] {
  if (!isBrowser()) return [];
  return safeGetJSON<ReaderNote[]>(NOTES_KEY, []);
}

export function saveNote(surah: number, ayah: number, text: string) {
  const list = loadNotes().filter(
    (n) => !(n.surahNumber === surah && n.ayahNumber === ayah)
  );
  if (text.trim()) {
    list.unshift({
      surahNumber: surah,
      ayahNumber: ayah,
      text: text.trim(),
      updatedAt: new Date().toISOString(),
    });
  }
  safeSetJSON(NOTES_KEY, list);
  return list;
}
