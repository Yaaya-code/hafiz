/**
 * Decision explainability helpers — normalize hard-lock effect trail.
 * Does not invent rule logic; only derives presentation from Decision + conflicts.
 */

import type {
  ConflictRecord,
  Decision,
  DecisionEffect,
  DecisionReason,
} from "./types";

/** Codes that imply a hard lock on new hifz / progression */
const HARD_HIFZ_OFF_CODES = new Set([
  "lock_progression",
  "recovery_required",
  "stability_gate_failed",
  "strengthening_required",
  "disableNewMemorization",
  "disableAutomaticNewMemorization",
  "conflict_new_hifz",
  "revision_only_forces_hifz_off",
  "regression_forces_hifz_off",
  "strengthening_forces_hifz_off",
  "recovery_forces_hifz_off",
  "stability_gate_forces_hifz_off",
  "conflict_disableNewMemorization",
  "conflict_disableAutomaticNewMemorization",
  "conflict_recoveryRequired",
  "conflict_stabilityGateFailed",
  "conflict_lockProgression",
  "set_new_hifz",
  "revision_share_100",
]);

/**
 * Infer effect string from a reason code / message when not set.
 */
export function inferEffectFromReason(r: DecisionReason): string | undefined {
  if (r.effect) return r.effect;
  const msg = r.message.toLowerCase();
  if (
    r.code === "set_new_hifz" &&
    (msg.includes("false") || msg.includes(":= false"))
  ) {
    return "newHifzEnabled=false";
  }
  if (r.code === "set_new_hifz" && msg.includes("true")) {
    return "newHifzEnabled=true";
  }
  if (
    HARD_HIFZ_OFF_CODES.has(r.code) ||
    msg.includes("newhifzenabled=false") ||
    msg.includes("disables") ||
    msg.includes("forces newhifzenabled=false") ||
    msg.includes("locked") ||
    msg.includes("recovery") ||
    msg.includes("regression")
  ) {
    if (r.severity === "hard" || HARD_HIFZ_OFF_CODES.has(r.code)) {
      if (r.code.includes("capacity") || r.code.includes("minute")) {
        return "dailyCapacity";
      }
      if (r.code.includes("revision_only") || r.code.includes("revision_share")) {
        return "revisionOnly=true;newHifzEnabled=false";
      }
      if (r.code.includes("lock_progression") || r.code.includes("regression")) {
        return "lockProgression=true;newHifzEnabled=false";
      }
      if (r.code.includes("recovery")) {
        return "recoveryRequired=true;newHifzEnabled=false";
      }
      if (r.code.includes("stability_gate")) {
        return "stabilityGatePassed=false;newHifzEnabled=false";
      }
      if (r.code.includes("strengthening")) {
        return "strengtheningRequired=true;newHifzEnabled=false";
      }
      return "newHifzEnabled=false";
    }
  }
  if (r.code === "set_track" || r.code === "conflict_track") {
    return "track";
  }
  if (r.code.startsWith("set_daily") || r.code.includes("capacity")) {
    return "dailyCapacity";
  }
  if (r.code === "revision_priority") {
    return "revisionPriority=true";
  }
  if (r.code === "revision_load") {
    return "recommendedRevision";
  }
  if (r.code === "capacity_increase_suggested") {
    return "suggestedCapacityChange";
  }
  return undefined;
}

/**
 * Enrich reasons with effect strings (immutable copy).
 */
export function normalizeReasons(
  reasons: readonly DecisionReason[]
): DecisionReason[] {
  return reasons.map((r) => {
    const effect = inferEffectFromReason(r);
    if (!effect || r.effect === effect) return { ...r, effect: r.effect ?? effect };
    return { ...r, effect };
  });
}

/**
 * Build normalized effects trail from hard/soft material reasons + conflicts.
 */
export function buildDecisionEffects(
  reasons: readonly DecisionReason[],
  conflicts: readonly ConflictRecord[],
  decision: Pick<
    Decision,
    | "newHifzEnabled"
    | "lockProgression"
    | "recoveryRequired"
    | "strengtheningRequired"
    | "stabilityGatePassed"
    | "revisionOnly"
  >
): DecisionEffect[] {
  const effects: DecisionEffect[] = [];
  const seen = new Set<string>();

  const push = (e: DecisionEffect) => {
    const key = `${e.rule}|${e.effect}|${e.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    effects.push(e);
  };

  for (const r of reasons) {
    if (r.severity !== "hard" && r.ruleId !== "resolver") {
      // Still include soft critical locks that disable hifz
      if (!(r.effect?.includes("newHifzEnabled=false") || r.code.includes("deny"))) {
        if (r.severity === "info") continue;
      }
    }
    const effect =
      r.effect ??
      inferEffectFromReason(r) ??
      (r.severity === "hard" ? "decision_field" : undefined);
    if (!effect) continue;
    if (r.severity === "info" && r.ruleId === "resolver" && !r.code.includes("force")) {
      continue;
    }
    push({
      rule: r.ruleId,
      reason: r.message,
      effect,
      severity: r.severity,
    });
  }

  for (const c of conflicts) {
    push({
      rule: c.winnerRuleId,
      reason: c.reason,
      effect: `${c.kind}=${String(c.winnerValue)}`,
      severity: "hard",
    });
  }

  // Terminal state summary effects for hard locks (always present when true)
  if (decision.lockProgression) {
    push({
      rule: "resolver",
      reason: "Progression is locked on final Decision.",
      effect: "lockProgression=true;newHifzEnabled=false",
      severity: "hard",
    });
  }
  if (decision.recoveryRequired) {
    push({
      rule: "resolver",
      reason: "Recovery required on final Decision.",
      effect: "recoveryRequired=true;newHifzEnabled=false",
      severity: "hard",
    });
  }
  if (!decision.stabilityGatePassed) {
    push({
      rule: "resolver",
      reason: "Revision stability gate failed on final Decision.",
      effect: "stabilityGatePassed=false;newHifzEnabled=false",
      severity: "hard",
    });
  }
  if (decision.strengtheningRequired && !decision.newHifzEnabled) {
    push({
      rule: "resolver",
      reason: "Strengthening required; new hifz disabled.",
      effect: "strengtheningRequired=true;newHifzEnabled=false",
      severity: "hard",
    });
  }
  if (decision.revisionOnly && !decision.newHifzEnabled) {
    push({
      rule: "resolver",
      reason: "Decision is revision-only.",
      effect: "revisionOnly=true;newHifzEnabled=false",
      severity: "hard",
    });
  }

  return effects;
}
