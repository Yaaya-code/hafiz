/**
 * Stable onboarding / preference profile for the planning engine.
 * Distinct from UI storage shapes — pure domain model.
 */

import type {
  ISODate,
  LearningStyle,
  MemorizationStrengthLevel,
  ProgressionMode,
  RevisionStyle,
  SurahNumber,
  UserId,
} from "./primitives";

/** What the user already claims to have memorized (input to the engine). */
export interface MemorizedSurahEntry {
  surah: SurahNumber;
  strength: MemorizationStrengthLevel;
  /** Partial surah: memorized from this ayah (inclusive) */
  fromAyah?: number;
  /** Partial surah: memorized through this ayah (inclusive) */
  toAyah?: number;
}

export interface MemorizedJuzEntry {
  juz: number;
  strength: MemorizationStrengthLevel;
}

export interface MemorizedRangeEntry {
  fromSurah: SurahNumber;
  toSurah: SurahNumber;
  strength: MemorizationStrengthLevel;
}

export type MemorizationSelectionMode = "JUZ" | "SURAH" | "RANGE" | "NONE";

export interface MemorizationSelection {
  mode: MemorizationSelectionMode;
  surahSelections: MemorizedSurahEntry[];
  juzSelections: MemorizedJuzEntry[];
  range?: MemorizedRangeEntry;
}

/**
 * Immutable-ish user profile as seen by the Rule Engine.
 * UI / persistence layers map into this structure.
 */
export interface UserProfile {
  userId: UserId;
  displayName: string;

  /** Target new hifz volume in mushaf pages per active day */
  pagesPerDay: number;

  /** Available daily minutes (soft budget for later phases) */
  dailyMinutes: number;

  /** Self-assessed overall retention (1 weak → 5 solid) */
  memorizationStrength: 1 | 2 | 3 | 4 | 5;

  revisionStyle: RevisionStyle;
  learningStyle: LearningStyle;
  progressionMode: ProgressionMode;

  memorizationSelection: MemorizationSelection;

  preferredQariId?: string;
  goals: string[];

  /** When onboarding completed (if ever) */
  onboardingCompletedAt?: ISODate;

  /** Opaque extension bag for future rule flags */
  flags?: Record<string, boolean | string | number>;
}
