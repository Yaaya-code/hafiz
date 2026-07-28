/**
 * Plan Generation domain contracts.
 *
 * Consumes Validated Decision + UserState + Quran geometry + optional SRS memory.
 * Produces executable plan structures. No pedagogy rules.
 */

import type { ISODate, SurahNumber, PageNumber } from "../models";
import type { UserState } from "../models";
import type { RevisionMemoryItem } from "../models/revision-memory";

/** Executable activity kinds the plan engine may emit. */
export type PlanItemType =
  | "NEW_HIFZ"
  | "NEAR_REVISION"
  | "FAR_REVISION"
  | "LISTENING"
  | "QUIZ";

/**
 * Source geometry for a plan item.
 */
export interface PlanItemSourceRange {
  surah?: SurahNumber;
  fromAyah?: number;
  toAyah?: number;
  fromSurah?: SurahNumber;
  toSurah?: SurahNumber;
  startPage?: PageNumber;
  endPage?: PageNumber;
  /** Approximate mushaf pages for this item */
  pagesApprox?: number;
}

/**
 * One discrete unit of work in a day plan.
 */
export interface PlanItem {
  id: string;
  type: PlanItemType;
  /** Content range when known */
  sourceRange?: PlanItemSourceRange;
  /** Primary surah hint when known */
  surah?: SurahNumber;
  /** Mushaf page hint when known */
  page?: PageNumber;
  /** Estimated duration for this item */
  estimatedMinutes: number;
  /** Optional Arabic label for later UI (no UI logic) */
  labelAr?: string;
  /** Link back to RevisionMemoryItem.id when from SRS */
  revisionMemoryId?: string;
  /** SRS priority score when from ranking */
  priorityScore?: number;
  /** SRS ranking reasons when available */
  priorityReasons?: readonly string[];
}

/**
 * One calendar/horizon day of planned work.
 */
export interface PlanDay {
  /** 1-based day index within the generated horizon */
  dayNumber: number;
  /** Optional calendar date YYYY-MM-DD */
  date?: ISODate;
  items: PlanItem[];
  /** Sum of item estimatedMinutes */
  totalMinutes: number;
}

/**
 * Full plan generation output.
 */
export interface GeneratedPlan {
  days: PlanDay[];
  startingState: UserState;
  endingState: UserState;
  /**
   * Snapshot of revision memory after scheduling near items for new hifz
   * (cloned; input revisionMemory is never mutated).
   */
  endingRevisionMemory: readonly RevisionMemoryItem[];
  meta: GeneratedPlanMeta;
}

export interface GeneratedPlanMeta {
  asOfDate?: ISODate;
  decisionValid: boolean;
  newHifzEnabled: boolean;
  revisionOnly: boolean;
  horizonDays: number;
  /** Whether SRS ranking was used for far revision */
  srsEnabled: boolean;
  /** Human-readable generator notes */
  notes: readonly string[];
  /**
   * Sequential revision cursor after the last generated day.
   * Application may persist this so day-to-day review continues (not restarts).
   */
  endingRevisionSeq?: { rangeIdx: number; ayah: number };
  /** Cursor used at the start of day 1 (stable same-day replan) */
  startingRevisionSeq?: { rangeIdx: number; ayah: number };
}

/**
 * Options for the pure multi-day plan generator.
 */
export interface GeneratePlanOptions {
  /**
   * How many day shells to create.
   * 0 → empty plan (valid container with days: []).
   * Default: 1.
   */
  horizonDays?: number;
  /** Calendar start for day 1 (YYYY-MM-DD). Optional. */
  startDate?: ISODate;
  /** Opaque run id for deterministic item ids when provided */
  runId?: string;
  /**
   * Quran geometry for chunking.
   * Defaults to metadata geometry when omitted.
   */
  geometry?: import("./quran/types").QuranGeometry;
  /**
   * Optional SRS revision memory bank.
   * When omitted, farQueue/nearStack from UserState are mapped into ephemeral memory.
   * Never mutated — generator clones internally.
   */
  revisionMemory?: readonly RevisionMemoryItem[];
  /** Max far-revision items per day (default 3, or more when revision-only) */
  maxFarItemsPerDay?: number;
  /**
   * Adaptive load scales from application layer (session performance).
   * Does not change Decision eligibility for NEW_HIFZ.
   */
  loadScale?: {
    revisionScale?: number;
    hifzScale?: number;
  };
  /**
   * Resume sequential revision stream (finish surah before next).
   * When omitted, packer starts at primary stabilize surah.
   */
  initialRevisionSeq?: { rangeIdx: number; ayah: number };
  /**
   * N Madani faces for sequential revision (profile.revisionPagesPerDay).
   * Default 3 when omitted.
   */
  revisionPages?: number;
}
