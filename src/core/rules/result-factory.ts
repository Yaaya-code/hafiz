/**
 * Helpers to construct RuleResult values consistently.
 * No domain decisions — factories only.
 */

import type { RuleResult, RuleSeverity } from "../models";

export function createRuleResult(
  partial: Omit<RuleResult, "severity" | "severity"> & {
    ruleId: string;
    applied: boolean;
    severity?: RuleSeverity;
  }
): RuleResult {
  return {
    ruleId: partial.ruleId,
    applied: partial.applied,
    severity: partial.severity ?? "info",
    messageAr: partial.messageAr,
    overrides: partial.overrides,
    suggestedSlots: partial.suggestedSlots,
    enqueueRevision: partial.enqueueRevision,
    meta: partial.meta,
  };
}

/** Rule ran and did not fire. */
export function ruleNotApplied(
  ruleId: string,
  messageAr?: string
): RuleResult {
  return createRuleResult({
    ruleId,
    applied: false,
    severity: "info",
    messageAr,
  });
}

/** Rule ran and fired. */
export function ruleApplied(
  ruleId: string,
  opts?: {
    severity?: RuleSeverity;
    messageAr?: string;
    overrides?: RuleResult["overrides"];
    suggestedSlots?: RuleResult["suggestedSlots"];
    enqueueRevision?: RuleResult["enqueueRevision"];
    meta?: RuleResult["meta"];
  }
): RuleResult {
  return createRuleResult({
    ruleId,
    applied: true,
    severity: opts?.severity ?? "soft",
    messageAr: opts?.messageAr,
    overrides: opts?.overrides,
    suggestedSlots: opts?.suggestedSlots,
    enqueueRevision: opts?.enqueueRevision,
    meta: opts?.meta,
  });
}

/** Fatal skip when prerequisites are missing (executor injects this). */
export function ruleSkippedPrerequisite(
  ruleId: string,
  missing: readonly string[]
): RuleResult {
  return createRuleResult({
    ruleId,
    applied: false,
    severity: "hard",
    messageAr: undefined,
    meta: {
      skipped: true,
      reason: "missing_prerequisites",
      missing: missing.join(","),
    },
  });
}

/** Rule disabled in registry. */
export function ruleSkippedDisabled(ruleId: string): RuleResult {
  return createRuleResult({
    ruleId,
    applied: false,
    severity: "info",
    meta: {
      skipped: true,
      reason: "disabled",
    },
  });
}

/** Unexpected evaluation failure (still no throw out of executor if catch mode). */
export function ruleError(ruleId: string, errorMessage: string): RuleResult {
  return createRuleResult({
    ruleId,
    applied: false,
    severity: "hard",
    meta: {
      error: true,
      message: errorMessage.slice(0, 500),
    },
  });
}
