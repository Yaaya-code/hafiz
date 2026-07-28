/**
 * Rule evaluation context — pure data bag.
 * Rules receive this; they never fetch from UI or network.
 */

import type {
  PlanningState,
  UserProfile,
  UserState,
} from "../models";
import type { Decision } from "./resolution/types";

/**
 * Full context available to every rule evaluation.
 */
export interface RuleContext {
  readonly profile: UserProfile;
  readonly state: UserState;
  readonly planning: PlanningState;

  /** Calendar day under consideration (YYYY-MM-DD) */
  readonly asOfDate: string;

  /** 1-based day index within a multi-day horizon, when applicable */
  readonly dayIndex?: number;

  /** Total days in the current horizon (7 / 30 / …) */
  readonly horizonLength?: number;

  /**
   * Results of rules that already ran in this pipeline pass,
   * keyed by rule id (includes non-applied results).
   */
  readonly priorResults: ReadonlyMap<string, import("../models").RuleResult>;

  /**
   * Optional resolved Decision from a prior resolution pass.
   * Progression rules may read this; scenario rules usually leave it unset
   * and rely on priorResults instead.
   */
  readonly decision?: Decision;

  /**
   * Opaque bag for pipeline-scoped scratch data.
   * Rules may read; writers should be the executor only in later phases.
   * Phase 2: frozen empty map unless provided by the caller.
   */
  readonly scratch: Readonly<Record<string, string | number | boolean>>;
}

export type RuleContextInput = {
  profile: UserProfile;
  state: UserState;
  planning: PlanningState;
  asOfDate: string;
  dayIndex?: number;
  horizonLength?: number;
  priorResults?: ReadonlyMap<string, import("../models").RuleResult>;
  decision?: Decision;
  scratch?: Readonly<Record<string, string | number | boolean>>;
};

/** Build an immutable RuleContext from loose inputs. */
export function createRuleContext(input: RuleContextInput): RuleContext {
  return {
    profile: input.profile,
    state: input.state,
    planning: input.planning,
    asOfDate: input.asOfDate,
    dayIndex: input.dayIndex,
    horizonLength: input.horizonLength,
    priorResults: input.priorResults ?? new Map(),
    decision: input.decision,
    scratch: input.scratch ?? Object.freeze({}),
  };
}

/**
 * Derive a child context with updated priorResults after a rule finishes.
 * Does not mutate the parent.
 */
export function withPriorResult(
  ctx: RuleContext,
  ruleId: string,
  result: import("../models").RuleResult
): RuleContext {
  const next = new Map(ctx.priorResults);
  next.set(ruleId, result);
  return {
    ...ctx,
    priorResults: next,
  };
}
