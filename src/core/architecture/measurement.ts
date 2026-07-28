/**
 * P1 — Quran Measurement: HOW MUCH fits (Mushaf pages).
 * Does not choose WHERE (Path Resolver) or priority (Revision Policy).
 */

import {
  createNextHifzChunk,
  createDefaultQuranGeometry,
  type QuranGeometry,
} from "@/core/planning/quran";
import type {
  MeasurementInput,
  MeasurementResult,
  AyahPointer,
  UserCapacity,
} from "./types";

/** Default: 1 Mushaf page (~وجهين في الورقة) new hifz; more revision for stability */
const DEFAULT_CAPACITY: UserCapacity = {
  newHifzPages: 1,
  revisionPages: 3,
};

export function resolveUserCapacity(input?: {
  pagesPerDay?: number;
  revisionPagesPerDay?: number;
  dailyMinutes?: number;
  newHifzPages?: number;
  revisionPages?: number;
}): UserCapacity {
  if (
    typeof input?.newHifzPages === "number" &&
    typeof input?.revisionPages === "number"
  ) {
    return {
      newHifzPages: clampPages(input.newHifzPages),
      revisionPages: clampPages(input.revisionPages),
    };
  }
  // Backward compatible: pagesPerDay = Mushaf pages for new hifz
  const newHifzPages = clampPages(
    input?.newHifzPages ?? input?.pagesPerDay ?? DEFAULT_CAPACITY.newHifzPages
  );
  const revisionPages = clampPages(
    input?.revisionPages ??
      input?.revisionPagesPerDay ??
      Math.max(1, newHifzPages * 3)
  );
  return { newHifzPages, revisionPages };
}

function clampPages(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0.25;
  return Math.min(10, Math.max(0.25, n));
}

/**
 * Measure a range starting at pointer for capacityPages of Mushaf.
 */
export function measureQuranRange(
  input: MeasurementInput,
  geometry?: QuranGeometry
): MeasurementResult | null {
  const g = geometry ?? createDefaultQuranGeometry();
  const capacity = Math.max(0.25, input.capacityPages || 0);
  if (capacity <= 0) return null;

  const pointer = {
    surahNumber: input.startPointer.surahId,
    ayahNumber: input.startPointer.ayah,
  };

  const chunk = createNextHifzChunk(
    pointer,
    { pages: capacity, minutes: Math.round(capacity * 12) },
    g,
    { direction: input.direction }
  );

  if (!chunk) return null;

  const startPage = g.getPageOfAyah(
    chunk.startPointer.surahNumber,
    chunk.startPointer.ayahNumber
  );
  const endPage = g.getPageOfAyah(
    chunk.endPointer.surahNumber,
    chunk.endPointer.ayahNumber
  );

  return {
    startPointer: {
      surahId: chunk.startPointer.surahNumber,
      ayah: chunk.startPointer.ayahNumber,
    },
    endPointer: {
      surahId: chunk.endPointer.surahNumber,
      ayah: chunk.endPointer.ayahNumber,
    },
    startPage,
    endPage,
    pagesActual: Math.max(0.25, chunk.pages || capacity),
    labelAr: chunk.labelAr,
  };
}

export function pointerFromCursor(cursor: {
  surah: number;
  ayah: number;
}): AyahPointer {
  return { surahId: cursor.surah, ayah: cursor.ayah };
}
