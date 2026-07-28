/**
 * Build final Decision from merged accumulator + applied rule list.
 * Pipeline: results → merge → Decision → explainability → validation (report-only).
 */

import type { RuleResult } from "../../models";
import type { RulePriority } from "../metadata";
import {
  rankAppliedResults,
  sortByResolutionPriority,
} from "./priority-engine";
import { mergeRankedResults } from "./merge-results";
import { buildDecisionEffects, normalizeReasons } from "./explainability";
import {
  validateDecision,
  type DecisionValidationResult,
} from "./decision-validator";
import type { ConflictRecord, Decision, DecisionReason } from "./types";

export interface BuildDecisionOptions {
  /** Lookup rule priority from registry metadata */
  priorityOf?: (ruleId: string) => RulePriority;
  /** Lookup rule category string */
  categoryOf?: (ruleId: string) => string | undefined;
  /**
   * Declared daily minutes from profile — used when no rule set a capacity.
   * Not a rule; fill-in only when still null after merge.
   */
  fallbackDailyMinutes?: number;
  /**
   * Declared new-hifz pages/day from profile — used when NEW_HIFZ is on
   * but no rule set dailyPageCapacity.
   */
  fallbackDailyPages?: number;
}

export interface BuildDecisionOutput {
  decision: Decision;
  conflicts: readonly ConflictRecord[];
  rankedOrder: readonly string[];
  /** Report-only validation of the final Decision */
  validation: DecisionValidationResult;
}

/**
 * Convert many RuleResults (applied + not) into one deterministic Decision.
 * Non-applied results are ignored.
 */
export function buildDecision(
  results: readonly RuleResult[],
  options: BuildDecisionOptions = {}
): BuildDecisionOutput {
  const ranked = rankAppliedResults(
    results,
    options.priorityOf,
    options.categoryOf
  );
  const sorted = sortByResolutionPriority(ranked);
  const acc = mergeRankedResults(sorted);

  // Defaults when no rule spoke
  let newHifzEnabled = acc.newHifzEnabled;
  if (newHifzEnabled === null) {
    newHifzEnabled = true;
    acc.reasons.push({
      code: "default_new_hifz",
      ruleId: "resolver",
      message: "No rule set newHifzEnabled; default true.",
      severity: "info",
    });
  }

  let revisionOnly = acc.revisionOnly;
  if (revisionOnly === null) {
    revisionOnly = !newHifzEnabled;
  }

  // revisionOnly implies new hifz off
  if (revisionOnly && newHifzEnabled) {
    acc.reasons.push({
      code: "revision_only_forces_hifz_off",
      ruleId: "resolver",
      message:
        "revisionOnly=true forces newHifzEnabled=false (explicit resolver law).",
      severity: "hard",
    });
    newHifzEnabled = false;
  }

  // If hifz disabled, revisionOnly for practical purposes
  if (!newHifzEnabled && revisionOnly === false) {
    // keep false only if a rule explicitly wanted both — rare; prefer revision emphasis
  }
  if (!newHifzEnabled) {
    revisionOnly = true;
  }

  let revisionScheduleEnabled = acc.revisionScheduleEnabled;
  if (revisionScheduleEnabled === null) {
    revisionScheduleEnabled = true;
  }

  let minutes = acc.dailyMinuteCapacity;
  if (minutes === null && typeof options.fallbackDailyMinutes === "number") {
    minutes = Math.max(0, options.fallbackDailyMinutes);
    acc.reasons.push({
      code: "fallback_minutes",
      ruleId: "resolver",
      message: `dailyCapacity.minutes fallback from profile: ${minutes}`,
      severity: "info",
    });
  }

  // Page capacity: null means "unspecified" (not zero) unless hifz disabled
  let pages = acc.dailyPageCapacity;
  if (!newHifzEnabled && pages === null) {
    pages = 0;
    acc.reasons.push({
      code: "hifz_off_zero_pages",
      ruleId: "resolver",
      message: "newHifzEnabled=false ⇒ dailyCapacity.pages = 0.",
      severity: "info",
    });
  }
  // When NEW_HIFZ is on but no rule set pages, honor profile pagesPerDay fallback
  if (
    newHifzEnabled &&
    pages === null &&
    typeof options.fallbackDailyPages === "number" &&
    options.fallbackDailyPages > 0
  ) {
    pages = options.fallbackDailyPages;
    acc.reasons.push({
      code: "fallback_pages",
      ruleId: "resolver",
      message: `dailyCapacity.pages fallback from profile: ${pages}`,
      severity: "info",
    });
  }

  // Progression hard laws
  let lockProgression = acc.lockProgression;
  const strengtheningRequired = acc.strengtheningRequired;
  if (lockProgression) {
    newHifzEnabled = false;
    revisionOnly = true;
    if (pages === null || pages > 0) {
      pages = 0;
    }
    acc.reasons.push({
      code: "regression_forces_hifz_off",
      ruleId: "resolver",
      message: "lockProgression=true forces newHifzEnabled=false.",
      severity: "hard",
    });
  }
  if (strengtheningRequired && newHifzEnabled) {
    // Hard strengthening already folded via overrides; keep consistent
    newHifzEnabled = false;
    revisionOnly = true;
    acc.reasons.push({
      code: "strengthening_forces_hifz_off",
      ruleId: "resolver",
      message: "strengtheningRequired=true forces newHifzEnabled=false.",
      severity: "hard",
    });
  }

  let allowNewHifz = acc.allowNewHifz;
  if (allowNewHifz === null) {
    allowNewHifz = newHifzEnabled;
  }
  // Final allow flag cannot exceed hard newHifzEnabled
  if (!newHifzEnabled) {
    allowNewHifz = false;
  }

  // Revision structure hard laws (R-003 recovery / R-004 gate)
  const recoveryRequired = acc.recoveryRequired;
  let stabilityGatePassed =
    acc.stabilityGatePassed === null ? true : acc.stabilityGatePassed;
  let revisionPriority = acc.revisionPriority;

  if (recoveryRequired) {
    newHifzEnabled = false;
    revisionOnly = true;
    lockProgression = true;
    allowNewHifz = false;
    revisionPriority = true;
    stabilityGatePassed = false;
    if (pages === null || pages > 0) pages = 0;
    acc.reasons.push({
      code: "recovery_forces_hifz_off",
      ruleId: "resolver",
      message: "recoveryRequired=true forces newHifzEnabled=false.",
      severity: "hard",
    });
  }
  if (!stabilityGatePassed) {
    newHifzEnabled = false;
    revisionOnly = true;
    lockProgression = true;
    allowNewHifz = false;
    revisionPriority = true;
    if (pages === null || pages > 0) pages = 0;
    acc.reasons.push({
      code: "stability_gate_forces_hifz_off",
      ruleId: "resolver",
      message: "stabilityGatePassed=false forces newHifzEnabled=false.",
      severity: "hard",
    });
  }
  // Soft revision priority (critical path already set overrides)
  if (revisionPriority && !newHifzEnabled) {
    revisionOnly = true;
  }

  // Drop soft capacity suggestions when progression is locked
  let suggestedCapacityChange = null as Decision["suggestedCapacityChange"];
  if (
    !lockProgression &&
    !strengtheningRequired &&
    !recoveryRequired &&
    stabilityGatePassed &&
    (acc.suggestedPagesDelta != null || acc.suggestedMinutesDelta != null)
  ) {
    suggestedCapacityChange = {
      pagesDelta: acc.suggestedPagesDelta,
      minutesDelta: acc.suggestedMinutesDelta,
      reason: acc.capacityChangeReason,
    };
  }

  const recommendedRevision =
    acc.recommendedRevisionPages != null ||
    acc.recommendedRevisionMinutes != null
      ? {
          pages: acc.recommendedRevisionPages,
          minutes: acc.recommendedRevisionMinutes,
        }
      : null;

  const conflictsFrozen = Object.freeze([
    ...acc.conflicts,
  ]) as readonly ConflictRecord[];

  const normalizedReasons = normalizeReasons(acc.reasons);

  const partialForEffects = {
    newHifzEnabled,
    lockProgression,
    recoveryRequired,
    strengtheningRequired,
    stabilityGatePassed,
    revisionOnly: !!revisionOnly,
  };

  const effects = buildDecisionEffects(
    normalizedReasons,
    conflictsFrozen,
    partialForEffects
  );

  // Pre-validation shell (validation is report-only; warnings merge onto Decision)
  const draft: Decision = {
    track: acc.track,
    newHifzEnabled,
    revisionOnly: !!revisionOnly,
    dailyCapacity: {
      minutes,
      pages,
    },
    additionalListeningPractice: acc.additionalListeningPractice,
    additionalMistakeReview: acc.additionalMistakeReview,
    revisionScheduleEnabled: !!revisionScheduleEnabled,
    allowNewHifz,
    lockProgression,
    strengtheningRequired,
    strengtheningArea: acc.strengtheningArea,
    suggestedCapacityChange,
    revisionPriority,
    recommendedRevision,
    recoveryRequired,
    recoveryScope: acc.recoveryScope,
    stabilityGatePassed,
    appliedRules: Object.freeze([...acc.appliedRules]),
    reasons: Object.freeze(normalizedReasons) as readonly DecisionReason[],
    effects: Object.freeze(effects),
    conflicts: conflictsFrozen,
    warnings: Object.freeze([] as string[]),
    trackMeta: {
      startSurah: acc.startSurah,
      endSurah: acc.endSurah,
      lastMemorizedSurah: acc.lastMemorizedSurah,
      continueAfterSurah: acc.continueAfterSurah,
      continuationMode: acc.continuationMode,
      forcePointerSurah: acc.forcePointerSurah,
      forcePointerAyah: acc.forcePointerAyah,
      preferCompleteNearby: acc.preferCompleteNearby,
    },
  };

  const validation = validateDecision(draft);
  const decision: Decision = {
    ...draft,
    warnings: Object.freeze([...validation.warnings]),
  };

  return {
    decision,
    conflicts: conflictsFrozen,
    rankedOrder: Object.freeze(sorted.map((s) => s.result.ruleId)),
    validation,
  };
}

/**
 * High-level entry: resolve applied results into Decision.
 */
export function resolveRuleResults(
  results: readonly RuleResult[],
  options?: BuildDecisionOptions
): Decision {
  return buildDecision(results, options).decision;
}

/**
 * Full pipeline end: resolve → Decision → validation report.
 * Decision is never mutated by the validator.
 */
export function resolveAndValidate(
  results: readonly RuleResult[],
  options?: BuildDecisionOptions
): BuildDecisionOutput {
  return buildDecision(results, options);
}
