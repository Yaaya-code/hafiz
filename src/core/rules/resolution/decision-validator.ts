/**
 * Decision Validation Layer — report-only consistency checks.
 * Never mutates the Decision. Pure and deterministic.
 */

import type { Decision } from "./types";

export interface DecisionValidationResult {
  valid: boolean;
  errors: string[];
  /** Soft inconsistencies that do not fail the decision by policy */
  warnings: string[];
}

/**
 * Validate logical consistency of a resolved Decision.
 * Does not repair or mutate input.
 */
export function validateDecision(decision: Decision): DecisionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Hard invalid combinations ---
  if (decision.newHifzEnabled === true && decision.revisionOnly === true) {
    errors.push(
      "Invalid: newHifzEnabled=true AND revisionOnly=true (mutually exclusive)."
    );
  }

  if (decision.recoveryRequired === true && decision.allowNewHifz === true) {
    errors.push(
      "Invalid: recoveryRequired=true AND allowNewHifz=true (recovery blocks new hifz)."
    );
  }

  if (
    decision.recoveryRequired === true &&
    decision.newHifzEnabled === true
  ) {
    errors.push(
      "Invalid: recoveryRequired=true AND newHifzEnabled=true."
    );
  }

  if (
    typeof decision.dailyCapacity.minutes === "number" &&
    decision.dailyCapacity.minutes < 0
  ) {
    errors.push(
      `Invalid: dailyCapacity.minutes is negative (${decision.dailyCapacity.minutes}).`
    );
  }

  if (
    typeof decision.dailyCapacity.pages === "number" &&
    decision.dailyCapacity.pages < 0
  ) {
    errors.push(
      `Invalid: dailyCapacity.pages is negative (${decision.dailyCapacity.pages}).`
    );
  }

  // Hard stability gate: progression must not be allowed
  if (decision.stabilityGatePassed === false) {
    if (decision.newHifzEnabled === true) {
      errors.push(
        "Invalid: stabilityGatePassed=false AND newHifzEnabled=true (hard gate)."
      );
    }
    if (decision.allowNewHifz === true) {
      errors.push(
        "Invalid: stabilityGatePassed=false AND allowNewHifz=true (hard gate)."
      );
    }
    if (decision.lockProgression === false) {
      errors.push(
        "Invalid: stabilityGatePassed=false but lockProgression=false."
      );
    }
  }

  if (decision.lockProgression === true && decision.newHifzEnabled === true) {
    errors.push(
      "Invalid: lockProgression=true AND newHifzEnabled=true."
    );
  }

  if (
    decision.lockProgression === true &&
    decision.allowNewHifz === true
  ) {
    errors.push(
      "Invalid: lockProgression=true AND allowNewHifz=true."
    );
  }

  if (
    decision.strengtheningRequired === true &&
    decision.newHifzEnabled === true
  ) {
    errors.push(
      "Invalid: strengtheningRequired=true AND newHifzEnabled=true."
    );
  }

  // allowNewHifz cannot exceed newHifzEnabled
  if (decision.allowNewHifz === true && decision.newHifzEnabled === false) {
    errors.push(
      "Invalid: allowNewHifz=true while newHifzEnabled=false."
    );
  }

  // --- Soft warnings (do not fail) ---
  if (
    decision.revisionPriority === true &&
    decision.newHifzEnabled === true &&
    !decision.recoveryRequired &&
    decision.stabilityGatePassed
  ) {
    warnings.push(
      "Note: revisionPriority=true while newHifzEnabled=true (elevated revision, not exclusive lock)."
    );
  }

  if (
    decision.suggestedCapacityChange != null &&
    (decision.lockProgression ||
      decision.recoveryRequired ||
      !decision.stabilityGatePassed)
  ) {
    warnings.push(
      "Note: suggestedCapacityChange present while progression is locked (usually stripped by resolver)."
    );
  }

  if (
    decision.dailyCapacity.minutes === 0 &&
    decision.newHifzEnabled === true
  ) {
    warnings.push(
      "Note: dailyCapacity.minutes=0 while newHifzEnabled=true (zero time budget)."
    );
  }

  if (!decision.appliedRules || decision.appliedRules.length === 0) {
    warnings.push("Note: no appliedRules on Decision (empty rule set).");
  }

  if (!decision.reasons || decision.reasons.length === 0) {
    warnings.push("Note: Decision has no reasons trail.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * True when Decision is valid (no hard errors).
 */
export function isDecisionValid(decision: Decision): boolean {
  return validateDecision(decision).valid;
}
