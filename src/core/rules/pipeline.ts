/**
 * RulePipeline — ordered, filterable sequence of rules from a registry.
 */

import type { IPlanningRule } from "./rule";
import type { RuleRegistry } from "./registry";
import type { RuleCategory } from "./metadata";

export interface RulePipelineOptions {
  /** Only enabled rules (default true) */
  enabledOnly?: boolean;
  /** Restrict to these categories (optional) */
  categories?: readonly RuleCategory[];
  /** Explicit allow-list of rule ids (optional) */
  onlyRuleIds?: readonly string[];
  /** Explicit deny-list */
  excludeRuleIds?: readonly string[];
}

/**
 * Immutable snapshot of rules in execution order.
 */
export class RulePipeline {
  private constructor(
    private readonly orderedRules: readonly IPlanningRule[],
    readonly options: Readonly<RulePipelineOptions>
  ) {}

  get rules(): readonly IPlanningRule[] {
    return this.orderedRules;
  }

  get length(): number {
    return this.orderedRules.length;
  }

  /**
   * Build a pipeline from a registry using priority + dependency order.
   */
  static fromRegistry(
    registry: RuleRegistry,
    options: RulePipelineOptions = {}
  ): RulePipeline {
    const enabledOnly = options.enabledOnly ?? true;
    let ordered = registry.getExecutionOrder({ enabledOnly });

    if (options.categories?.length) {
      const set = new Set(options.categories);
      ordered = ordered.filter((r) => set.has(r.metadata.category));
    }
    if (options.onlyRuleIds?.length) {
      const set = new Set(options.onlyRuleIds);
      ordered = ordered.filter((r) => set.has(r.metadata.id));
    }
    if (options.excludeRuleIds?.length) {
      const set = new Set(options.excludeRuleIds);
      ordered = ordered.filter((r) => !set.has(r.metadata.id));
    }

    return new RulePipeline(Object.freeze([...ordered]), Object.freeze({ ...options }));
  }

  /** Empty pipeline (useful for tests). */
  static empty(): RulePipeline {
    return new RulePipeline(Object.freeze([]), Object.freeze({}));
  }

  /** Explicit order (caller is responsible for dependency correctness). */
  static fromRules(
    rules: readonly IPlanningRule[],
    options: RulePipelineOptions = {}
  ): RulePipeline {
    return new RulePipeline(Object.freeze([...rules]), Object.freeze({ ...options }));
  }

  ids(): readonly string[] {
    return this.orderedRules.map((r) => r.metadata.id);
  }
}
