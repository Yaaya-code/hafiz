import type { JuzMeta } from "./types";
import { SURAHS } from "./surahs";

/** 30 Juz with traditional Arabic names and surah coverage */
export const JUZ_LIST: JuzMeta[] = [
  { number: 1, nameAr: "آلم", nameEn: "Alif Lam Mim", startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 141, surahs: [1, 2], startPage: 1, endPage: 21 },
  { number: 2, nameAr: "سيقول", nameEn: "Sayaqool", startSurah: 2, startAyah: 142, endSurah: 2, endAyah: 252, surahs: [2], startPage: 22, endPage: 41 },
  { number: 3, nameAr: "تلك الرسل", nameEn: "Tilka ar-Rusul", startSurah: 2, startAyah: 253, endSurah: 3, endAyah: 92, surahs: [2, 3], startPage: 42, endPage: 62 },
  { number: 4, nameAr: "لن تنالوا", nameEn: "Lan Tanaaloo", startSurah: 3, startAyah: 93, endSurah: 4, endAyah: 23, surahs: [3, 4], startPage: 62, endPage: 81 },
  { number: 5, nameAr: "والمحصنات", nameEn: "Wal-Muhsanat", startSurah: 4, startAyah: 24, endSurah: 4, endAyah: 147, surahs: [4], startPage: 82, endPage: 101 },
  { number: 6, nameAr: "لا يحب الله", nameEn: "La Yuhibbullah", startSurah: 4, startAyah: 148, endSurah: 5, endAyah: 81, surahs: [4, 5], startPage: 102, endPage: 121 },
  { number: 7, nameAr: "وإذا سمعوا", nameEn: "Wa Iza Sami'oo", startSurah: 5, startAyah: 82, endSurah: 6, endAyah: 110, surahs: [5, 6], startPage: 121, endPage: 141 },
  { number: 8, nameAr: "ولو أننا", nameEn: "Wa Lau Annana", startSurah: 6, startAyah: 111, endSurah: 7, endAyah: 87, surahs: [6, 7], startPage: 142, endPage: 161 },
  { number: 9, nameAr: "قال الملأ", nameEn: "Qalal Mala'u", startSurah: 7, startAyah: 88, endSurah: 8, endAyah: 40, surahs: [7, 8], startPage: 162, endPage: 181 },
  { number: 10, nameAr: "واعلموا", nameEn: "Wa A'lamu", startSurah: 8, startAyah: 41, endSurah: 9, endAyah: 92, surahs: [8, 9], startPage: 182, endPage: 201 },
  { number: 11, nameAr: "يعتذرون", nameEn: "Ya'tadhiroon", startSurah: 9, startAyah: 93, endSurah: 11, endAyah: 5, surahs: [9, 10, 11], startPage: 201, endPage: 221 },
  { number: 12, nameAr: "وما من دابة", nameEn: "Wa Mamin Da'abbah", startSurah: 11, startAyah: 6, endSurah: 12, endAyah: 52, surahs: [11, 12], startPage: 222, endPage: 241 },
  { number: 13, nameAr: "وما أبرئ", nameEn: "Wa Ma Ubrioo", startSurah: 12, startAyah: 53, endSurah: 14, endAyah: 52, surahs: [12, 13, 14], startPage: 242, endPage: 261 },
  { number: 14, nameAr: "ربما", nameEn: "Rubama", startSurah: 15, startAyah: 1, endSurah: 16, endAyah: 128, surahs: [15, 16], startPage: 262, endPage: 281 },
  { number: 15, nameAr: "سبحان الذي", nameEn: "Subhanalladhi", startSurah: 17, startAyah: 1, endSurah: 18, endAyah: 74, surahs: [17, 18], startPage: 282, endPage: 301 },
  { number: 16, nameAr: "قال ألم", nameEn: "Qal Alam", startSurah: 18, startAyah: 75, endSurah: 20, endAyah: 135, surahs: [18, 19, 20], startPage: 302, endPage: 321 },
  { number: 17, nameAr: "اقترب", nameEn: "Iqtaraba", startSurah: 21, startAyah: 1, endSurah: 22, endAyah: 78, surahs: [21, 22], startPage: 322, endPage: 341 },
  { number: 18, nameAr: "قد أفلح", nameEn: "Qad Aflaha", startSurah: 23, startAyah: 1, endSurah: 25, endAyah: 20, surahs: [23, 24, 25], startPage: 342, endPage: 361 },
  { number: 19, nameAr: "وقال الذين", nameEn: "Wa Qalalladhina", startSurah: 25, startAyah: 21, endSurah: 27, endAyah: 55, surahs: [25, 26, 27], startPage: 362, endPage: 381 },
  { number: 20, nameAr: "أمن خلق", nameEn: "A'man Khalaq", startSurah: 27, startAyah: 56, endSurah: 29, endAyah: 45, surahs: [27, 28, 29], startPage: 382, endPage: 401 },
  { number: 21, nameAr: "اتل ما أوحي", nameEn: "Utlu Ma Oohi", startSurah: 29, startAyah: 46, endSurah: 33, endAyah: 30, surahs: [29, 30, 31, 32, 33], startPage: 402, endPage: 421 },
  { number: 22, nameAr: "ومن يقنت", nameEn: "Wa Manyaqnut", startSurah: 33, startAyah: 31, endSurah: 36, endAyah: 27, surahs: [33, 34, 35, 36], startPage: 422, endPage: 441 },
  { number: 23, nameAr: "وما لي", nameEn: "Wa Mali", startSurah: 36, startAyah: 28, endSurah: 39, endAyah: 31, surahs: [36, 37, 38, 39], startPage: 442, endPage: 461 },
  { number: 24, nameAr: "فمن أظلم", nameEn: "Faman Azlam", startSurah: 39, startAyah: 32, endSurah: 41, endAyah: 46, surahs: [39, 40, 41], startPage: 462, endPage: 481 },
  { number: 25, nameAr: "إليه يرد", nameEn: "Ilayhi Yuraddu", startSurah: 41, startAyah: 47, endSurah: 45, endAyah: 37, surahs: [41, 42, 43, 44, 45], startPage: 482, endPage: 501 },
  { number: 26, nameAr: "حم", nameEn: "Ha Meem", startSurah: 46, startAyah: 1, endSurah: 51, endAyah: 30, surahs: [46, 47, 48, 49, 50, 51], startPage: 502, endPage: 521 },
  { number: 27, nameAr: "قال فما خطبكم", nameEn: "Qala Fama Khatbukum", startSurah: 51, startAyah: 31, endSurah: 57, endAyah: 29, surahs: [51, 52, 53, 54, 55, 56, 57], startPage: 522, endPage: 541 },
  { number: 28, nameAr: "قد سمع الله", nameEn: "Qad Sami'Allah", startSurah: 58, startAyah: 1, endSurah: 66, endAyah: 12, surahs: [58, 59, 60, 61, 62, 63, 64, 65, 66], startPage: 542, endPage: 561 },
  { number: 29, nameAr: "تبارك الذي", nameEn: "Tabarakalladhi", startSurah: 67, startAyah: 1, endSurah: 77, endAyah: 50, surahs: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77], startPage: 562, endPage: 581 },
  { number: 30, nameAr: "عمّ", nameEn: "Amma", startSurah: 78, startAyah: 1, endSurah: 114, endAyah: 6, surahs: [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114], startPage: 582, endPage: 604 },
];

export function getJuz(n: number): JuzMeta | undefined {
  return JUZ_LIST.find((j) => j.number === n);
}

export function surahNamesInJuz(juz: JuzMeta): string {
  return juz.surahs
    .map((n) => SURAHS.find((s) => s.number === n)?.nameAr)
    .filter(Boolean)
    .join(" · ");
}

export function surahsInRange(from: number, to: number) {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  return SURAHS.filter((s) => s.number >= a && s.number <= b);
}
