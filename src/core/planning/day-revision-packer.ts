/**
 * DayRevisionPacker — fill today's «المراجعة» from RevisionPolicy + Units.
 *
 * Order:
 *   1) sequential N Madani pages (hard budget — never gap pages)
 *   2) optional small neighborhood (soft; can be trimmed)
 *
 * Cursor advances ONLY for sequential units that remain in the day plan.
 */

import type { PlanItem } from "./types";
import type { QuranGeometry } from "./quran/types";
import {
  buildRevisionPolicy,
  type MemorizedRange,
  type RevisionPolicy,
  type RevisionPolicyInput,
} from "./revision-policy";
import {
  buildNeighborhoodUnit,
  unitKey,
  type RangeRef,
  type RevisionUnit,
} from "./revision-units";
import {
  defaultSequentialCursor,
  mergeConsecutiveSameSurahUnits,
  mergeSequentialRanges,
  packSequentialRevision,
  type SequentialCursor,
} from "./sequential-revision";

export type HorizonRevisionCursor = {
  stabilizeAyah: number;
  corpus: { rangeIdx: number; ayah: number };
  seq?: SequentialCursor;
};

export type PackRevisionDayInput = {
  hifzPointer: { surah: number; ayah: number };
  memorizedRanges: readonly MemorizedRange[];
  revisionMinutes: number;
  /** N Madani faces — primary hard budget */
  revisionPages?: number;
  previousHifz?: RangeRef | null;
  horizonCursor: HorizonRevisionCursor;
  geometry?: QuranGeometry | null;
  dayNumber: number;
  runId: string;
  maxItems?: number;
  urgentSingleAyah?: RangeRef | null;
};

export type PackRevisionDayResult = {
  items: PlanItem[];
  policy: RevisionPolicy;
  nextCursor: HorizonRevisionCursor;
  startCursor: HorizonRevisionCursor;
  notes: string[];
};

function unitToPlanItem(
  unit: RevisionUnit,
  dayNumber: number,
  runId: string
): PlanItem {
  const type = unit.internalTier === "near" ? "NEAR_REVISION" : "FAR_REVISION";
  const roleLabel =
    unit.role === "stabilize_primary"
      ? "تثبيت المحفوظ"
      : unit.role === "neighborhood"
        ? "تثبيت جوار الحفظ"
        : "مراجعة المحفوظ";
  const rangeLabel = unit.labelAr.replace(/^سورة\s*/, "");
  const stableId = `${runId}-d${dayNumber}-${unit.role}-s${unit.surah}-a${unit.fromAyah}-${unit.toAyah}`;
  return {
    id: stableId,
    type,
    sourceRange: {
      surah: unit.surah,
      fromAyah: unit.fromAyah,
      toAyah: unit.toAyah,
      pagesApprox: unit.pagesApprox,
    },
    surah: unit.surah,
    estimatedMinutes: unit.minutes,
    labelAr: `${roleLabel}: ${rangeLabel}`,
    priorityReasons: [unit.reasonAr, unit.role],
    priorityScore:
      unit.role === "neighborhood"
        ? 100
        : unit.role === "stabilize_primary"
          ? 80
          : 40,
  };
}

function minutesOf(items: PlanItem[]): number {
  return items.reduce((s, i) => s + (i.estimatedMinutes || 0), 0);
}

/** Cursor after the last sequential unit that stayed in the plan. */
function cursorAfterUnits(
  ranges: readonly { surah: number; fromAyah: number; toAyah: number }[],
  start: SequentialCursor,
  kept: RevisionUnit[],
  geometry?: QuranGeometry | null
): SequentialCursor {
  if (!kept.length) return start;
  // Re-walk from start through the same packer path until we match last kept
  const packed = packSequentialRevision({
    ranges,
    cursor: start,
    targetPages: 999,
    maxItems: kept.length,
    geometry,
  });
  // Prefer nextCursor after exactly the kept units count
  // packSequentialRevision with maxItems=kept.length advances past those units
  if (packed.units.length >= kept.length) {
    return packed.nextCursor;
  }
  const last = kept[kept.length - 1];
  const merged = mergeSequentialRanges(ranges);
  const idx = merged.findIndex(
    (r) =>
      r.surah === last.surah &&
      last.fromAyah >= r.fromAyah &&
      last.toAyah <= r.toAyah
  );
  if (idx < 0) return packed.nextCursor;
  const r = merged[idx];
  if (last.toAyah >= r.toAyah) {
    const nextIdx = (idx + 1) % merged.length;
    return { rangeIdx: nextIdx, ayah: merged[nextIdx].fromAyah };
  }
  return { rangeIdx: idx, ayah: last.toAyah + 1 };
}

export function packRevisionDay(
  input: PackRevisionDayInput
): PackRevisionDayResult {
  const notes: string[] = [];
  const policyInput: RevisionPolicyInput = {
    hifzPointer: input.hifzPointer,
    memorizedRanges: input.memorizedRanges,
    revisionMinutes: input.revisionMinutes,
  };
  const policy = buildRevisionPolicy(policyInput);
  notes.push(
    `RevisionPolicy ratios stabilize=${policy.ratios.stabilize} neighborhood=${policy.ratios.neighborhood} corpus=${policy.ratios.corpus}`
  );

  const targetPages = Math.max(1, Math.round(input.revisionPages ?? 3));
  // Hard cap for sequential: enough slots for multi-surah pages (N * 3)
  const seqMaxItems = Math.max(targetPages * 4, 8);
  const items: PlanItem[] = [];
  const used = new Set<string>();

  const sortedAll = mergeSequentialRanges(
    input.memorizedRanges.map((r) => ({
      surah: r.surah,
      fromAyah: r.fromAyah,
      toAyah: r.toAyah,
      strengthScore: r.strengthScore,
    }))
  );

  const primary = policy.primarySurah;
  const primaryFrom =
    policy.buckets.find((b) => b.kind === "stabilize_primary")?.fromAyah ?? 1;
  const neighborhoodBucket = policy.buckets.find(
    (b) => b.kind === "neighborhood"
  );

  // Always resume from stream cursor; first day starts at first memorized range
  let seq: SequentialCursor =
    input.horizonCursor.seq ?? defaultSequentialCursor(sortedAll, null);
  const startCursor: HorizonRevisionCursor = {
    stabilizeAyah: seq.ayah,
    corpus: { rangeIdx: seq.rangeIdx, ayah: seq.ayah },
    seq: { rangeIdx: seq.rangeIdx, ayah: seq.ayah },
  };

  // ── 1) N consecutive Madani pages (hard) — never skip pages ──
  const packedSeq = packSequentialRevision({
    ranges: sortedAll,
    cursor: seq,
    targetPages,
    maxItems: seqMaxItems,
    geometry: input.geometry,
  });

  // Tag roles first (per micro-unit), then merge same surah+role spans
  const tagged: RevisionUnit[] = packedSeq.units.map((u) =>
    primary != null && u.surah === primary
      ? {
          ...u,
          role: "stabilize_primary" as const,
          reasonAr: "تثبيت متسلسل — صفحات المصحف بلا فجوات",
          internalTier: "far" as const,
        }
      : {
          ...u,
          role: "corpus_rest" as const,
          reasonAr: "مراجعة متسلسلة — N صفحات متتالية",
          internalTier: "far" as const,
        }
  );

  // Cursor must follow original micro-units (before merge) so no page gaps
  const seqUnitsForCursor = tagged;
  seq =
    tagged.length === packedSeq.units.length
      ? packedSeq.nextCursor
      : cursorAfterUnits(
          sortedAll,
          startCursor.seq!,
          seqUnitsForCursor,
          input.geometry
        );

  const mergedUnits = mergeConsecutiveSameSurahUnits(
    tagged,
    input.geometry
  );

  const seqUnitsKept: RevisionUnit[] = [];
  for (const roleUnit of mergedUnits) {
    const k = unitKey(roleUnit);
    if (used.has(k)) continue;
    used.add(k);
    seqUnitsKept.push(roleUnit);
    items.push(
      unitToPlanItem(roleUnit, input.dayNumber, input.runId)
    );
    notes.push(
      `sequential ${roleUnit.surah}:${roleUnit.fromAyah}-${roleUnit.toAyah} (${roleUnit.labelAr})`
    );
  }

  if (packedSeq.pageIds.length) {
    notes.push(
      `revisionPages N=${targetPages} distinct=[${packedSeq.pageIds.join(",")}] packed=${packedSeq.pagesPacked}${packedSeq.wrapped ? " wrapped" : ""}`
    );
  } else {
    notes.push(`revisionPages N=${targetPages} packed=${packedSeq.pagesPacked}`);
  }

  // ── 2) Neighborhood (soft) — may be dropped for time ──
  const neighborhoodItems: PlanItem[] = [];
  if (
    input.previousHifz ||
    (neighborhoodBucket && neighborhoodBucket.minutes > 0)
  ) {
    if (input.urgentSingleAyah) {
      const u = buildNeighborhoodUnit(
        input.urgentSingleAyah,
        {
          minAyah: input.urgentSingleAyah.fromAyah,
          maxAyah: input.urgentSingleAyah.toAyah,
        },
        input.geometry,
        { urgentSingleAyah: true }
      );
      const k = unitKey(u);
      if (!used.has(k)) {
        used.add(k);
        neighborhoodItems.push(
          unitToPlanItem(u, input.dayNumber, input.runId)
        );
      }
    } else {
      const hifzStart = input.hifzPointer.ayah;
      const memorizedEnd = Math.max(1, hifzStart - 1);
      const center: RangeRef = input.previousHifz
        ? {
            surah: input.previousHifz.surah,
            fromAyah: input.previousHifz.fromAyah,
            toAyah: Math.min(input.previousHifz.toAyah, memorizedEnd),
          }
        : {
            surah: input.hifzPointer.surah,
            fromAyah: Math.max(1, memorizedEnd - 8),
            toAyah: memorizedEnd,
          };

      if (center.toAyah >= center.fromAyah && center.toAyah >= 1) {
        const bounds = {
          minAyah: primary && center.surah === primary ? primaryFrom : 1,
          maxAyah:
            center.surah === input.hifzPointer.surah
              ? memorizedEnd
              : input.geometry?.getAyahCount(center.surah) || center.toAyah,
        };
        if (bounds.maxAyah >= bounds.minAyah) {
          const u = buildNeighborhoodUnit(center, bounds, input.geometry);
          if (u.surah === input.hifzPointer.surah && u.toAyah >= hifzStart) {
            u.toAyah = memorizedEnd;
            u.fromAyah = Math.min(u.fromAyah, u.toAyah);
          }
          if (u.toAyah >= u.fromAyah && u.toAyah - u.fromAyah + 1 >= 3) {
            const k = unitKey(u);
            if (!used.has(k)) {
              used.add(k);
              neighborhoodItems.push(
                unitToPlanItem(u, input.dayNumber, input.runId)
              );
              notes.push(`neighborhood ${u.surah}:${u.fromAyah}-${u.toAyah}`);
            }
          }
        }
      }
    }
  }

  // Append neighborhood only if minutes allow — NEVER drop sequential for time
  let total = minutesOf(items);
  for (const n of neighborhoodItems) {
    if (total + (n.estimatedMinutes || 0) <= input.revisionMinutes * 1.25) {
      items.push(n);
      total += n.estimatedMinutes || 0;
    }
  }

  return {
    items,
    policy,
    startCursor,
    nextCursor: {
      stabilizeAyah: seq.ayah,
      corpus: { rangeIdx: seq.rangeIdx, ayah: seq.ayah },
      seq,
    },
    notes,
  };
}

/**
 * Build memorized ranges from SRS memory bank.
 */
export function memorizedRangesFromMemory(
  memory: readonly {
    content?: {
      surah?: number;
      fromAyah?: number;
      toAyah?: number;
    };
    strengthScore?: number;
  }[]
): MemorizedRange[] {
  const map = new Map<string, MemorizedRange>();
  for (const m of memory) {
    const surah = m.content?.surah;
    if (!surah) continue;
    const fromAyah = m.content?.fromAyah ?? 1;
    const toAyah = m.content?.toAyah ?? fromAyah;
    const key = `${surah}:${fromAyah}:${toAyah}`;
    const strengthScore = m.strengthScore ?? 0.55;
    const prev = map.get(key);
    if (!prev || strengthScore < prev.strengthScore) {
      map.set(key, { surah, fromAyah, toAyah, strengthScore });
    }
  }
  const list = [...map.values()].sort(
    (a, b) => a.surah - b.surah || a.fromAyah - b.fromAyah
  );
  return mergeAdjacentRanges(list);
}

function mergeAdjacentRanges(ranges: MemorizedRange[]): MemorizedRange[] {
  if (ranges.length === 0) return [];
  const out: MemorizedRange[] = [];
  let cur = { ...ranges[0] };
  for (let i = 1; i < ranges.length; i++) {
    const n = ranges[i];
    if (n.surah === cur.surah && n.fromAyah <= cur.toAyah + 1) {
      cur.toAyah = Math.max(cur.toAyah, n.toAyah);
      cur.strengthScore = Math.min(cur.strengthScore, n.strengthScore);
    } else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}
