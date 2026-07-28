/**
 * Pure date helpers for planning horizons.
 * No UI, no timezone libraries — ISO calendar strings only.
 */

import type { ISODate } from "../models";

/** Format a Date as YYYY-MM-DD in local calendar. */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD to a Date at local noon (stable weekday). */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/** Add calendar days to an ISO date. */
export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Arabic weekday label for an ISO date (local). */
export function weekdayAr(iso: ISODate): string {
  const names = [
    "الأحد",
    "الإثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];
  return names[parseISODate(iso).getDay()] ?? "";
}

/** True when dayIndex (1-based) is a weekly consolidation anchor (7,14,21,28…). */
export function isWeeklyAnchorDay(dayIndex: number): boolean {
  return dayIndex > 0 && dayIndex % 7 === 0;
}
