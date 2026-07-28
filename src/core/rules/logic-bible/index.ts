/**
 * Hafiz Logic Bible — implemented rules registry helpers.
 *
 * Registered:
 *   Scenario S-001…S-004
 *   Progression P-001…P-004
 *   Revision R-001…R-004
 *
 * Do not add rules here unless they appear in the Logic Bible.
 */

import type { RuleRegistry } from "../registry";
import { weakMemorizationLockRule, S001_ID } from "./s001-weak-memorization-lock";
import { beginnerTrackRule, S002_ID } from "./s002-beginner-track";
import {
  existingMemorizerTrackRule,
  S003_ID,
} from "./s003-existing-memorizer-track";
import { capacityLockRule, S004_ID } from "./s004-capacity-lock";
import {
  LOGIC_BIBLE_PROGRESSION_RULES,
  LOGIC_BIBLE_PROGRESSION_RULE_IDS,
  registerLogicBibleProgressionRules,
  P001_ID,
  P002_ID,
  P003_ID,
  P004_ID,
} from "./progression";
import {
  LOGIC_BIBLE_REVISION_RULES,
  LOGIC_BIBLE_REVISION_RULE_IDS,
  registerLogicBibleRevisionRules,
  R001_ID,
  R002_ID,
  R003_ID,
  R004_ID,
} from "./revision";
import type { IPlanningRule } from "../rule";

export { weakMemorizationLockRule, S001_ID } from "./s001-weak-memorization-lock";
export { beginnerTrackRule, S002_ID, BEGINNER_TRACK } from "./s002-beginner-track";
export {
  existingMemorizerTrackRule,
  S003_ID,
} from "./s003-existing-memorizer-track";
export { capacityLockRule, S004_ID } from "./s004-capacity-lock";
export * from "./predicates";
export * from "./progression";
export * from "./revision";

/** Scenario rules S-001…S-004. */
export const LOGIC_BIBLE_SCENARIO_RULES: readonly IPlanningRule[] = [
  weakMemorizationLockRule,
  beginnerTrackRule,
  existingMemorizerTrackRule,
  capacityLockRule,
];

/** All Logic Bible rules implemented so far. */
export const LOGIC_BIBLE_RULES: readonly IPlanningRule[] = [
  ...LOGIC_BIBLE_SCENARIO_RULES,
  ...LOGIC_BIBLE_PROGRESSION_RULES,
  ...LOGIC_BIBLE_REVISION_RULES,
];

export const LOGIC_BIBLE_RULE_IDS = [
  S001_ID,
  S002_ID,
  S003_ID,
  S004_ID,
  ...LOGIC_BIBLE_PROGRESSION_RULE_IDS,
  ...LOGIC_BIBLE_REVISION_RULE_IDS,
] as const;

/**
 * Register S-001…S-004 on a registry (idempotent replace).
 */
export function registerLogicBibleScenarioRules(
  registry: RuleRegistry
): void {
  for (const rule of LOGIC_BIBLE_SCENARIO_RULES) {
    if (registry.has(rule.metadata.id)) {
      registry.replace(rule);
    } else {
      registry.register(rule);
    }
  }
}

/**
 * Register every implemented Logic Bible rule.
 */
export function registerLogicBibleRules(registry: RuleRegistry): void {
  registerLogicBibleScenarioRules(registry);
  registerLogicBibleProgressionRules(registry);
  registerLogicBibleRevisionRules(registry);
}

export {
  P001_ID,
  P002_ID,
  P003_ID,
  P004_ID,
  R001_ID,
  R002_ID,
  R003_ID,
  R004_ID,
};
