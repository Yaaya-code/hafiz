/**
 * Logic Bible — Revision Structure Rules (R-001 … R-004)
 *
 * How revision behaves given stability, mistakes, and memorization state.
 * No UI. No scheduling. No Quran text analysis.
 */

import type { RuleRegistry } from "../../registry";
import type { IPlanningRule } from "../../rule";
import { revisionPriorityRule, R001_ID } from "./r001-revision-priority";
import { revisionLoadRule, R002_ID } from "./r002-revision-load";
import {
  forgottenContentRecoveryRule,
  R003_ID,
} from "./r003-forgotten-content-recovery";
import {
  revisionStabilityGateRule,
  R004_ID,
} from "./r004-revision-stability-gate";

export * from "./predicates";
export { revisionPriorityRule, R001_ID } from "./r001-revision-priority";
export { revisionLoadRule, R002_ID } from "./r002-revision-load";
export {
  forgottenContentRecoveryRule,
  R003_ID,
} from "./r003-forgotten-content-recovery";
export {
  revisionStabilityGateRule,
  R004_ID,
} from "./r004-revision-stability-gate";

/** Revision structure rules in Bible order. */
export const LOGIC_BIBLE_REVISION_RULES: readonly IPlanningRule[] = [
  revisionPriorityRule,
  revisionLoadRule,
  forgottenContentRecoveryRule,
  revisionStabilityGateRule,
];

export const LOGIC_BIBLE_REVISION_RULE_IDS = [
  R001_ID,
  R002_ID,
  R003_ID,
  R004_ID,
] as const;

/**
 * Register R-001…R-004 (idempotent replace).
 */
export function registerLogicBibleRevisionRules(
  registry: RuleRegistry
): void {
  for (const rule of LOGIC_BIBLE_REVISION_RULES) {
    if (registry.has(rule.metadata.id)) {
      registry.replace(rule);
    } else {
      registry.register(rule);
    }
  }
}
