/**
 * Deterministic ranking of applied RuleResults.
 *
 * Order:
 * 1. Severity rank: hard < soft < info  (hard first)
 * 2. Rule priority (lower number first — matches RulePriorityBand)
 * 3. ruleId lexicographic (stable tie-break)
 */

import type { RuleResult, RuleSeverity } from "../../models";
import type { RulePriority } from "../metadata";
import type { RankedRuleResult } from "./types";

const SEVERITY_RANK: Record<RuleSeverity, number> = {
  hard: 0,
  soft: 1,
  info: 2,
};

/**
 * Category class for conflict policy (not the same as RuleCategory string).
 * Lower = stronger class when severities equal.
 */
export function categoryClassRank(ruleId: string, metaCategory?: string): number {
  // Lower = stronger class when severities equal.
  // Hard capacity / recovery / regression beat soft progression & load tips.
  if (ruleId === "S-004") return 0;
  if (
    ruleId === "P-004" ||
    ruleId === "R-003" ||
    ruleId === "R-004" ||
    ruleId === "S-001" ||
    metaCategory === "safety"
  ) {
    return 1;
  }
  if (ruleId === "P-003" || ruleId === "R-001" || metaCategory === "revision") {
    return 2;
  }
  if (metaCategory === "scenario") return 3;
  // Soft capacity suggestions (P-002) and revision load (R-002)
  if (
    ruleId === "P-002" ||
    ruleId === "R-002" ||
    metaCategory === "capacity"
  ) {
    return 4;
  }
  if (ruleId === "P-001" || metaCategory === "hifz") return 5;
  if (metaCategory === "scheduling") return 6;
  return 7;
}

export function compareRanked(a: RankedRuleResult, b: RankedRuleResult): number {
  const sa = SEVERITY_RANK[a.result.severity] ?? 9;
  const sb = SEVERITY_RANK[b.result.severity] ?? 9;
  if (sa !== sb) return sa - sb;

  const ca = a.categoryRank;
  const cb = b.categoryRank;
  if (ca !== cb) return ca - cb;

  if (a.priority !== b.priority) return a.priority - b.priority;

  return a.result.ruleId.localeCompare(b.result.ruleId);
}

/**
 * Sort applied results into resolution order (strongest first).
 */
export function sortByResolutionPriority(
  ranked: readonly RankedRuleResult[]
): RankedRuleResult[] {
  return [...ranked].sort(compareRanked);
}

/**
 * Build ranked list from applied results + optional priority lookup.
 * Unknown ids default priority 500, categoryRank 5.
 */
export function rankAppliedResults(
  results: readonly RuleResult[],
  priorityOf: (ruleId: string) => RulePriority = () => 500,
  categoryOf: (ruleId: string) => string | undefined = () => undefined
): RankedRuleResult[] {
  const applied = results.filter((r) => r.applied);
  return applied.map((result) => ({
    result,
    priority: priorityOf(result.ruleId),
    categoryRank: categoryClassRank(result.ruleId, categoryOf(result.ruleId)),
  }));
}

export function severityRank(s: RuleSeverity): number {
  return SEVERITY_RANK[s] ?? 9;
}
