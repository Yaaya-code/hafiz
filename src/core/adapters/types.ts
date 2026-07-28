/**
 * Loose application DTOs accepted by adapters.
 *
 * These mirror UI / client-persistence / sync shapes without importing `@/lib`
 * (keeps core free of storage and browser APIs).
 */

/** App-layer memorization strength labels */
export type AppMemorizationStrength =
  | "STRONG"
  | "GOOD"
  | "NEEDS_REVIEW"
  | "WEAK";

export type AppLearningStyle =
  | "LISTENING"
  | "READING"
  | "WRITING"
  | "LISTEN_AND_READ"
  | "WITH_TEACHER";

export type AppRevisionStyle = "intensive" | "balanced" | "light";

export type AppProgressionMode =
  | "continue_forward"
  | "from_start"
  | "bottom_up"
  | "complete_nearby";

export interface AppMemorizedSurahSelection {
  surah: number;
  strength: AppMemorizationStrength;
  fromAyah?: number;
  toAyah?: number;
}

export interface AppMemorizedJuzSelection {
  juz: number;
  strength: AppMemorizationStrength;
}

export interface AppMemorizedRangeSelection {
  fromSurah: number;
  toSurah: number;
  strength: AppMemorizationStrength;
}

export interface AppMemorizationSelection {
  mode?: "JUZ" | "SURAH" | "RANGE" | "NONE" | string;
  juzSelections?: AppMemorizedJuzSelection[];
  surahSelections?: AppMemorizedSurahSelection[];
  range?: AppMemorizedRangeSelection;
}

/**
 * HafizProfile-like source (local onboarding profile).
 * Field names match `HafizProfile` in the app layer.
 */
export interface HafizProfileSource {
  version?: number;
  completedAt?: string;
  name?: string;
  startPage?: number;
  currentPage?: number;
  startSurah?: string;
  currentSurah?: string;
  pagesPerDay?: number;
  revisionSessionsPerDay?: number;
  dailyMinutes?: number;
  memorizationStrength?: 1 | 2 | 3 | 4 | 5 | number;
  revisionStyle?: AppRevisionStyle | string;
  goals?: string[];
  onboardingComplete?: boolean;
  preferredQariId?: string;
  memorizationSelection?: AppMemorizationSelection;
  learningStyle?: AppLearningStyle | string;
  progressionMode?: AppProgressionMode | string;
  /** complete_quran | selected_surahs | revision_only */
  learningGoalId?: string;
  /** Optional stable id when known (guest / user) */
  userId?: string;
}

/** App mistake item (user-activity style). */
export interface AppMistakeItem {
  id?: string;
  surahNumber?: number;
  surah?: number;
  ayahNumber?: number;
  ayah?: number;
  pageNumber?: number;
  page?: number;
  type?: string;
  category?: string;
  difficulty?: number;
  frequency?: number;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  lastOccurredAt?: string;
}

/** App session record (optional progress feed). */
export interface AppSessionItem {
  id?: string;
  userId?: string;
  date?: string;
  kind?: string;
  surahNumber?: number;
  outcome?: string;
  durationMinutes?: number;
  notes?: string;
  createdAt?: string;
  target?: {
    surah?: number;
    fromAyah?: number;
    toAyah?: number;
  };
}

/** Quran slice-like for revision queues. */
export interface AppQuranSlice {
  labelAr?: string;
  pagesApprox?: number;
  range?: { surah: number; fromAyah: number; toAyah: number };
  span?: { fromSurah: number; toSurah: number };
  startPage?: number;
  endPage?: number;
}

export interface AppRevisionQueueItem {
  id?: string;
  slice?: AppQuranSlice;
  priority?: number;
  timesServed?: number;
  lastServedDate?: string;
  source?: string;
}

export interface AppHifzPointer {
  surah?: number;
  ayah?: number;
}

/**
 * Aggregate progress payload for state adaptation.
 * All fields optional — missing data gets safe defaults.
 */
export interface AppProgressSource {
  userId?: string;
  streakDays?: number;
  lastPlannedDate?: string;
  updatedAt?: string;
  stateVersion?: number;

  /** New hifz cursor */
  hifzPointer?: AppHifzPointer;
  hifzTrack?: string;
  hifzPaused?: boolean;
  weekHifzLog?: AppQuranSlice[];
  lastCompletedSlice?: AppQuranSlice;
  lastAdvancedDate?: string;

  /** Revision queues */
  nearStack?: AppRevisionQueueItem[];
  farQueue?: AppRevisionQueueItem[];
  farIndex?: number;
  weekLog?: AppRevisionQueueItem[];
  nearStackMax?: number;

  /** Learning posture overrides */
  strengthScore?: 1 | 2 | 3 | 4 | 5 | number;
  effectiveStrength?: AppMemorizationStrength | string;
  learningStyle?: AppLearningStyle | string;
  revisionStyle?: AppRevisionStyle | string;
  newHifzEnabled?: boolean;
  dailyPageCapacity?: number;
  dailyMinuteCapacity?: number;
  activeScenarioId?: string;

  /** Planning machine snapshot (optional) */
  planningScenarioId?: string;
  planningHifzEnabled?: boolean;
  planningDailyPageCapacity?: number;
  horizonStartDate?: string;
  generatedDayCount?: number;

  mistakes?: AppMistakeItem[];
  sessions?: AppSessionItem[];

  /** Ayah-level map "surah:ayah" → progress (optional enrichment) */
  ayahProgress?: Record<
    string,
    {
      surahNumber?: number;
      ayahNumber?: number;
      status?: string;
      confidence?: number;
      lastRevisedAt?: string;
      failTests?: number;
      successTests?: number;
    }
  >;
}

export interface ProfileAdapterOptions {
  /** Override user id when profile has none */
  userId?: string;
}

export interface StateAdapterOptions {
  userId?: string;
  /** Profile used to fill learning defaults (minutes, strength, styles) */
  profile?: HafizProfileSource | import("../models").UserProfile;
  asOfDate?: Date | string;
}
