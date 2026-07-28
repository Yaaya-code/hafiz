/**
 * IPlanningRule — pure, deterministic, side-effect free.
 */

import type { RuleResult } from "../models";
import type { RuleMetadata } from "./metadata";
import type { RuleContext } from "./context";

/**
 * Contract every planning rule must satisfy.
 *
 * - evaluate() must be deterministic for a given RuleContext
 * - evaluate() must not mutate profile, state, planning, or UI
 * - evaluate() must not perform I/O
 * - return applied:false when prerequisites for *firing* are unmet
 *   (registration prerequisites are validated by the executor separately)
 */
export interface IPlanningRule {
  readonly metadata: RuleMetadata;

  /**
   * Evaluate this rule against the context.
   * Always return a RuleResult (never throw for business non-match).
   * May throw only on programmer error (invalid internal state).
   */
  evaluate(ctx: RuleContext): RuleResult;
}

/** Convenience accessors matching Phase 1 naming. */
export function ruleId(rule: IPlanningRule): string {
  return rule.metadata.id;
}

export function ruleName(rule: IPlanningRule): string {
  return rule.metadata.name;
}

export function ruleDescription(rule: IPlanningRule): string {
  return rule.metadata.description;
}

export function rulePrerequisites(rule: IPlanningRule): readonly string[] {
  return rule.metadata.prerequisites;
}
