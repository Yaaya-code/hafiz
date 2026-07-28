/**
 * RuleRegistry — register, enable/disable, lookup, dependency graph checks.
 * Pure in-memory; no persistence, no Quran rules.
 */

import type { IPlanningRule } from "./rule";
import type { RuleCategory, RuleMetadata } from "./metadata";

export class RuleRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleRegistrationError";
  }
}

export interface RegisteredRule {
  rule: IPlanningRule;
  enabled: boolean;
  registeredAt: string;
}

/**
 * Central catalog of planning rules.
 * The pipeline reads an ordered, enabled subset from here.
 */
export class RuleRegistry {
  private readonly entries = new Map<string, RegisteredRule>();

  /** Register a rule. Throws if id already exists. */
  register(rule: IPlanningRule, opts?: { enabled?: boolean }): void {
    const id = rule.metadata.id;
    if (!id || typeof id !== "string") {
      throw new RuleRegistrationError("Rule metadata.id is required");
    }
    if (this.entries.has(id)) {
      throw new RuleRegistrationError(
        `Rule already registered: ${id}. Unregister first or use replace().`
      );
    }
    this.assertMetadata(rule.metadata);
    this.entries.set(id, {
      rule,
      enabled:
        opts?.enabled ?? rule.metadata.enabledByDefault ?? true,
      registeredAt: new Date().toISOString(),
    });
  }

  /** Register or replace by id. */
  replace(rule: IPlanningRule, opts?: { enabled?: boolean }): void {
    const existing = this.entries.get(rule.metadata.id);
    this.entries.delete(rule.metadata.id);
    try {
      this.register(rule, {
        enabled: opts?.enabled ?? existing?.enabled ?? rule.metadata.enabledByDefault,
      });
    } catch (e) {
      if (existing) this.entries.set(rule.metadata.id, existing);
      throw e;
    }
  }

  unregister(ruleId: string): boolean {
    return this.entries.delete(ruleId);
  }

  clear(): void {
    this.entries.clear();
  }

  has(ruleId: string): boolean {
    return this.entries.has(ruleId);
  }

  get(ruleId: string): IPlanningRule | undefined {
    return this.entries.get(ruleId)?.rule;
  }

  getMetadata(ruleId: string): RuleMetadata | undefined {
    return this.entries.get(ruleId)?.rule.metadata;
  }

  isEnabled(ruleId: string): boolean {
    return this.entries.get(ruleId)?.enabled === true;
  }

  enable(ruleId: string): void {
    const e = this.entries.get(ruleId);
    if (!e) {
      throw new RuleRegistrationError(`Cannot enable unknown rule: ${ruleId}`);
    }
    e.enabled = true;
  }

  disable(ruleId: string): void {
    const e = this.entries.get(ruleId);
    if (!e) {
      throw new RuleRegistrationError(`Cannot disable unknown rule: ${ruleId}`);
    }
    e.enabled = false;
  }

  setEnabled(ruleId: string, enabled: boolean): void {
    if (enabled) this.enable(ruleId);
    else this.disable(ruleId);
  }

  /** All registered rules (enabled and disabled). */
  listAll(): readonly RegisteredRule[] {
    return [...this.entries.values()];
  }

  /** Enabled rules only. */
  listEnabled(): readonly IPlanningRule[] {
    return [...this.entries.values()]
      .filter((e) => e.enabled)
      .map((e) => e.rule);
  }

  listByCategory(category: RuleCategory): readonly IPlanningRule[] {
    return [...this.entries.values()]
      .filter((e) => e.rule.metadata.category === category)
      .map((e) => e.rule);
  }

  /**
   * Validate that every prerequisite id exists in the registry.
   * Does not require prerequisites to be enabled (executor handles that).
   */
  validateDependencies(
    ruleIds?: readonly string[]
  ): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const ids =
      ruleIds ??
      [...this.entries.keys()];

    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) {
        errors.push(`Unknown rule in validation set: ${id}`);
        continue;
      }
      for (const pre of entry.rule.metadata.prerequisites) {
        if (!this.entries.has(pre)) {
          errors.push(
            `Rule "${id}" requires unregistered prerequisite "${pre}"`
          );
        }
      }
    }

    // Cycle detection among registered rules
    const cycle = this.detectDependencyCycles();
    if (cycle) {
      errors.push(`Dependency cycle detected: ${cycle.join(" → ")}`);
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Topological + priority order for execution.
   * Prerequisites always before dependents; ties broken by priority then id.
   */
  getExecutionOrder(opts?: {
    enabledOnly?: boolean;
  }): IPlanningRule[] {
    const enabledOnly = opts?.enabledOnly ?? true;
    const rules = enabledOnly
      ? this.listEnabled()
      : this.listAll().map((e) => e.rule);

    const idSet = new Set(rules.map((r) => r.metadata.id));
    const byId = new Map(rules.map((r) => [r.metadata.id, r]));

    // Kahn topological sort with priority heap simulation
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const r of rules) {
      indegree.set(r.metadata.id, 0);
      dependents.set(r.metadata.id, []);
    }

    for (const r of rules) {
      for (const pre of r.metadata.prerequisites) {
        if (!idSet.has(pre)) {
          // Missing prereq: treat as external; do not block order of registered set
          continue;
        }
        indegree.set(r.metadata.id, (indegree.get(r.metadata.id) || 0) + 1);
        dependents.get(pre)!.push(r.metadata.id);
      }
    }

    const ready = rules
      .filter((r) => (indegree.get(r.metadata.id) || 0) === 0)
      .sort(compareRules);

    const ordered: IPlanningRule[] = [];
    const queue = [...ready];

    while (queue.length > 0) {
      queue.sort(compareRules);
      const next = queue.shift()!;
      ordered.push(next);
      for (const dep of dependents.get(next.metadata.id) || []) {
        const d = (indegree.get(dep) || 0) - 1;
        indegree.set(dep, d);
        if (d === 0) {
          const rule = byId.get(dep);
          if (rule) queue.push(rule);
        }
      }
    }

    if (ordered.length !== rules.length) {
      // Cycle among enabled set — fall back to pure priority order
      return [...rules].sort(compareRules);
    }

    return ordered;
  }

  private detectDependencyCycles(): string[] | null {
    const rules = this.listAll().map((e) => e.rule);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];

    const dfs = (id: string): string[] | null => {
      if (visiting.has(id)) {
        const idx = stack.indexOf(id);
        return [...stack.slice(idx), id];
      }
      if (visited.has(id)) return null;
      visiting.add(id);
      stack.push(id);
      const meta = this.entries.get(id)?.rule.metadata;
      for (const pre of meta?.prerequisites ?? []) {
        if (!this.entries.has(pre)) continue;
        // Walk prereq edge for cycle detection (result checked below via dependents)
        const cycle = dfs(pre);
        if (cycle) return cycle;
      }
      // Walk dependents: edges id → rules that list id as prerequisite
      for (const r of rules) {
        if (r.metadata.prerequisites.includes(id)) {
          const c = dfs(r.metadata.id);
          if (c) return c;
        }
      }
      stack.pop();
      visiting.delete(id);
      visited.add(id);
      return null;
    };

    for (const r of rules) {
      const c = dfs(r.metadata.id);
      if (c) return c;
    }
    return null;
  }

  private assertMetadata(m: RuleMetadata): void {
    if (!m.name?.trim()) {
      throw new RuleRegistrationError(`Rule ${m.id}: name is required`);
    }
    if (!m.description?.trim()) {
      throw new RuleRegistrationError(`Rule ${m.id}: description is required`);
    }
    if (typeof m.priority !== "number" || Number.isNaN(m.priority)) {
      throw new RuleRegistrationError(`Rule ${m.id}: priority must be a number`);
    }
    if (!Array.isArray(m.prerequisites)) {
      throw new RuleRegistrationError(
        `Rule ${m.id}: prerequisites must be an array`
      );
    }
    if (m.prerequisites.includes(m.id)) {
      throw new RuleRegistrationError(
        `Rule ${m.id}: cannot list itself as prerequisite`
      );
    }
  }
}

function compareRules(a: IPlanningRule, b: IPlanningRule): number {
  const pd = a.metadata.priority - b.metadata.priority;
  if (pd !== 0) return pd;
  return a.metadata.id.localeCompare(b.metadata.id);
}

/** Create an empty registry. */
export function createRuleRegistry(): RuleRegistry {
  return new RuleRegistry();
}
