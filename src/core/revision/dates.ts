/**
 * Pure date helpers for SRS (YYYY-MM-DD).
 */

export function parseIsoDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Signed day difference: b - a (positive if b is after a). */
export function dayDiff(a: string, b: string): number {
  const da = parseIsoDay(a);
  const db = parseIsoDay(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round(db - da);
}

export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]) + Math.trunc(days)
  );
  const d = new Date(utc);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
