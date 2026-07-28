/**
 * Hafiz Rule Engine infrastructure (Phase 2).
 *
 * NO Quran rules here — only registry, pipeline, executor, tracing.
 *
 *   import {
 *     createRuleRegistry,
 *     RulePipeline,
 *     createRuleExecutor,
 *     RulePriorityBand,
 *   } from "@/core/rules";
 */

// Metadata & classification
export type { RuleCategory, RulePriority, RuleMetadata } from "./metadata";
export { RulePriorityBand } from "./metadata";

// Context
export type { RuleContext, RuleContextInput } from "./context";
export { createRuleContext, withPriorResult } from "./context";

// Rule contract
export type { IPlanningRule } from "./rule";
export {
  ruleId,
  ruleName,
  ruleDescription,
  rulePrerequisites,
} from "./rule";

// Result factories
export {
  createRuleResult,
  ruleNotApplied,
  ruleApplied,
  ruleSkippedPrerequisite,
  ruleSkippedDisabled,
  ruleError,
} from "./result-factory";

// Trace / debug
export type {
  RuleTrace,
  RuleTraceStatus,
  RuleExecutionLog,
} from "./trace";
export { summarizeExecutionLog, emptyExecutionLog } from "./trace";

// Registry
export type { RegisteredRule } from "./registry";
export {
  RuleRegistry,
  RuleRegistrationError,
  createRuleRegistry,
} from "./registry";

// Pipeline
export type { RulePipelineOptions } from "./pipeline";
export { RulePipeline } from "./pipeline";

// Executor
export type { RuleExecutorOptions, RuleExecutionOutput } from "./executor";
export {
  RuleExecutor,
  createRuleExecutor,
  failedBootstrapLog,
} from "./executor";

/** @deprecated Use IPlanningRule — kept for Phase 1 import compatibility */
export type { IPlanningRule as IRulePipelineRule } from "./rule";

// Logic Bible — Scenario + Progression + Revision
export {
  LOGIC_BIBLE_SCENARIO_RULES,
  LOGIC_BIBLE_PROGRESSION_RULES,
  LOGIC_BIBLE_REVISION_RULES,
  LOGIC_BIBLE_RULES,
  LOGIC_BIBLE_RULE_IDS,
  LOGIC_BIBLE_PROGRESSION_RULE_IDS,
  LOGIC_BIBLE_REVISION_RULE_IDS,
  registerLogicBibleScenarioRules,
  registerLogicBibleProgressionRules,
  registerLogicBibleRevisionRules,
  registerLogicBibleRules,
  weakMemorizationLockRule,
  beginnerTrackRule,
  existingMemorizerTrackRule,
  capacityLockRule,
  readinessForNewHifzRule,
  increaseCapacityRule,
  strengtheningThresholdRule,
  regressionLockRule,
  revisionPriorityRule,
  revisionLoadRule,
  forgottenContentRecoveryRule,
  revisionStabilityGateRule,
  S001_ID,
  S002_ID,
  S003_ID,
  S004_ID,
  P001_ID,
  P002_ID,
  P003_ID,
  P004_ID,
  R001_ID,
  R002_ID,
  R003_ID,
  R004_ID,
  BEGINNER_TRACK,
} from "./logic-bible";
export {
  isWeakRetention,
  isStrengthenExistingGoal,
  hasNoMemorizedQuran,
  hasAnyMemorization,
  collectMemorizedSurahNumbers,
  isConsecutiveMemorization,
  isFragmentedMemorization,
  isJuzSelectionConsecutive,
  lastMemorizedSurah,
  // Progression predicates
  isReadyForNewHifz,
  shouldIncreaseCapacity,
  assessStrengthening,
  assessRegression,
  recentMistakeCount,
  computeSessionStability,
  computeRevisionStability,
  effectiveStrengthScore,
  // Revision predicates
  assessRevisionPriority,
  computeRevisionLoad,
  assessRecovery,
  assessStabilityGate,
  collectRevisionSignals,
} from "./logic-bible";

// Resolution / Decision Engine (+ validation + explainability)
export type {
  Decision,
  DecisionReason,
  DecisionEffect,
  DecisionTrack,
  SuggestedCapacityChange,
  RankedRuleResult,
  ConflictKind,
  ConflictRecord,
  MergeAccumulator,
  BuildDecisionOptions,
  BuildDecisionOutput,
  DecisionValidationResult,
} from "./resolution";
export {
  sortByResolutionPriority,
  rankAppliedResults,
  compareRanked,
  categoryClassRank,
  severityRank,
  resolveScalarConflict,
  metaBool,
  metaString,
  metaNumber,
  createEmptyAccumulator,
  foldResult,
  mergeRankedResults,
  buildDecision,
  resolveRuleResults,
  resolveAndValidate,
  validateDecision,
  isDecisionValid,
  normalizeReasons,
  buildDecisionEffects,
  inferEffectFromReason,
} from "./resolution";
