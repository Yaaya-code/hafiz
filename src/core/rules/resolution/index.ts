/**
 * Rule Resolution & Decision Engine
 *
 * Turns multiple RuleResults into one deterministic Decision,
 * then validates (report-only) and normalizes explainability.
 *
 * Flow: Results → Merge → Decision → Explainability → Validation
 * No planning. No scheduling. No UI.
 */

export type {
  Decision,
  DecisionReason,
  DecisionEffect,
  DecisionTrack,
  SuggestedCapacityChange,
  RankedRuleResult,
  ConflictKind,
  ConflictRecord,
} from "./types";

export {
  sortByResolutionPriority,
  rankAppliedResults,
  compareRanked,
  categoryClassRank,
  severityRank,
} from "./priority-engine";

export {
  resolveScalarConflict,
  metaBool,
  metaString,
  metaNumber,
} from "./conflict-resolver";

export type { MergeAccumulator } from "./merge-results";
export {
  createEmptyAccumulator,
  foldResult,
  mergeRankedResults,
} from "./merge-results";

export type { BuildDecisionOptions, BuildDecisionOutput } from "./decision-builder";
export {
  buildDecision,
  resolveRuleResults,
  resolveAndValidate,
} from "./decision-builder";

export type { DecisionValidationResult } from "./decision-validator";
export {
  validateDecision,
  isDecisionValid,
} from "./decision-validator";

export {
  normalizeReasons,
  buildDecisionEffects,
  inferEffectFromReason,
} from "./explainability";
