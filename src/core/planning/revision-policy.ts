/**
 * RevisionPolicy — pedagogical priorities for daily revision.
 *
 * Owns WHAT to review and HOW MUCH time each band gets.
 * Does NOT own SRS due math, Decision eligibility, or HifzCursor.
 *
 * Ratios when a weak / active hifz surah exists (approved):
 *   70% stabilize primary (e.g. Baqarah 1 → hifz position)
 *   20% neighborhood of new hifz
 *   10% rest of corpus sequential (Amma, Fatiha, …)
 */

export type RevisionBucketKind =
  | "stabilize_primary"
  | "neighborhood"
  | "corpus_rest";

export type MemorizedRange = {
  surah: number;
  fromAyah: number;
  toAyah: number;
  /** 0–1 strength (lower = weaker) */
  strengthScore: number;
};

export type RevisionPolicyInput = {
  /** Where NEW_HIFZ continues (Actual cursor) */
  hifzPointer: { surah: number; ayah: number };
  /** Declared / known memorized ranges */
  memorizedRanges: readonly MemorizedRange[];
  /** Daily minutes allocated to revision */
  revisionMinutes: number;
  /**
   * If true (default when primary has content), use 70/20/10.
   * If false (no primary corpus), fall back to balanced rest-only.
   */
  preferPrimaryStabilize?: boolean;
};

export type RevisionBucket = {
  kind: RevisionBucketKind;
  minutes: number;
  /** Surah focus for this bucket (primary first) */
  focusSurah?: number;
  /** Inclusive ayah window preference for stabilize */
  fromAyah?: number;
  toAyah?: number;
  reasonAr: string;
  /** Share of revision budget 0–1 */
  share: number;
};

export type RevisionPolicy = {
  buckets: RevisionBucket[];
  primarySurah: number | null;
  primaryToAyah: number | null;
  ratios: { stabilize: number; neighborhood: number; corpus: number };
};

const RATIO_STABILIZE = 0.7;
const RATIO_NEIGHBORHOOD = 0.2;
const RATIO_CORPUS = 0.1;

function clampMinutes(n: number, min = 0): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.round(n));
}

/**
 * Infer primary surah to STABILIZE (already memorized).
 *
 * Prefer main-mushaf journey material (1–77) behind the NEW_HIFZ pointer —
 * never pick An-Nas just because Amma is in the map.
 */
export function resolvePrimarySurah(
  input: Pick<RevisionPolicyInput, "hifzPointer" | "memorizedRanges">
): { surah: number; fromAyah: number; toAyah: number; strengthScore: number } | null {
  const ptr = input.hifzPointer;
  const ranges = input.memorizedRanges.filter(
    (r) => r.surah >= 1 && r.surah <= 114 && r.toAyah >= r.fromAyah
  );
  if (ranges.length === 0) return null;

  const EARLY = 77;
  const early = ranges.filter((r) => r.surah <= EARLY);
  const pool = early.length > 0 ? early : ranges;

  // Same surah as pointer, only already-memorized portion
  const onPointer = pool.filter((r) => r.surah === ptr.surah);
  if (onPointer.length > 0) {
    const fromAyah = Math.min(...onPointer.map((r) => r.fromAyah));
    const maxTo = Math.max(...onPointer.map((r) => r.toAyah));
    const toAyah = Math.min(
      maxTo,
      Math.max(fromAyah, (ptr.ayah > 1 ? ptr.ayah - 1 : maxTo))
    );
    if (toAyah >= fromAyah) {
      return {
        surah: ptr.surah,
        fromAyah,
        toAyah,
        strengthScore: Math.min(...onPointer.map((r) => r.strengthScore)),
      };
    }
  }

  // Furthest early memorized surah (e.g. Maidah when NEW_HIFZ is An'am)
  const behind = pool.filter(
    (r) =>
      r.surah < ptr.surah || (r.surah === ptr.surah && r.toAyah < ptr.ayah)
  );
  const use = behind.length > 0 ? behind : pool;
  const top = use.reduce((a, b) =>
    a.surah > b.surah || (a.surah === b.surah && a.toAyah > b.toAyah) ? a : b
  );
  return {
    surah: top.surah,
    fromAyah: top.fromAyah,
    toAyah: top.toAyah,
    strengthScore: top.strengthScore,
  };
}

/**
 * Build daily revision policy (time bands + pedagogical focus).
 */
export function buildRevisionPolicy(input: RevisionPolicyInput): RevisionPolicy {
  const total = Math.max(0, input.revisionMinutes);
  const primary = resolvePrimarySurah(input);
  const usePrimary =
    input.preferPrimaryStabilize !== false && primary != null;

  if (!usePrimary || !primary) {
    // No primary zone — all revision is sequential corpus
    return {
      buckets: [
        {
          kind: "corpus_rest",
          minutes: clampMinutes(total),
          reasonAr: "مراجعة المحفوظ بالتسلسل",
          share: 1,
        },
      ],
      primarySurah: null,
      primaryToAyah: null,
      ratios: { stabilize: 0, neighborhood: 0, corpus: 1 },
    };
  }

  let stabilizeMin = clampMinutes(total * RATIO_STABILIZE);
  let neighborhoodMin = clampMinutes(total * RATIO_NEIGHBORHOOD);
  let corpusMin = clampMinutes(total * RATIO_CORPUS);

  // Fix rounding so sum ≈ total
  const sum = stabilizeMin + neighborhoodMin + corpusMin;
  if (sum !== total && total > 0) {
    stabilizeMin = Math.max(0, stabilizeMin + (total - sum));
  }
  // Ensure stabilize keeps majority when total is small
  if (total >= 10 && stabilizeMin < neighborhoodMin + corpusMin) {
    stabilizeMin = clampMinutes(total * RATIO_STABILIZE);
    neighborhoodMin = clampMinutes(total * RATIO_NEIGHBORHOOD);
    corpusMin = Math.max(0, total - stabilizeMin - neighborhoodMin);
  }

  const buckets: RevisionBucket[] = (
    [
      {
        kind: "stabilize_primary" as const,
        minutes: stabilizeMin,
        focusSurah: primary.surah,
        fromAyah: primary.fromAyah,
        toAyah: primary.toAyah,
        reasonAr: `تثبيت السورة ${primary.surah} (منطقة الضعف / الحفظ الحالي)`,
        share: RATIO_STABILIZE,
      },
      {
        kind: "neighborhood" as const,
        minutes: neighborhoodMin,
        focusSurah: primary.surah,
        fromAyah: Math.max(primary.fromAyah, primary.toAyah - 10),
        toAyah: primary.toAyah,
        reasonAr: "جوار موضع الحفظ الجديد",
        share: RATIO_NEIGHBORHOOD,
      },
      {
        kind: "corpus_rest" as const,
        minutes: corpusMin,
        reasonAr: "مراجعة باقي المحفوظ بالتسلسل",
        share: RATIO_CORPUS,
      },
    ] satisfies RevisionBucket[]
  ).filter((b) => b.minutes > 0);

  return {
    buckets,
    primarySurah: primary.surah,
    primaryToAyah: primary.toAyah,
    ratios: {
      stabilize: RATIO_STABILIZE,
      neighborhood: RATIO_NEIGHBORHOOD,
      corpus: RATIO_CORPUS,
    },
  };
}
