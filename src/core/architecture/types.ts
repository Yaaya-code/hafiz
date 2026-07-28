/**
 * Hafiz Architecture Baseline domain types (P0–P8).
 * Source of truth contracts — application/planning consume these.
 */

/** P0 — How the user uses Hafiz */
export type UserIntentMode =
  | "EXTERNAL_TEACHER"
  | "SYSTEM_GUIDED"
  | "FROM_SCRATCH";

/**
 * When the map is ambiguous (middle-only / multiple paths),
 * user may choose a long-term direction once.
 */
export type PathPreference =
  | "mushaf_start" // from Al-Baqarah / beginning continuum
  | "mushaf_end" // from Juz ʿAmma upward
  | "continue_frontier" // after furthest already-memorized early material
  | "unset";

export type UserIntent = {
  mode: UserIntentMode;
  /** Optional free-text / product goal id later */
  goalHint?: string;
  /** Long-term path when system cannot decide alone */
  pathPreference?: PathPreference;
  updatedAt?: string;
};

/** How the memorization map is shaped (for path intelligence) */
export type JourneyShape =
  | "empty"
  | "early_forward" // progress mainly from start of mushaf
  | "amma_bottom" // mainly Juz ʿAmma
  | "mixed_early_amma" // both early continuum and Amma
  | "middle_only"; // mid surahs without clear start/end journey

/** P0 — Structural memorization region (no user-written strength at intake) */
export type MemorizationSource =
  | "DECLARED"
  | "SESSION"
  | "TEACHER"
  | "VERIFIED";

/** P5 — System-owned strength */
export type SystemStrength =
  | "UNKNOWN"
  | "WEAK"
  | "NEEDS_REVIEW"
  | "GOOD"
  | "STRONG";

export type MemorizationRegion = {
  surahId: number;
  fromAyah: number;
  toAyah: number;
  source: MemorizationSource;
  /** System-evaluated only; UNKNOWN until evidence */
  strength: SystemStrength;
  /** Internal confidence 0–1 (never shown as user identity) */
  strengthConfidence?: number;
  updatedAt?: string;
};

export type MemorizationMap = {
  regions: MemorizationRegion[];
  version: 1;
  updatedAt: string;
};

/** Architecture-layer pointer (avoids clash with planning QuranPointer) */
export type AyahPointer = {
  surahId: number;
  ayah: number;
};

export type DerivedMemorizationState = {
  gaps: Array<{ surahId: number; fromAyah: number; toAyah: number }>;
  contiguousBlocks: Array<{
    fromSurah: number;
    toSurah: number;
    surahs: number[];
  }>;
  incompletePartials: Array<{
    surahId: number;
    fromAyah: number;
    toAyah: number;
    continueAt: number;
  }>;
  fragmented: boolean;
  journeyShape: JourneyShape;
  suggestedContinuePointer: AyahPointer | null;
  primaryPathCandidate: AyahPointer | null;
  ambiguity: boolean;
  /** When ambiguity: choices to show the user (start / end / frontier) */
  pathChoices?: Array<{
    preference: PathPreference;
    pointer: AyahPointer;
    labelAr: string;
  }>;
  pathReasonAr: string;
};

/** P0 — Teacher assignment owns NEW_HIFZ in EXTERNAL_TEACHER */
export type ExternalAssignment = {
  id: string;
  surahId: number;
  fromAyah: number;
  toAyah?: number;
  /** Optional page-based span (Madinah pages) */
  capacityPages?: number;
  teacherLabel?: string;
  note?: string;
  active: boolean;
  updatedAt: string;
};

/** P1 — Capacity in Mushaf pages only */
export type UserCapacity = {
  newHifzPages: number;
  revisionPages: number;
};

/** P1 — Measurement I/O */
export type MeasurementInput = {
  startPointer: AyahPointer;
  capacityPages: number;
  direction: "forward" | "backward";
};

export type MeasurementResult = {
  startPointer: AyahPointer;
  endPointer: AyahPointer;
  startPage: number;
  endPage: number;
  pagesActual: number;
  labelAr?: string;
};

/** P4 — Session / evidence */
export type SessionType =
  | "LISTENING"
  | "NEW_HIFZ"
  | "TASMI"
  | "REVISION"
  | "QUIZ"
  | "MISTAKE_REVIEW"
  | "REFLECTION";

export type EvidenceKind =
  | "tasmee_success"
  | "tasmee_fail"
  | "revision_success"
  | "revision_fail"
  | "mistake"
  | "listening_complete"
  | "quiz_result"
  | "teacher_feedback"
  | "recovery"
  | "partial_complete"
  | "session_complete";

export type EvidenceRecord = {
  id: string;
  kind: EvidenceKind;
  sessionType?: SessionType;
  surahId?: number;
  fromAyah?: number;
  toAyah?: number;
  /** Optional free payload */
  meta?: Record<string, unknown>;
  createdAt: string;
  /** Outcome quality 0–5 when relevant */
  quality?: number;
};

/** P7 — Error relationship */
export type ErrorCategory =
  | "recall_failure"
  | "similarity_confusion"
  | "sequence_confusion"
  | "ending_confusion"
  | "transition_confusion";

export type ConfusionRelationship = {
  id: string;
  category: ErrorCategory;
  locationA: { surahId: number; ayah: number };
  locationB?: { surahId: number; ayah: number };
  occurrences: number;
  lastSeenAt: string;
  reasonAr?: string;
};

/** P6 — Path resolution output (does not write Actual) */
export type PathResolution = {
  mode: UserIntentMode;
  newHifzPointer: AyahPointer | null;
  source:
    | "external_assignment"
    | "incomplete_partial"
    | "gap_fill"
    | "long_term_build"
    | "from_scratch_default"
    | "cursor_continue"
    | "ambiguous";
  reasonAr: string;
  ambiguousAlternatives?: AyahPointer[];
  externalAssignmentId?: string;
};

/** P3 — Daily journey composition */
export type DailyJourneyReason =
  | "stabilize"
  | "neighborhood"
  | "corpus"
  | "new_hifz"
  | "listening"
  | "testing"
  | "reflection"
  | "mutashabih_support"
  | "external_assignment";

export type DailyJourneyStep = {
  id: string;
  order: number;
  kind:
    | "prepare"
    | "listening"
    | "new_hifz"
    | "tasmee"
    | "revision"
    | "check"
    | "reflection"
    | "quiz";
  titleAr: string;
  subtitleAr?: string;
  reason?: DailyJourneyReason;
  reasonAr?: string;
  surahId?: number;
  fromAyah?: number;
  toAyah?: number;
  pagesApprox?: number;
  estimatedMinutes?: number;
  planItemId?: string;
};

export type ComposedDailyJourney = {
  date: string;
  steps: DailyJourneyStep[];
  newHifz: MeasurementResult | null;
  revisionSummaryAr: string;
  path: PathResolution;
  capacity: UserCapacity;
  notes: string[];
};

/** P8 — Adaptation (presentation only; no ownership breach) */
export type AdaptationProfile = {
  sessionStyle: "listen_first" | "read_first" | "balanced";
  revisionExposure: "light" | "normal" | "intensive";
  difficultyBalance: "ease" | "maintain" | "challenge";
  reasonAr: string;
  updatedAt: string;
};

/** Persisted architecture envelope (LearningSnapshot extension) */
export type ArchitectureState = {
  version: 1;
  intent: UserIntent;
  memorizationMap: MemorizationMap;
  externalAssignments: ExternalAssignment[];
  capacity: UserCapacity;
  evidence: EvidenceRecord[];
  confusion: ConfusionRelationship[];
  adaptation: AdaptationProfile;
  lastPath?: PathResolution;
  lastJourney?: ComposedDailyJourney;
};
