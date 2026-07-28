/**
 * Logic Bible — Progression Rules (P-001 … P-004)
 *
 * Deterministic gates for readiness, capacity growth, strengthening, regression.
 * No UI. No scheduling. No Quran text analysis.
 */

import type { RuleRegistry } from "../../registry";
import type { IPlanningRule } from "../../rule";
import {
  readinessForNewHifzRule,
  P001_ID,
} from "./p001-readiness-for-new-hifz";
import { increaseCapacityRule, P002_ID } from "./p002-increase-capacity";
import {
  strengtheningThresholdRule,
  P003_ID,
} from "./p003-strengthening-threshold";
import { regressionLockRule, P004_ID } from "./p004-regression-lock";

export * from "./predicates";
export {
  readinessForNewHifzRule,
  P001_ID,
} from "./p001-readiness-for-new-hifz";
export { increaseCapacityRule, P002_ID } from "./p002-increase-capacity";
export {
  strengtheningThresholdRule,
  P003_ID,
} from "./p003-strengthening-threshold";
export { regressionLockRule, P004_ID } from "./p004-regression-lock";

/** Progression rules in Bible order. */
export const LOGIC_BIBLE_PROGRESSION_RULES: readonly IPlanningRule[] = [
  readinessForNewHifzRule,
  increaseCapacityRule,
  strengtheningThresholdRule,
  regressionLockRule,
];

export const LOGIC_BIBLE_PROGRESSION_RULE_IDS = [
  P001_ID,
  P002_ID,
  P003_ID,
  P004_ID,
] as const;

/**
 * Register P-001…P-004 (idempotent replace).
 */
export function registerLogicBibleProgressionRules(
  registry: RuleRegistry
): void {
  for (const rule of LOGIC_BIBLE_PROGRESSION_RULES) {
    if (registry.has(rule.metadata.id)) {
      registry.replace(rule);
    } else {
      registry.register(rule);
    }
  }
}
