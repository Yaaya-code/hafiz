/**
 * Profile Adapter — map app HafizProfile-like data → core UserProfile.
 * Mapping only. No rule logic. No I/O.
 */

import type {
  LearningStyle,
  MemorizationSelection,
  MemorizationSelectionMode,
  MemorizationStrengthLevel,
  ProgressionMode,
  RevisionStyle,
  UserProfile,
} from "../models";
import type {
  AppMemorizationSelection,
  AppMemorizationStrength,
  HafizProfileSource,
  ProfileAdapterOptions,
} from "./types";

const STRENGTH_LEVELS: readonly MemorizationStrengthLevel[] = [
  "STRONG",
  "GOOD",
  "NEEDS_REVIEW",
  "WEAK",
];

function clampStrengthScore(n: unknown): 1 | 2 | 3 | 4 | 5 {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 3;
  if (v <= 1) return 1;
  if (v === 2) return 2;
  if (v === 3) return 3;
  if (v === 4) return 4;
  return 5;
}

function mapRevisionStyle(raw: unknown): RevisionStyle {
  const s = String(raw ?? "balanced").toLowerCase();
  if (s === "intensive") return "intensive";
  if (s === "light") return "light";
  return "balanced";
}

function mapLearningStyle(raw: unknown): LearningStyle {
  const s = String(raw ?? "LISTEN_AND_READ").toUpperCase();
  if (s === "LISTENING") return "LISTENING";
  if (s === "READING") return "READING";
  if (s === "WRITING") return "WRITING";
  if (s === "WITH_TEACHER") return "WITH_TEACHER";
  if (s === "LISTEN_AND_READ") return "LISTEN_AND_READ";
  return "LISTEN_AND_READ";
}

function mapProgressionMode(raw: unknown): ProgressionMode {
  const s = String(raw ?? "continue_forward").toLowerCase();
  if (s === "from_start") return "from_start";
  if (s === "bottom_up") return "bottom_up";
  if (s === "complete_nearby") return "complete_nearby";
  return "continue_forward";
}

function mapItemStrength(raw: unknown): MemorizationStrengthLevel {
  const s = String(raw ?? "GOOD").toUpperCase();
  if ((STRENGTH_LEVELS as readonly string[]).includes(s)) {
    return s as MemorizationStrengthLevel;
  }
  return "GOOD";
}

function mapSelectionMode(raw: unknown): MemorizationSelectionMode {
  const s = String(raw ?? "NONE").toUpperCase();
  if (s === "JUZ" || s === "SURAH" || s === "RANGE" || s === "NONE") {
    return s;
  }
  return "NONE";
}

/**
 * Convert app memorization selection → core MemorizationSelection.
 */
export function adaptMemorizationSelection(
  sel: AppMemorizationSelection | undefined | null
): MemorizationSelection {
  if (!sel) {
    return {
      mode: "NONE",
      surahSelections: [],
      juzSelections: [],
    };
  }

  const juzSelections = (sel.juzSelections ?? []).map((j) => ({
    juz: Number(j.juz) || 0,
    strength: mapItemStrength(j.strength as AppMemorizationStrength),
  }));

  const surahSelections = (sel.surahSelections ?? []).map((s) => {
    const entry: {
      surah: number;
      strength: MemorizationStrengthLevel;
      fromAyah?: number;
      toAyah?: number;
    } = {
      surah: Number(s.surah) || 0,
      strength: mapItemStrength(s.strength as AppMemorizationStrength),
    };
    const fromA =
      typeof (s as { fromAyah?: number }).fromAyah === "number"
        ? Math.max(1, Math.floor((s as { fromAyah?: number }).fromAyah!))
        : undefined;
    const toA =
      typeof (s as { toAyah?: number }).toAyah === "number"
        ? Math.max(1, Math.floor((s as { toAyah?: number }).toAyah!))
        : undefined;
    if (fromA) entry.fromAyah = fromA;
    if (toA) entry.toAyah = toA;
    return entry;
  });

  let range: MemorizationSelection["range"];
  if (sel.range) {
    range = {
      fromSurah: Number(sel.range.fromSurah) || 1,
      toSurah: Number(sel.range.toSurah) || 1,
      strength: mapItemStrength(sel.range.strength),
    };
  }

  let mode = mapSelectionMode(sel.mode);

  // Infer mode when empty/missing
  if (mode === "NONE" || !sel.mode) {
    if (range) mode = "RANGE";
    else if (surahSelections.length) mode = "SURAH";
    else if (juzSelections.length) mode = "JUZ";
    else mode = "NONE";
  }

  // Empty selection → NONE regardless of declared mode
  if (
    !range &&
    surahSelections.length === 0 &&
    juzSelections.length === 0
  ) {
    mode = "NONE";
  }

  return {
    mode,
    surahSelections,
    juzSelections,
    range,
  };
}

/**
 * Convert HafizProfile (app) → UserProfile (core).
 * Pure mapping with safe defaults for missing optional fields.
 */
export function adaptHafizProfileToUserProfile(
  source: HafizProfileSource | null | undefined,
  options: ProfileAdapterOptions = {}
): UserProfile {
  const p = source ?? {};

  const pagesPerDay =
    typeof p.pagesPerDay === "number" && Number.isFinite(p.pagesPerDay)
      ? Math.max(0, p.pagesPerDay)
      : 1;

  const dailyMinutes =
    typeof p.dailyMinutes === "number" && Number.isFinite(p.dailyMinutes)
      ? Math.max(0, Math.floor(p.dailyMinutes))
      : 45;

  const userId =
    options.userId ??
    (typeof p.userId === "string" && p.userId.length > 0
      ? p.userId
      : "anonymous");

  const displayName =
    typeof p.name === "string" && p.name.trim().length > 0
      ? p.name.trim()
      : "صديق القرآن";

  const onboardingCompletedAt =
    typeof p.completedAt === "string" && p.completedAt.length >= 10
      ? p.completedAt.slice(0, 10)
      : undefined;

  const preferredQariId =
    typeof p.preferredQariId === "string" && p.preferredQariId.length > 0
      ? p.preferredQariId
      : undefined;

  return {
    userId,
    displayName,
    pagesPerDay,
    dailyMinutes,
    memorizationStrength: clampStrengthScore(p.memorizationStrength),
    revisionStyle: mapRevisionStyle(p.revisionStyle),
    learningStyle: mapLearningStyle(p.learningStyle),
    progressionMode: mapProgressionMode(p.progressionMode),
    memorizationSelection: adaptMemorizationSelection(p.memorizationSelection),
    preferredQariId,
    goals: Array.isArray(p.goals) ? p.goals.map(String) : [],
    onboardingCompletedAt,
    flags: {
      onboardingComplete: p.onboardingComplete === true,
      ...(typeof p.startPage === "number" ? { startPage: p.startPage } : {}),
      ...(typeof p.currentPage === "number"
        ? { currentPage: p.currentPage }
        : {}),
      ...(typeof p.revisionSessionsPerDay === "number"
        ? { revisionSessionsPerDay: p.revisionSessionsPerDay }
        : {}),
      ...(typeof p.learningGoalId === "string" && p.learningGoalId
        ? { learningGoalId: p.learningGoalId }
        : {}),
    },
  };
}
