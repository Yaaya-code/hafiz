/**
 * Explicit conflict resolution policies.
 * Hard locks and safety/capacity always beat soft recommendations.
 */

import type { RuleResult, RuleSeverity } from "../../models";
import { severityRank } from "./priority-engine";
import type { ConflictKind, ConflictRecord } from "./types";

export interface ScalarConflictInput<T extends string | number | boolean | null> {
  kind: ConflictKind;
  current: { ruleId: string; value: T; severity: RuleSeverity };
  incoming: { ruleId: string; value: T; severity: RuleSeverity };
}

/**
 * Resolve two competing scalar values.
 * Policy:
 * - hard beats soft/info
 * - if both hard (or same severity): first-writer (current) wins for booleans that are locks
 *   EXCEPT capacity minutes/pages: minimum wins (strictest ceiling)
 * - soft never overrides hard
 */
export function resolveScalarConflict<
  T extends string | number | boolean | null,
>(input: ScalarConflictInput<T>): {
  value: T;
  winnerRuleId: string;
  conflict: ConflictRecord | null;
} {
  const { kind, current, incoming } = input;

  if (Object.is(current.value, incoming.value)) {
    return { value: current.value, winnerRuleId: current.ruleId, conflict: null };
  }

  // Capacity ceilings: always take the stricter (minimum) when both defined
  if (
    (kind === "daily_minute_capacity" || kind === "daily_page_capacity") &&
    typeof current.value === "number" &&
    typeof incoming.value === "number"
  ) {
    const cur = current.value as number;
    const inc = incoming.value as number;
    if (inc < cur) {
      return {
        value: incoming.value,
        winnerRuleId: incoming.ruleId,
        conflict: {
          kind,
          winnerRuleId: incoming.ruleId,
          loserRuleId: current.ruleId,
          winnerValue: incoming.value,
          loserValue: current.value,
          reason: `Strictest capacity ceiling wins: ${incoming.ruleId} (${inc}) < ${current.ruleId} (${cur}).`,
        },
      };
    }
    return {
      value: current.value,
      winnerRuleId: current.ruleId,
      conflict: {
        kind,
        winnerRuleId: current.ruleId,
        loserRuleId: incoming.ruleId,
        winnerValue: current.value,
        loserValue: incoming.value,
        reason: `Strictest capacity ceiling retained: ${current.ruleId} (${cur}) <= ${incoming.ruleId} (${inc}).`,
      },
    };
  }

  // Boolean locks: false (disable) from hard rule wins over true
  if (
    typeof current.value === "boolean" &&
    typeof incoming.value === "boolean" &&
    (kind === "new_hifz_enabled" ||
      kind === "revision_only" ||
      kind === "revision_schedule")
  ) {
    return resolveBooleanLock(
      kind,
      current as { ruleId: string; value: boolean; severity: RuleSeverity },
      incoming as { ruleId: string; value: boolean; severity: RuleSeverity }
    ) as {
      value: T;
      winnerRuleId: string;
      conflict: ConflictRecord | null;
    };
  }

  // Generic: higher severity (lower rank number) wins
  const sr = severityRank(current.severity);
  const ir = severityRank(incoming.severity);
  if (ir < sr) {
    return {
      value: incoming.value,
      winnerRuleId: incoming.ruleId,
      conflict: makeConflict(
        kind,
        incoming.ruleId,
        current.ruleId,
        incoming.value,
        current.value,
        `Harder severity (${incoming.severity}) from ${incoming.ruleId} overrides ${current.ruleId} (${current.severity}).`
      ),
    };
  }
  if (sr < ir) {
    return {
      value: current.value,
      winnerRuleId: current.ruleId,
      conflict: makeConflict(
        kind,
        current.ruleId,
        incoming.ruleId,
        current.value,
        incoming.value,
        `Harder severity (${current.severity}) from ${current.ruleId} keeps value over ${incoming.ruleId} (${incoming.severity}).`
      ),
    };
  }

  // Same severity: first-writer wins (deterministic given sort order)
  return {
    value: current.value,
    winnerRuleId: current.ruleId,
    conflict: makeConflict(
      kind,
      current.ruleId,
      incoming.ruleId,
      current.value,
      incoming.value,
      `Equal severity; first-writer ${current.ruleId} retained over ${incoming.ruleId}.`
    ),
  };
}

function resolveBooleanLock(
  kind: ConflictKind,
  current: { ruleId: string; value: boolean; severity: RuleSeverity },
  incoming: { ruleId: string; value: boolean; severity: RuleSeverity }
): {
  value: boolean;
  winnerRuleId: string;
  conflict: ConflictRecord | null;
} {
  // Hard false (lock) always beats true
  if (current.severity === "hard" && current.value === false && incoming.value === true) {
    return {
      value: false,
      winnerRuleId: current.ruleId,
      conflict: makeConflict(
        kind,
        current.ruleId,
        incoming.ruleId,
        false,
        true,
        `Hard lock ${current.ruleId} disables flag; soft/true from ${incoming.ruleId} ignored.`
      ),
    };
  }
  if (incoming.severity === "hard" && incoming.value === false && current.value === true) {
    return {
      value: false,
      winnerRuleId: incoming.ruleId,
      conflict: makeConflict(
        kind,
        incoming.ruleId,
        current.ruleId,
        false,
        true,
        `Hard lock ${incoming.ruleId} disables flag; previous true from ${current.ruleId} overridden.`
      ),
    };
  }

  // Hard true vs soft false — hard wins
  const sr = severityRank(current.severity);
  const ir = severityRank(incoming.severity);
  if (ir < sr) {
    return {
      value: incoming.value,
      winnerRuleId: incoming.ruleId,
      conflict: makeConflict(
        kind,
        incoming.ruleId,
        current.ruleId,
        incoming.value,
        current.value,
        `Higher severity ${incoming.ruleId} wins boolean conflict.`
      ),
    };
  }
  if (sr < ir) {
    return {
      value: current.value,
      winnerRuleId: current.ruleId,
      conflict: makeConflict(
        kind,
        current.ruleId,
        incoming.ruleId,
        current.value,
        incoming.value,
        `Higher severity ${current.ruleId} keeps boolean value.`
      ),
    };
  }

  // Prefer false when equal severity and values differ (safe default for locks)
  if (current.value === false || incoming.value === false) {
    const winner = current.value === false ? current : incoming;
    const loser = current.value === false ? incoming : current;
    return {
      value: false,
      winnerRuleId: winner.ruleId,
      conflict: makeConflict(
        kind,
        winner.ruleId,
        loser.ruleId,
        false,
        true,
        `Equal severity; restrictive false from ${winner.ruleId} preferred over true.`
      ),
    };
  }

  return {
    value: current.value,
    winnerRuleId: current.ruleId,
    conflict: null,
  };
}

function makeConflict(
  kind: ConflictKind,
  winnerRuleId: string,
  loserRuleId: string,
  winnerValue: string | number | boolean | null,
  loserValue: string | number | boolean | null,
  reason: string
): ConflictRecord {
  return {
    kind,
    winnerRuleId,
    loserRuleId,
    winnerValue,
    loserValue,
    reason,
  };
}

/** Extract boolean meta flag from a result. */
export function metaBool(
  r: RuleResult,
  key: string
): boolean | undefined {
  const v = r.meta?.[key];
  return typeof v === "boolean" ? v : undefined;
}

export function metaString(
  r: RuleResult,
  key: string
): string | undefined {
  const v = r.meta?.[key];
  return typeof v === "string" ? v : undefined;
}

export function metaNumber(
  r: RuleResult,
  key: string
): number | undefined {
  const v = r.meta?.[key];
  return typeof v === "number" ? v : undefined;
}
