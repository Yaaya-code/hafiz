export type MemorizationStrength = "STRONG" | "GOOD" | "NEEDS_REVIEW" | "WEAK";

export type SimilarityType =
  | "SIMILAR_WORDS"
  | "SIMILAR_PHRASES"
  | "SIMILAR_STRUCTURE"
  | "SIMILAR_ENDINGS"
  | "SIMILAR_BEGINNINGS"
  | "SIMILAR_MEANINGS"
  | "SIMILAR_STORIES"
  | "DIFFERENT_LETTERS"
  | "DIFFERENT_WORD_ORDER"
  | "DIFFERENT_GRAMMAR"
  | "DIFFERENT_CONTEXT";

export type LearningStyle =
  | "LISTENING"
  | "READING"
  | "WRITING"
  | "LISTEN_AND_READ"
  | "WITH_TEACHER";

export interface SurahMeta {
  number: number;
  nameAr: string;
  nameEn: string;
  nameTransliteration: string;
  ayahCount: number;
  revelationType: "Meccan" | "Medinan";
  startPage: number;
  endPage: number;
  startJuz: number;
}

export interface JuzMeta {
  number: number;
  nameAr: string;
  nameEn: string;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  surahs: number[];
  startPage: number;
  endPage: number;
}

export interface AyahRecord {
  surahNumber: number;
  ayahNumber: number;
  text: string;
  page: number;
  juz: number;
  hizb: number;
  globalIndex?: number;
}

export interface Qari {
  id: string;
  nameAr: string;
  nameEn: string;
  image: string;
  /**
   * everyayah.com verse-by-verse folder (required for "verse" mode).
   * For surah-level packs use a sentinel like "surah" and set surahBaseUrl.
   */
  everyAyahFolder: string;
  style: string;
  bitrate: string;
  /** نبذة عربية اختيارية */
  bioAr?: string;
  /**
   * Playback mode:
   * - verse (default): everyayah `{folder}/{SSS}{AAA}.mp3`
   * - surah: full-surah files at `{surahBaseUrl}{SSS}.mp3` (e.g. mp3quran)
   */
  playbackMode?: "verse" | "surah";
  /** Base URL ending with / for surah-mode packs */
  surahBaseUrl?: string;
  /** Surah numbers missing from a surah-mode pack → ayahAudioUrl uses Alafasy verse */
  missingSurahs?: number[];
}

export interface AyahProgress {
  surahNumber: number;
  ayahNumber: number;
  listenCount: number;
  practiceCount: number;
  successTests: number;
  failTests: number;
  memorizedAt?: string;
  lastRevisedAt?: string;
  confidence: number;
  status: MemorizationStrength | "NOT_STARTED" | "MASTERED";
  attemptsToMaster?: number;
  /** Listens that led to mastery (listening mode) */
  listensBeforeMaster?: number;
  listenSeconds?: number;
  learnedViaAudio?: boolean;
}

export interface MemorizedJuzSelection {
  juz: number;
  strength: MemorizationStrength;
}

/**
 * One declared memorized surah (or partial surah).
 * fromAyah/toAyah optional — when set, unfinished ranges continue from toAyah+1.
 */
export interface MemorizedSurahSelection {
  surah: number;
  strength: MemorizationStrength;
  /** Inclusive start ayah within the surah (default 1) */
  fromAyah?: number;
  /** Inclusive end ayah memorized (default = full surah) */
  toAyah?: number;
}

export interface MemorizedRangeSelection {
  fromSurah: number;
  toSurah: number;
  strength: MemorizationStrength;
  fromAyah?: number;
  toAyah?: number;
}

export type MemorizationSelectionMode = "JUZ" | "SURAH" | "RANGE";

export interface MemorizationSelection {
  mode: MemorizationSelectionMode;
  juzSelections: MemorizedJuzSelection[];
  surahSelections: MemorizedSurahSelection[];
  range?: MemorizedRangeSelection;
}

export interface MutashabihEntry {
  id: string;
  type: SimilarityType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  title: string;
  description: string;
  ayahs: {
    surahNumber: number;
    surahName: string;
    ayahNumber: number;
    text: string;
    highlightWords: string[];
    contextNote: string;
  }[];
  differenceExplain: string;
  tips: string[];
  juz?: number[];
}

export type JourneyStepKind =
  | "revision"
  | "new_hifz"
  | "listening"
  | "quiz"
  | "mutashabihat"
  | "reflection"
  | "finish";

export interface DailyPlanBlock {
  id: string;
  kind: JourneyStepKind;
  titleAr: string;
  minutes: number;
  items: {
    label: string;
    surahNumber?: number;
    fromAyah?: number;
    toAyah?: number;
    reason?: string;
  }[];
  href: string;
}

/** One ordered step in the unified daily teacher journey */
export interface JourneyStep {
  id: string;
  order: number;
  kind: JourneyStepKind;
  titleAr: string;
  subtitleAr: string;
  minutes: number;
  emoji: string;
  href: string;
  /** Primary action target (for revision/new/listen) */
  surahNumber?: number;
  fromAyah?: number;
  toAyah?: number;
  reason?: string;
  /** Teacher-style coaching note */
  teacherNote?: string;
}

export interface DailyJourney {
  date: string;
  /** Legacy block views — still used by /plans/revision and /plans/new */
  revision: DailyPlanBlock;
  newMemorization: DailyPlanBlock;
  mutashabihat: DailyPlanBlock;
  listening: DailyPlanBlock;
  /** Ordered lesson plan (teacher journey) */
  steps: JourneyStep[];
  totalMinutes: number;
  /** Human summary for the student */
  coachIntro: string;
  balanceNote: string;
}
