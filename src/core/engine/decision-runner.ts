/**
 * Decision Runner — pure entry to Logic Bible v1 pipeline.
 *
 * PlanningContext
 *   → register S/P/R rules
 *   → execute pipeline
 *   → resolve Decision
 *   → validate (report-only)
 *   → ValidatedDecisionResult
 *
 * Never queries DB, localStorage, or UI.
 */

import type { PlanningContext } from "../models/planning-context";
import type { PlanningState } from "../models";
import type { Decision, DecisionValidationResult } from "../rules";
import type { ConflictRecord } from "../rules";
import {
  buildDecision,
  createRuleExecutor,
  createRuleRegistry,
  registerLogicBibleRules,
  RulePipeline,
  validateDecision,
} from "../rules";

export interface DecisionRunnerOptions {
  /**
   * Optional explicit planning snapshot override.
   * Defaults to context.state.planning.
   */
  planning?: PlanningState;
}

export interface ValidatedDecisionResult {
  decision: Decision;
  validation: DecisionValidationResult;
  conflicts: readonly ConflictRecord[];
  rankedOrder: readonly string[];
  /** Rule ids that applied (from decision) */
  appliedRules: readonly string[];
  /** asOfDate used as YYYY-MM-DD */
  asOfDate: string;
}

function toIsoDate(d: Date): string {
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Run the full Logic Bible decision pipeline on a PlanningContext.
 */
export function runDecisionPipeline(
  context: PlanningContext,
  options: DecisionRunnerOptions = {}
): ValidatedDecisionResult {
  const asOfDate = toIsoDate(context.asOfDate);
  const planning = options.planning ?? context.state.planning;

  const registry = createRuleRegistry();
  registerLogicBibleRules(registry);

  const pipeline = RulePipeline.fromRegistry(registry);
  const executor = createRuleExecutor(registry);

  const output = executor.execute(pipeline, {
    profile: context.profile,
    state: context.state,
    planning,
    asOfDate,
  });

  const built = buildDecision(output.results, {
    priorityOf: (id) => registry.getMetadata(id)?.priority ?? 500,
    categoryOf: (id) => registry.getMetadata(id)?.category,
    fallbackDailyMinutes: context.profile.dailyMinutes,
    fallbackDailyPages: context.profile.pagesPerDay,
  });

  // Re-validate for an explicit report (builder already validated; keep pure)
  const validation = validateDecision(built.decision);

  return {
    decision: built.decision,
    validation,
    conflicts: built.conflicts,
    rankedOrder: built.rankedOrder,
    appliedRules: built.decision.appliedRules,
    asOfDate,
  };
}

/**
 * Factory for tests / DI-style usage (stateless).
 */
export function createDecisionRunner() {
  return {
    run: (context: PlanningContext, options?: DecisionRunnerOptions) =>
      runDecisionPipeline(context, options),
  };
}
