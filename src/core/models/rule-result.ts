/**
 * Output of a single planning rule evaluation.
 * Rules compose; the engine merges RuleResults into PlanningState / plans.
 */

import type { QuranSlice } from "./primitives";
import type { PlanSlot } from "./todays-plan";

export type RuleSeverity = "info" | "soft" | "hard";

/**
 * One discrete decision from a rule.
 * Later phases implement rules that return these — no rule logic yet.
 */
export interface RuleResult {
  /** Stable rule identifier, e.g. "foundation-builder", "weekly-anchor" */
  ruleId: string;

  /** Did this rule apply for the current inputs? */
  applied: boolean;

  severity: RuleSeverity;

  /** Human-readable explanation (Arabic) for coaching / debug */
  messageAr?: string;

  /** Optional capacity overrides suggested by the rule */
  overrides?: {
    newHifzEnabled?: boolean;
    dailyPageCapacity?: number;
    dailyMinuteCapacity?: number;
  };

  /** Optional slices this rule wants to inject into the day */
  suggestedSlots?: PlanSlot[];

  /** Optional slices to enqueue for future revision */
  enqueueRevision?: QuranSlice[];

  /** Opaque payload for engine-internal composition */
  meta?: Record<string, string | number | boolean>;
}
