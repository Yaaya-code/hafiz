/**
 * Application-layer types for planning orchestration.
 * UI and hooks should depend on these, not on core internals.
 */

import type {
  Decision,
  DecisionValidationResult,
  ConflictRecord,
  GeneratedPlan,
  PlanDay,
  PlanItem,
  UserState,
  RevisionMemoryItem,
  ValidatedDecisionResult,
  ArchitectureState,
  ComposedDailyJourney,
  PathResolution,
} from "@/core";

/** ISO calendar date YYYY-MM-DD */
export type AppDate = string;

/**
 * Learning snapshot persisted by the application layer (local-first).
 * Not a core type — orchestration ownership.
 */
/**
 * Fingerprint of inputs that invalidate planCache when they change.
 * Built by PlanningService — UI should not invent fingerprints.
 */
export interface PlanCacheMeta {
  /** asOfDate the fingerprint was built for */
  asOfDate: string;
  /** Hash of profile + revision memory + durable userState identity */
  fingerprint: string;
}

/**
 * Adaptive load advice (plan input only — not mastery).
 */
export interface LoadAdjustmentSnapshot {
  direction: "increase" | "maintain" | "decrease";
  reason: string;
  confidence: number;
  revisionScale: number;
  hifzScale: number;
  computedAt: string;
}

/**
 * Non-authoritative forecast tip for UI (never written into cursor/mastery).
 */
export interface ForecastHint {
  asOfDate: string;
  /** Human label e.g. "لو استمريت: البقرة 150 خلال أسبوع" */
  summaryAr: string;
  /** Forecast endpoint of NEW_HIFZ after N days of plan simulation */
  projectedPointer?: { surah: number; ayah: number };
}

/**
 * Provenance for Actual learning state (Phase 3 sync integrity).
 * Prevents forecast / plan_seed from overwriting session progress.
 */
export type LearningStateSource =
  | "session_completed"
  | "review_outcome"
  | "sync_merge"
  | "plan_seed"
  | "bootstrap"
  | "unknown";

export interface LearningStateMeta {
  /** Envelope meta version (Phase 3 = 2) */
  version: number;
  updatedAt: string;
  source: LearningStateSource;
}

/**
 * Learning snapshot — Actual mastery + plan cache.
 *
 * ActualState: userState (cursor, sessions) + revisionMemory (SRS bank)
 * PlanState: planCache only
 * Forecast: lastForecastHint only (never confusable with Actual)
 */
export interface LearningSnapshot {
  version: 1;
  updatedAt: string;
  /**
   * Actual mastery state (cursor, sessions, queues).
   * Updated by session completion — not by generatePlan forecast.
   */
  userState: UserState | null;
  /**
   * Actual SRS memory bank (initialized once; updated by reviews/sessions).
   * generatePlan must not replace this with endingRevisionMemory.
   */
  revisionMemory: RevisionMemoryItem[];
  /**
   * Cached plans keyed by startDate + horizonDays
   * e.g. "2026-07-23:1" or "2026-07-23:7"
   * PlanState only — display / daily allocation.
   */
  planCache: Record<string, GeneratedPlan>;
  /** Last decision snapshot for cache hits / UI coaching later */
  lastDecision?: {
    asOfDate: string;
    appliedRules: readonly string[];
    validation: DecisionValidationResult;
    decision: Decision;
  };
  /**
   * Cache validity meta. When fingerprint ≠ current inputs, cache is stale.
   */
  cacheMeta?: PlanCacheMeta;
  /** Last adaptive load adjustment (planner input) */
  loadAdjustment?: LoadAdjustmentSnapshot;
  /** Forecast tip — never used as ActualState */
  lastForecastHint?: ForecastHint;
  /**
   * Who last wrote Actual state (session vs plan vs sync).
   * Used by cloud merge to reject stale forecast overwrites.
   */
  learningStateMeta?: LearningStateMeta;
  /**
   * P0–P8 architecture envelope (intent, map, evidence, adaptation).
   * Optional for backward compatibility with older local snapshots.
   */
  architecture?: ArchitectureState;
  /** Last composed daily journey (presentation; not Actual) */
  lastDailyJourney?: ComposedDailyJourney;
  /** Last path resolution (plan input; not Actual) */
  lastPathResolution?: PathResolution;
  /**
   * Sequential revision stream position (finish surah before next).
   * Same-day replan freezes startOfDay; next calendar day uses cursor.
   */
  revisionSeq?: {
    planDate?: string;
    startOfDay?: { rangeIdx: number; ayah: number };
    /** Next start after last assigned day (for tomorrow) */
    cursor?: { rangeIdx: number; ayah: number };
  };
}

/** Options for journey / multi-day generation */
export interface GenerateJourneyOptions {
  days: number;
  asOfDate?: AppDate | Date;
  /** Force recompute even if cache hit */
  force?: boolean;
  runId?: string;
}

export interface GetTodayPlanOptions {
  asOfDate?: AppDate | Date;
  force?: boolean;
}

/**
 * Result returned to UI consumers.
 */
export interface TodayPlanResult {
  asOfDate: AppDate;
  plan: GeneratedPlan;
  /** Convenience: first day of the plan */
  today: PlanDay | null;
  decision: Decision;
  validation: DecisionValidationResult;
  appliedRules: readonly string[];
  fromCache: boolean;
}

export interface JourneyPlanResult {
  asOfDate: AppDate;
  horizonDays: number;
  plan: GeneratedPlan;
  decision: Decision;
  validation: DecisionValidationResult;
  appliedRules: readonly string[];
  fromCache: boolean;
}

export interface RefreshLearningStateResult {
  snapshot: LearningSnapshot;
  today: TodayPlanResult;
}

/**
 * Progress events for commitDayProgress (skeleton-friendly).
 * Full outcome wiring can deepen later without changing the door.
 */
export type DayProgressEvent =
  | {
      type: "plan_item_completed";
      planItemId: string;
      outcome: "success" | "fail" | "partial" | "skipped";
      revisionMemoryId?: string;
      date?: AppDate;
    }
  | {
      type: "review_outcome";
      revisionMemoryId: string;
      outcome: "success" | "fail";
      date?: AppDate;
    }
  | {
      type: "invalidate_plan_cache";
    };

export interface CommitDayProgressResult {
  snapshot: LearningSnapshot;
  /** True when cache was cleared and a replan is recommended */
  replanRecommended: boolean;
}

/** Re-export useful plan shapes for UI without importing @/core paths */
export type {
  GeneratedPlan,
  PlanDay,
  PlanItem,
  Decision,
  DecisionValidationResult,
  ConflictRecord,
  UserState,
  RevisionMemoryItem,
  ValidatedDecisionResult,
};
