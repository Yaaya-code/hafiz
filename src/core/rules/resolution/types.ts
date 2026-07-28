/**
 * Decision Engine — resolved output of many RuleResults.
 * No planning / scheduling — only deterministic merge of rule outputs.
 */

import type { RuleResult, RuleSeverity } from "../../models";
import type { RulePriority } from "../metadata";

/** Track chosen by scenario rules (meta.track). */
export type DecisionTrack =
  | "bottom_up"
  | "continue_from_last_surah"
  | "fragmented_revision_only"
  | "unspecified";

/**
 * Soft capacity delta suggested by progression rules (never a hard ceiling).
 */
export interface SuggestedCapacityChange {
  pagesDelta: number | null;
  minutesDelta: number | null;
  reason: string | null;
}

/**
 * Single final decision after resolving all applied rules.
 */
export interface Decision {
  track: DecisionTrack;
  newHifzEnabled: boolean;
  revisionOnly: boolean;
  /** Minute ceiling for later activity budgets (Revision+Hifz+Listening+Quiz) */
  dailyCapacity: {
    minutes: number | null;
    pages: number | null;
  };
  /** Boost flags from hard scenario locks */
  additionalListeningPractice: boolean;
  additionalMistakeReview: boolean;
  /** Revision schedule allowed (S-002 sets false until first hifz) */
  revisionScheduleEnabled: boolean;
  /**
   * Progression layer (P-001…P-004).
   * allowNewHifz mirrors readiness after hard locks are applied.
   */
  allowNewHifz: boolean;
  /** P-004 / hard regression — progression blocked */
  lockProgression: boolean;
  /** P-003 — content needs strengthening before advancing */
  strengtheningRequired: boolean;
  strengtheningArea: string | null;
  /** P-002 soft suggestion only */
  suggestedCapacityChange: SuggestedCapacityChange | null;
  /**
   * Revision structure layer (R-001…R-004).
   * Soft priority / load recommendations + hard recovery/stability gates.
   */
  revisionPriority: boolean;
  recommendedRevision: {
    pages: number | null;
    minutes: number | null;
  } | null;
  recoveryRequired: boolean;
  recoveryScope: string | null;
  /** false only when R-004 (or equivalent) hard-fails the gate */
  stabilityGatePassed: boolean;
  /** Bible / rule ids that applied and contributed */
  appliedRules: readonly string[];
  /**
   * Explicit human-readable resolution trail (legacy + normalized).
   * Each entry may include optional `effect` for hard locks.
   */
  reasons: readonly DecisionReason[];
  /**
   * Normalized hard-lock / field-impact trail (explainability standard).
   * Example: { rule: "R-003", reason: "…", effect: "newHifzEnabled=false" }
   */
  effects: readonly DecisionEffect[];
  /** Explicit conflict records from merge (may be empty) */
  conflicts: readonly ConflictRecord[];
  /** Soft advisories (validator + builder); never blocks alone */
  warnings: readonly string[];
  /** Optional numeric track endpoints from meta */
  trackMeta: {
    startSurah?: number;
    endSurah?: number;
    lastMemorizedSurah?: number;
    /**
     * Observability only: highest declared memorized surah number.
     * NOT a position for NEW_HIFZ — use application HifzCursor / state pointer.
     */
    continueAfterSurah?: number;
    /**
     * Executive: Generator must continue from UserState.hifz.currentPointer
     * and must not recompute position from continueAfterSurah.
     */
    continuationMode?: "from_cursor" | string;
    /** @deprecated position overrides — prefer application HifzCursor */
    forcePointerSurah?: number;
    forcePointerAyah?: number;
    preferCompleteNearby?: boolean;
  };
}

export interface DecisionReason {
  code: string;
  ruleId: string;
  message: string;
  severity: RuleSeverity;
  /** Affected field assignment when known, e.g. "newHifzEnabled=false" */
  effect?: string;
}

/**
 * Normalized explainability entry for hard locks and material field changes.
 */
export interface DecisionEffect {
  /** Rule id that caused the effect */
  rule: string;
  /** Human-readable reason */
  reason: string;
  /** Affected field / assignment, e.g. "newHifzEnabled=false" */
  effect: string;
  severity: RuleSeverity;
}

/** Rule result plus registry priority for sort order. */
export interface RankedRuleResult {
  result: RuleResult;
  priority: RulePriority;
  /** From metadata when known; default 500 */
  categoryRank: number;
}

export type ConflictKind =
  | "new_hifz_enabled"
  | "daily_minute_capacity"
  | "daily_page_capacity"
  | "track"
  | "revision_only"
  | "revision_schedule";

export interface ConflictRecord {
  kind: ConflictKind;
  winnerRuleId: string;
  loserRuleId: string;
  winnerValue: string | number | boolean | null;
  loserValue: string | number | boolean | null;
  reason: string;
}
