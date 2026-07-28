/**
 * P0 — MemorizationMap builders + derived analysis.
 * Structural reality only; strength defaults to UNKNOWN from declaration.
 *
 * Path rules (product-critical):
 * - Continue the main mushaf journey (after furthest early surah).
 * - Never send users with Baqarah/Imran/Maidah back to An-Nas for NEW_HIFZ.
 * - Amma is revision material if early journey exists.
 */

import { getSurah } from "@/lib/quran/surahs";
import { getJuz } from "@/lib/quran/juz";
import type { HafizProfile } from "@/lib/user-profile";
import type {
  DerivedMemorizationState,
  MemorizationMap,
  MemorizationRegion,
  AyahPointer,
  JourneyShape,
  PathPreference,
  SystemStrength,
} from "./types";

/** Surahs 1–77 = main journey; 78–114 = Juz ʿAmma */
const EARLY_MAX = 77;
const AMMA_MIN = 78;

/**
 * Classify overall journey shape for path intelligence (all user types).
 */
export function classifyJourneyShape(
  surahs: number[]
): JourneyShape {
  if (surahs.length === 0) return "empty";
  const early = surahs.filter((s) => s <= EARLY_MAX);
  const amma = surahs.filter((s) => s >= AMMA_MIN);
  const hasStartCore = early.some((s) => s <= 3); // Fatiha–Imran zone
  const hasAmma = amma.length > 0;
  const hasEarly = early.length > 0;

  if (hasEarly && hasAmma) return "mixed_early_amma";
  if (hasAmma && !hasEarly) return "amma_bottom";
  if (hasEarly && hasStartCore) return "early_forward";
  // Early-ish but only mid (e.g. 18, 20, 36) without start continuum
  if (hasEarly && !hasStartCore) return "middle_only";
  return "middle_only";
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampAyah(surahId: number, ayah: number): number {
  const full = getSurah(surahId)?.ayahCount ?? 1;
  return Math.min(full, Math.max(1, Math.floor(ayah)));
}

function surahNameAr(id: number): string {
  return getSurah(id)?.nameAr ?? `سورة ${id}`;
}

/** Merge overlapping/adjacent regions on same surah. */
export function normalizeRegions(
  regions: MemorizationRegion[]
): MemorizationRegion[] {
  const bySurah = new Map<number, MemorizationRegion[]>();
  for (const r of regions) {
    if (r.surahId < 1 || r.surahId > 114) continue;
    const from = clampAyah(r.surahId, r.fromAyah);
    const to = clampAyah(r.surahId, r.toAyah);
    if (to < from) continue;
    const list = bySurah.get(r.surahId) ?? [];
    list.push({ ...r, fromAyah: from, toAyah: to });
    bySurah.set(r.surahId, list);
  }

  const out: MemorizationRegion[] = [];
  for (const [surahId, list] of [...bySurah.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    list.sort((a, b) => a.fromAyah - b.fromAyah);
    let cur = { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      const n = list[i];
      if (n.fromAyah <= cur.toAyah + 1) {
        cur.toAyah = Math.max(cur.toAyah, n.toAyah);
        cur.strength = weakerStrength(cur.strength, n.strength);
        if (n.source === "VERIFIED" || n.source === "SESSION") {
          cur.source = n.source;
        }
        cur.strengthConfidence = Math.max(
          cur.strengthConfidence ?? 0,
          n.strengthConfidence ?? 0
        );
      } else {
        out.push(cur);
        cur = { ...n };
      }
    }
    out.push({ ...cur, surahId });
  }
  return out;
}

function weakerStrength(a: SystemStrength, b: SystemStrength): SystemStrength {
  const rank: Record<SystemStrength, number> = {
    WEAK: 0,
    NEEDS_REVIEW: 1,
    UNKNOWN: 2,
    GOOD: 3,
    STRONG: 4,
  };
  return rank[a] <= rank[b] ? a : b;
}

/**
 * Build map from existing HafizProfile selection (backward compatible).
 * User strength labels are NOT SystemStrength truth.
 */
export function buildMemorizationMapFromProfile(
  profile: HafizProfile
): MemorizationMap {
  const regions: MemorizationRegion[] = [];
  const sel = profile.memorizationSelection;
  const ts = nowIso();

  for (const s of sel?.surahSelections ?? []) {
    const surahId = Number(s.surah);
    if (surahId < 1 || surahId > 114) continue;
    const full = getSurah(surahId)?.ayahCount ?? 1;
    const fromAyah =
      typeof s.fromAyah === "number" && s.fromAyah > 0 ? s.fromAyah : 1;
    const toAyah =
      typeof s.toAyah === "number" && s.toAyah > 0
        ? Math.min(full, s.toAyah)
        : full;
    regions.push({
      surahId,
      fromAyah,
      toAyah,
      source: "DECLARED",
      strength: "UNKNOWN",
      strengthConfidence: 0,
      updatedAt: ts,
    });
  }

  for (const j of sel?.juzSelections ?? []) {
    const meta = getJuz(Number(j.juz));
    if (!meta) continue;
    for (const surahId of meta.surahs) {
      const already = regions.some((r) => r.surahId === surahId);
      if (already) continue;
      const full = getSurah(surahId)?.ayahCount ?? 1;
      regions.push({
        surahId,
        fromAyah: 1,
        toAyah: full,
        source: "DECLARED",
        strength: "UNKNOWN",
        strengthConfidence: 0,
        updatedAt: ts,
      });
    }
  }

  if (sel?.range) {
    const a = Math.min(sel.range.fromSurah, sel.range.toSurah);
    const b = Math.max(sel.range.fromSurah, sel.range.toSurah);
    for (let surahId = a; surahId <= b; surahId++) {
      if (regions.some((r) => r.surahId === surahId)) continue;
      const full = getSurah(surahId)?.ayahCount ?? 1;
      regions.push({
        surahId,
        fromAyah: 1,
        toAyah: full,
        source: "DECLARED",
        strength: "UNKNOWN",
        strengthConfidence: 0,
        updatedAt: ts,
      });
    }
  }

  return {
    version: 1,
    regions: normalizeRegions(regions),
    updatedAt: ts,
  };
}

export function emptyMemorizationMap(): MemorizationMap {
  return { version: 1, regions: [], updatedAt: nowIso() };
}

function isConsecutive(surahs: number[]): boolean {
  if (surahs.length <= 1) return true;
  for (let i = 1; i < surahs.length; i++) {
    if (surahs[i] !== surahs[i - 1] + 1) return false;
  }
  return true;
}

/**
 * Derive gaps + suggested NEW_HIFZ continue pointer.
 */
export function deriveMemorizationState(
  map: MemorizationMap
): DerivedMemorizationState {
  const regions = normalizeRegions(map.regions);
  const covered = new Map<number, { from: number; to: number }[]>();
  for (const r of regions) {
    const list = covered.get(r.surahId) ?? [];
    list.push({ from: r.fromAyah, to: r.toAyah });
    covered.set(r.surahId, list);
  }

  const incompletePartials: DerivedMemorizationState["incompletePartials"] =
    [];
  for (const r of regions) {
    const full = getSurah(r.surahId)?.ayahCount ?? r.toAyah;
    if (r.toAyah < full) {
      incompletePartials.push({
        surahId: r.surahId,
        fromAyah: r.fromAyah,
        toAyah: r.toAyah,
        continueAt: r.toAyah + 1,
      });
    }
  }
  incompletePartials.sort((a, b) => a.surahId - b.surahId);

  const surahs = [...new Set(regions.map((r) => r.surahId))].sort(
    (a, b) => a - b
  );
  const earlySurahs = surahs.filter((s) => s <= EARLY_MAX);
  const ammaSurahs = surahs.filter((s) => s >= AMMA_MIN);
  const fragmented = !isConsecutive(surahs) && surahs.length > 1;

  const gaps: DerivedMemorizationState["gaps"] = [];
  for (let s = 1; s <= 114; s++) {
    if (!covered.has(s)) {
      const full = getSurah(s)?.ayahCount ?? 1;
      gaps.push({ surahId: s, fromAyah: 1, toAyah: full });
    }
  }

  const contiguousBlocks: DerivedMemorizationState["contiguousBlocks"] = [];
  if (surahs.length) {
    let block = [surahs[0]];
    for (let i = 1; i < surahs.length; i++) {
      if (surahs[i] === block[block.length - 1] + 1) {
        block.push(surahs[i]);
      } else {
        contiguousBlocks.push({
          fromSurah: block[0],
          toSurah: block[block.length - 1],
          surahs: block,
        });
        block = [surahs[i]];
      }
    }
    contiguousBlocks.push({
      fromSurah: block[0],
      toSurah: block[block.length - 1],
      surahs: block,
    });
  }

  let suggestedContinuePointer: AyahPointer | null = null;
  let pathReasonAr = "";
  let ambiguity = false;
  let primaryPathCandidate: AyahPointer | null = null;
  let pathChoices: DerivedMemorizationState["pathChoices"];

  const journeyShape = classifyJourneyShape(surahs);
  const earlyIncomplete = incompletePartials.filter(
    (p) => p.surahId <= EARLY_MAX
  );
  const incompletePool =
    earlyIncomplete.length > 0 ? earlyIncomplete : incompletePartials;

  // 1) Always finish a single clear incomplete partial first
  if (incompletePool.length === 1) {
    const p = incompletePool[0];
    suggestedContinuePointer = {
      surahId: p.surahId,
      ayah: p.continueAt,
    };
    pathReasonAr = `الأفضل: إكمال ${surahNameAr(p.surahId)} من الآية ${p.continueAt}`;
  } else if (
    incompletePool.length > 1 &&
    journeyShape !== "middle_only"
  ) {
    // Frontier incomplete (continue as you go)
    const p =
      earlyIncomplete.length > 0
        ? earlyIncomplete[earlyIncomplete.length - 1]
        : incompletePool[0];
    suggestedContinuePointer = {
      surahId: p.surahId,
      ayah: p.continueAt,
    };
    pathReasonAr = `نكمل ${surahNameAr(p.surahId)} من الآية ${p.continueAt}`;
  } else if (journeyShape === "empty") {
    suggestedContinuePointer = { surahId: 114, ayah: 1 };
    pathReasonAr = "البداية من جزء عم (مسار المبتدئ)";
    primaryPathCandidate = suggestedContinuePointer;
  } else if (
    journeyShape === "early_forward" ||
    journeyShape === "mixed_early_amma"
  ) {
    // Has start-of-mushaf progress (+ maybe Amma): continue after furthest EARLY
    const frontier = Math.max(...earlySurahs);
    const frontierFull = getSurah(frontier)?.ayahCount ?? 1;
    const frontierRegions = regions.filter((r) => r.surahId === frontier);
    const frontierTo = Math.max(...frontierRegions.map((r) => r.toAyah));

    if (frontierTo < frontierFull) {
      suggestedContinuePointer = {
        surahId: frontier,
        ayah: frontierTo + 1,
      };
      pathReasonAr = `نكمل ${surahNameAr(frontier)} من الآية ${frontierTo + 1} كما تسيرين`;
    } else if (frontier < EARLY_MAX) {
      suggestedContinuePointer = { surahId: frontier + 1, ayah: 1 };
      pathReasonAr = `المتابعة بعد ${surahNameAr(frontier)} — ${surahNameAr(frontier + 1)} (جزء عم للمراجعة فقط)`;
    } else {
      const missingAmma = gaps.find((g) => g.surahId >= AMMA_MIN);
      suggestedContinuePointer = missingAmma
        ? { surahId: missingAmma.surahId, ayah: 1 }
        : { surahId: 114, ayah: getSurah(114)?.ayahCount ?? 6 };
      pathReasonAr = missingAmma
        ? `بعد تقدّمك — نكمل ${surahNameAr(missingAmma.surahId)}`
        : "المحفوظ يغطي المصحف تقريباً";
    }
    primaryPathCandidate = suggestedContinuePointer;
  } else if (journeyShape === "amma_bottom") {
    const lastAmma = Math.max(...ammaSurahs);
    const ammaLooksComplete =
      ammaSurahs.length >= 30 ||
      (Math.min(...ammaSurahs) <= 78 && lastAmma >= 112);
    if (ammaLooksComplete) {
      suggestedContinuePointer = { surahId: 2, ayah: 1 };
      pathReasonAr =
        "جزء عم محفوظ — الأفضل الانتقال للبقرة لإكمال القرآن";
    } else {
      const nextAmma = gaps.find(
        (g) => g.surahId >= AMMA_MIN && g.surahId <= 114
      );
      suggestedContinuePointer = nextAmma
        ? { surahId: nextAmma.surahId, ayah: 1 }
        : { surahId: Math.min(114, lastAmma + 1), ayah: 1 };
      pathReasonAr = `نكمل جزء عم من ${surahNameAr(suggestedContinuePointer.surahId)}`;
    }
    primaryPathCandidate = suggestedContinuePointer;
  } else {
    // middle_only — need user preference if unset (general, not special-case)
    const frontier = Math.max(...surahs);
    const startPtr: AyahPointer = { surahId: 2, ayah: 1 };
    const endPtr: AyahPointer = { surahId: 114, ayah: 1 };
    const frontierPtr: AyahPointer =
      frontier < 114
        ? { surahId: frontier + 1, ayah: 1 }
        : { surahId: 114, ayah: getSurah(114)?.ayahCount ?? 6 };

    ambiguity = true;
    pathChoices = [
      {
        preference: "mushaf_start",
        pointer: startPtr,
        labelAr: "البدء/البناء من البقرة (سلسلة متصلة من أول المصحف)",
      },
      {
        preference: "mushaf_end",
        pointer: endPtr,
        labelAr: "المسار من جزء عم (من نهاية المصحف)",
      },
      {
        preference: "continue_frontier",
        pointer: frontierPtr,
        labelAr: `المتابعة بعد أبعد سورة عندك (${surahNameAr(frontier)})`,
      },
    ];
    // Default suggestion until user chooses: long-term from Baqarah
    suggestedContinuePointer = startPtr;
    primaryPathCandidate = startPtr;
    pathReasonAr =
      "محفوظك في وسط المصحف — الأفضل أن تختاري: من البداية أم من النهاية أم بعد أبعد سورة؟";
  }

  if (!suggestedContinuePointer) {
    suggestedContinuePointer = { surahId: 2, ayah: 1 };
    pathReasonAr = "مسار افتراضي: من البقرة";
  }

  return {
    gaps,
    contiguousBlocks,
    incompletePartials,
    fragmented,
    journeyShape,
    suggestedContinuePointer,
    primaryPathCandidate: primaryPathCandidate ?? suggestedContinuePointer,
    ambiguity,
    pathChoices,
    pathReasonAr,
  };
}

/**
 * Apply an explicit path preference (for middle_only / ambiguous maps).
 */
export function applyPathPreference(
  derived: DerivedMemorizationState,
  preference: PathPreference | undefined | null
): { pointer: AyahPointer; reasonAr: string } {
  if (!preference || preference === "unset" || !derived.pathChoices?.length) {
    return {
      pointer: derived.suggestedContinuePointer ?? { surahId: 2, ayah: 1 },
      reasonAr: derived.pathReasonAr,
    };
  }
  const hit = derived.pathChoices.find((c) => c.preference === preference);
  if (hit) {
    return { pointer: hit.pointer, reasonAr: hit.labelAr };
  }
  return {
    pointer: derived.suggestedContinuePointer ?? { surahId: 2, ayah: 1 },
    reasonAr: derived.pathReasonAr,
  };
}

/** Apply system strength to a region (evidence-driven). */
export function applyRegionStrength(
  map: MemorizationMap,
  surahId: number,
  fromAyah: number,
  toAyah: number,
  strength: SystemStrength,
  confidence: number
): MemorizationMap {
  const regions = map.regions.map((r) => {
    if (r.surahId !== surahId) return r;
    if (r.toAyah < fromAyah || r.fromAyah > toAyah) return r;
    return {
      ...r,
      strength,
      strengthConfidence: Math.min(1, Math.max(0, confidence)),
      updatedAt: nowIso(),
    };
  });
  return {
    ...map,
    regions: normalizeRegions(regions),
    updatedAt: nowIso(),
  };
}

/** Expand map when session completes new range (SESSION source). */
export function mergeSessionRangeIntoMap(
  map: MemorizationMap,
  surahId: number,
  fromAyah: number,
  toAyah: number
): MemorizationMap {
  const next: MemorizationRegion = {
    surahId,
    fromAyah,
    toAyah,
    source: "SESSION",
    strength: "UNKNOWN",
    strengthConfidence: 0.2,
    updatedAt: nowIso(),
  };
  return {
    version: 1,
    regions: normalizeRegions([...map.regions, next]),
    updatedAt: nowIso(),
  };
}

/**
 * Best surah to STABILIZE in revision: furthest early memorized surah
 * (what you already know), not An-Nas and not empty NEW_HIFZ surah.
 */
export function resolveRevisionPrimaryFromMap(
  map: MemorizationMap,
  hifzPointer?: { surah: number; ayah: number } | null
): { surah: number; fromAyah: number; toAyah: number } | null {
  const regions = normalizeRegions(map.regions);
  if (!regions.length) return null;

  const early = regions.filter((r) => r.surahId <= EARLY_MAX);
  const pool = early.length > 0 ? early : regions;
  // Prefer region behind cursor on same surah, else max surah in pool
  if (hifzPointer) {
    const behind = pool.filter(
      (r) =>
        r.surahId < hifzPointer.surah ||
        (r.surahId === hifzPointer.surah && r.toAyah < hifzPointer.ayah)
    );
    if (behind.length) {
      const top = behind.reduce((a, b) =>
        a.surahId > b.surahId ||
        (a.surahId === b.surahId && a.toAyah > b.toAyah)
          ? a
          : b
      );
      return {
        surah: top.surahId,
        fromAyah: top.fromAyah,
        toAyah: top.toAyah,
      };
    }
  }
  const top = pool.reduce((a, b) =>
    a.surahId > b.surahId || (a.surahId === b.surahId && a.toAyah > b.toAyah)
      ? a
      : b
  );
  return {
    surah: top.surahId,
    fromAyah: top.fromAyah,
    toAyah: top.toAyah,
  };
}
