/**
 * Backward-compatible re-exports for Phase 1 import paths.
 * Prefer importing from `@/core/rules` directly.
 */

export type { RuleContext } from "./context";
export type { IPlanningRule } from "./rule";
export type { RulePipeline as IRulePipelineClass } from "./pipeline";

/**
 * Legacy pipeline interface — RulePipeline class is the implementation.
 * @deprecated Prefer RulePipeline.fromRegistry(...)
 */
export interface IRulePipeline {
  readonly rules: readonly import("./rule").IPlanningRule[];
  /** @deprecated Use RuleExecutor.execute(pipeline, ctx) */
  run?(ctx: import("./context").RuleContext): import("../models").RuleResult[];
}
