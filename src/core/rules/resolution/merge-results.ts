/**
 * Merge ranked applied RuleResults into a partial decision accumulator.
 */

import type { RuleResult } from "../../models";
import {
  metaBool,
  metaNumber,
  metaString,
  resolveScalarConflict,
} from "./conflict-resolver";
import type {
  ConflictRecord,
  DecisionReason,
  DecisionTrack,
  RankedRuleResult,
} from "./types";

export interface MergeAccumulator {
  track: DecisionTrack;
  newHifzEnabled: boolean | null;
  revisionOnly: boolean | null;
  dailyMinuteCapacity: number | null;
  dailyPageCapacity: number | null;
  additionalListeningPractice: boolean;
  additionalMistakeReview: boolean;
  revisionScheduleEnabled: boolean | null;
  /** Progression (P-001…P-004) */
  allowNewHifz: boolean | null;
  lockProgression: boolean;
  strengtheningRequired: boolean;
  strengtheningArea: string | null;
  suggestedPagesDelta: number | null;
  suggestedMinutesDelta: number | null;
  capacityChangeReason: string | null;
  /** Revision structure (R-001…R-004) */
  revisionPriority: boolean;
  recommendedRevisionPages: number | null;
  recommendedRevisionMinutes: number | null;
  recoveryRequired: boolean;
  recoveryScope: string | null;
  /** null = no gate rule spoke; true/false when R-004 applied */
  stabilityGatePassed: boolean | null;
  startSurah?: number;
  endSurah?: number;
  lastMemorizedSurah?: number;
  continueAfterSurah?: number;
  forcePointerSurah?: number;
  forcePointerAyah?: number;
  preferCompleteNearby?: boolean;
  continuationMode?: string;
  appliedRules: string[];
  reasons: DecisionReason[];
  conflicts: ConflictRecord[];
}

export function createEmptyAccumulator(): MergeAccumulator {
  return {
    track: "unspecified",
    newHifzEnabled: null,
    revisionOnly: null,
    dailyMinuteCapacity: null,
    dailyPageCapacity: null,
    additionalListeningPractice: false,
    additionalMistakeReview: false,
    revisionScheduleEnabled: null,
    allowNewHifz: null,
    lockProgression: false,
    strengtheningRequired: false,
    strengtheningArea: null,
    suggestedPagesDelta: null,
    suggestedMinutesDelta: null,
    capacityChangeReason: null,
    revisionPriority: false,
    recommendedRevisionPages: null,
    recommendedRevisionMinutes: null,
    recoveryRequired: false,
    recoveryScope: null,
    stabilityGatePassed: null,
    appliedRules: [],
    reasons: [],
    conflicts: [],
  };
}

function parseTrack(raw: string | undefined): DecisionTrack | null {
  if (!raw) return null;
  if (raw === "bottom_up") return "bottom_up";
  if (raw === "continue_from_last_surah") return "continue_from_last_surah";
  if (raw === "fragmented_revision_only") return "fragmented_revision_only";
  return null;
}

/**
 * Fold one ranked result into the accumulator (mutates acc).
 * Incoming values lose to harder locks via resolveScalarConflict.
 */
export function foldResult(
  acc: MergeAccumulator,
  ranked: RankedRuleResult
): void {
  const r = ranked.result;
  acc.appliedRules.push(r.ruleId);

  if (r.messageAr) {
    acc.reasons.push({
      code: "rule_message",
      ruleId: r.ruleId,
      message: r.messageAr,
      severity: r.severity,
    });
  }

  // --- newHifzEnabled ---
  const incomingHifz =
    r.overrides?.newHifzEnabled ?? metaBool(r, "newHifzEnabled");
  if (typeof incomingHifz === "boolean") {
    if (acc.newHifzEnabled === null) {
      acc.newHifzEnabled = incomingHifz;
      acc.reasons.push({
        code: "set_new_hifz",
        ruleId: r.ruleId,
        message: `newHifzEnabled := ${incomingHifz}`,
        severity: r.severity,
      });
      rememberSetter(acc, "new_hifz", r.ruleId, r.severity);
    } else if (acc.newHifzEnabled !== incomingHifz) {
      const currentSev = severityOfSetter(acc, "new_hifz", r);
      const res = resolveScalarConflict({
        kind: "new_hifz_enabled",
        current: {
          ruleId: lastSetter(acc, "new_hifz") ?? "unknown",
          value: acc.newHifzEnabled,
          severity: currentSev,
        },
        incoming: {
          ruleId: r.ruleId,
          value: incomingHifz,
          severity: r.severity,
        },
      });
      acc.newHifzEnabled = res.value;
      if (res.conflict) {
        acc.conflicts.push(res.conflict);
        acc.reasons.push({
          code: "conflict_new_hifz",
          ruleId: res.winnerRuleId,
          message: res.conflict.reason,
          severity: "hard",
        });
      }
      const winnerSev =
        res.winnerRuleId === r.ruleId ? r.severity : currentSev;
      rememberSetter(acc, "new_hifz", res.winnerRuleId, winnerSev);
    }
  }

  // disableNewMemorization meta → force false
  if (metaBool(r, "disableNewMemorization") === true) {
    applyHifzFalse(acc, r, "disableNewMemorization");
  }
  if (metaBool(r, "disableAutomaticNewMemorization") === true) {
    applyHifzFalse(acc, r, "disableAutomaticNewMemorization");
  }

  // revisionOnly
  const revOnly = metaBool(r, "revisionOnly");
  if (typeof revOnly === "boolean") {
    if (acc.revisionOnly === null) {
      acc.revisionOnly = revOnly;
      rememberSetter(acc, "revision_only", r.ruleId, r.severity);
    } else if (acc.revisionOnly !== revOnly) {
      const currentSev = severityOfSetter(acc, "revision_only", r);
      const res = resolveScalarConflict({
        kind: "revision_only",
        current: {
          ruleId: lastSetter(acc, "revision_only") ?? "unknown",
          value: acc.revisionOnly,
          severity: currentSev,
        },
        incoming: {
          ruleId: r.ruleId,
          value: revOnly,
          severity: r.severity,
        },
      });
      acc.revisionOnly = res.value;
      if (res.conflict) {
        acc.conflicts.push(res.conflict);
        acc.reasons.push({
          code: "conflict_revision_only",
          ruleId: res.winnerRuleId,
          message: res.conflict.reason,
          severity: "hard",
        });
      }
      const winnerSev =
        res.winnerRuleId === r.ruleId ? r.severity : currentSev;
      rememberSetter(acc, "revision_only", res.winnerRuleId, winnerSev);
    }
  }

  // revisionScheduleEnabled
  const revSched = metaBool(r, "revisionScheduleEnabled");
  if (typeof revSched === "boolean") {
    if (acc.revisionScheduleEnabled === null) {
      acc.revisionScheduleEnabled = revSched;
      rememberSetter(acc, "revision_schedule", r.ruleId, r.severity);
    } else if (acc.revisionScheduleEnabled !== revSched) {
      const currentSev = severityOfSetter(acc, "revision_schedule", r);
      const res = resolveScalarConflict({
        kind: "revision_schedule",
        current: {
          ruleId: lastSetter(acc, "revision_schedule") ?? "unknown",
          value: acc.revisionScheduleEnabled,
          severity: currentSev,
        },
        incoming: {
          ruleId: r.ruleId,
          value: revSched,
          severity: r.severity,
        },
      });
      acc.revisionScheduleEnabled = res.value;
      if (res.conflict) {
        acc.conflicts.push(res.conflict);
        acc.reasons.push({
          code: "conflict_revision_schedule",
          ruleId: res.winnerRuleId,
          message: res.conflict.reason,
          severity: "hard",
        });
      }
      const winnerSev =
        res.winnerRuleId === r.ruleId ? r.severity : currentSev;
      rememberSetter(acc, "revision_schedule", res.winnerRuleId, winnerSev);
    }
    // false is restrictive for "schedule enabled"
    if (revSched === false) {
      acc.revisionScheduleEnabled = false;
      acc.reasons.push({
        code: "revision_schedule_disabled",
        ruleId: r.ruleId,
        message: "Revision schedule disabled until first hifz session (Bible).",
        severity: r.severity,
      });
      rememberSetter(acc, "revision_schedule", r.ruleId, r.severity);
    }
  }

  if (metaBool(r, "requiresFirstHifzSessionBeforeRevision") === true) {
    acc.revisionScheduleEnabled = false;
  }

  // Capacity minutes
  if (typeof r.overrides?.dailyMinuteCapacity === "number") {
    mergeCapacity(
      acc,
      "daily_minute_capacity",
      "dailyMinuteCapacity",
      r.overrides.dailyMinuteCapacity,
      r
    );
  }

  // Capacity pages
  if (typeof r.overrides?.dailyPageCapacity === "number") {
    mergeCapacity(
      acc,
      "daily_page_capacity",
      "dailyPageCapacity",
      r.overrides.dailyPageCapacity,
      r
    );
  }

  // Boost flags (OR merge — any hard/soft true sticks)
  if (metaBool(r, "additionalListeningPractice") === true) {
    acc.additionalListeningPractice = true;
    acc.reasons.push({
      code: "listening_boost",
      ruleId: r.ruleId,
      message: "Additional listening practice enabled.",
      severity: r.severity,
    });
  }
  if (metaBool(r, "additionalMistakeReview") === true) {
    acc.additionalMistakeReview = true;
    acc.reasons.push({
      code: "mistake_review_boost",
      ruleId: r.ruleId,
      message: "Additional mistake review enabled.",
      severity: r.severity,
    });
  }

  // Track
  const track = parseTrack(metaString(r, "track"));
  if (track) {
    if (acc.track === "unspecified") {
      acc.track = track;
      acc.reasons.push({
        code: "set_track",
        ruleId: r.ruleId,
        message: `track := ${track}`,
        severity: r.severity,
      });
      rememberSetter(acc, "track", r.ruleId, r.severity);
    } else if (acc.track !== track) {
      // Hard scenario lock (fragmented / bottom_up from earlier hard) wins
      const currentSev = severityOfSetter(acc, "track", r);
      const res = resolveScalarConflict({
        kind: "track",
        current: {
          ruleId: lastSetter(acc, "track") ?? "unknown",
          value: acc.track,
          severity: currentSev,
        },
        incoming: {
          ruleId: r.ruleId,
          value: track,
          severity: r.severity,
        },
      });
      acc.track = res.value as DecisionTrack;
      if (res.conflict) {
        acc.conflicts.push(res.conflict);
        acc.reasons.push({
          code: "conflict_track",
          ruleId: res.winnerRuleId,
          message: res.conflict.reason,
          severity: "hard",
        });
      }
      const winnerSev =
        res.winnerRuleId === r.ruleId ? r.severity : currentSev;
      rememberSetter(acc, "track", res.winnerRuleId, winnerSev);
    }
  }

  // Track numeric meta (last write of same severity / first hard)
  const startSurah = metaNumber(r, "startSurah");
  if (typeof startSurah === "number") acc.startSurah = startSurah;
  const endSurah = metaNumber(r, "endSurah");
  if (typeof endSurah === "number") acc.endSurah = endSurah;
  const lastMem = metaNumber(r, "lastMemorizedSurah");
  if (typeof lastMem === "number" && lastMem > 0) {
    acc.lastMemorizedSurah = lastMem;
  }
  const cont = metaNumber(r, "continueAfterSurah");
  if (typeof cont === "number" && cont > 0) {
    acc.continueAfterSurah = cont;
  }
  // continueAfterSurah may be 0 when forcing Fatiha start
  if (metaNumber(r, "continueAfterSurah") === 0) {
    acc.continueAfterSurah = 0;
  }
  const forceSurah = metaNumber(r, "forcePointerSurah");
  if (typeof forceSurah === "number" && forceSurah >= 1) {
    acc.forcePointerSurah = forceSurah;
  }
  const forceAyah = metaNumber(r, "forcePointerAyah");
  if (typeof forceAyah === "number" && forceAyah >= 1) {
    acc.forcePointerAyah = forceAyah;
  }
  if (metaBool(r, "preferCompleteNearby") === true) {
    acc.preferCompleteNearby = true;
  }
  const contMode = metaString(r, "continuationMode");
  if (contMode) {
    acc.continuationMode = contMode;
  }

  // revisionCapacitySharePercent 100 implies revisionOnly pressure
  if (metaNumber(r, "revisionCapacitySharePercent") === 100) {
    if (acc.revisionOnly !== true) {
      acc.revisionOnly = true;
      acc.reasons.push({
        code: "revision_share_100",
        ruleId: r.ruleId,
        message: "100% capacity allocated to revision-related activities.",
        severity: r.severity,
      });
    }
  }

  // --- Progression layer meta (P-001…P-004) ---
  if (metaBool(r, "lockProgression") === true) {
    acc.lockProgression = true;
    acc.allowNewHifz = false;
    applyHifzFalse(acc, r, "lockProgression");
    acc.reasons.push({
      code: "lock_progression",
      ruleId: r.ruleId,
      message: metaString(r, "regressionReason") ?? "Progression locked.",
      severity: r.severity,
    });
  }

  if (metaBool(r, "strengtheningRequired") === true) {
    acc.strengtheningRequired = true;
    const area = metaString(r, "strengtheningArea");
    if (area) acc.strengtheningArea = area;
    acc.reasons.push({
      code: "strengthening_required",
      ruleId: r.ruleId,
      message:
        metaString(r, "strengtheningReason") ??
        "Strengthening required before progression.",
      severity: r.severity,
    });
  }

  const allow = metaBool(r, "allowNewHifz");
  if (typeof allow === "boolean") {
    if (acc.allowNewHifz === null) {
      acc.allowNewHifz = allow;
    } else if (acc.lockProgression || acc.strengtheningRequired) {
      acc.allowNewHifz = false;
    } else if (allow === false) {
      // Restrictive readiness wins among soft signals
      acc.allowNewHifz = false;
    }
    acc.reasons.push({
      code: allow ? "allow_new_hifz" : "deny_new_hifz",
      ruleId: r.ruleId,
      message: metaString(r, "readinessReason") ?? `allowNewHifz := ${allow}`,
      severity: r.severity,
    });
  }

  if (metaBool(r, "capacityIncreaseSuggested") === true) {
    const pagesDelta = metaNumber(r, "suggestedPagesDelta");
    const minutesDelta = metaNumber(r, "suggestedMinutesDelta");
    if (typeof pagesDelta === "number") {
      acc.suggestedPagesDelta =
        acc.suggestedPagesDelta == null
          ? pagesDelta
          : Math.max(acc.suggestedPagesDelta, pagesDelta);
    }
    if (typeof minutesDelta === "number") {
      acc.suggestedMinutesDelta =
        acc.suggestedMinutesDelta == null
          ? minutesDelta
          : Math.max(acc.suggestedMinutesDelta, minutesDelta);
    }
    acc.capacityChangeReason =
      metaString(r, "capacityChangeReason") ?? acc.capacityChangeReason;
    acc.reasons.push({
      code: "capacity_increase_suggested",
      ruleId: r.ruleId,
      message:
        metaString(r, "capacityChangeReason") ??
        "Soft capacity increase suggested.",
      severity: r.severity,
    });
  }

  // --- Revision structure layer (R-001…R-004) ---
  if (metaBool(r, "revisionPriority") === true) {
    acc.revisionPriority = true;
    acc.reasons.push({
      code: "revision_priority",
      ruleId: r.ruleId,
      message:
        metaString(r, "revisionPriorityReason") ??
        "Revision takes priority over new hifz.",
      severity: r.severity,
    });
  }

  const recPages = metaNumber(r, "recommendedRevisionPages");
  if (typeof recPages === "number") {
    acc.recommendedRevisionPages =
      acc.recommendedRevisionPages == null
        ? recPages
        : Math.max(acc.recommendedRevisionPages, recPages);
  }
  const recMins = metaNumber(r, "recommendedRevisionMinutes");
  if (typeof recMins === "number") {
    acc.recommendedRevisionMinutes =
      acc.recommendedRevisionMinutes == null
        ? recMins
        : Math.max(acc.recommendedRevisionMinutes, recMins);
  }
  if (typeof recPages === "number" || typeof recMins === "number") {
    acc.reasons.push({
      code: "revision_load",
      ruleId: r.ruleId,
      message:
        metaString(r, "revisionLoadReason") ??
        `recommendedRevision pages=${recPages ?? "?"} min=${recMins ?? "?"}`,
      severity: r.severity,
    });
  }

  if (metaBool(r, "recoveryRequired") === true) {
    acc.recoveryRequired = true;
    acc.revisionPriority = true;
    acc.lockProgression = true;
    acc.allowNewHifz = false;
    const scope = metaString(r, "recoveryScope");
    if (scope) acc.recoveryScope = scope;
    applyHifzFalse(acc, r, "recoveryRequired");
    acc.reasons.push({
      code: "recovery_required",
      ruleId: r.ruleId,
      message:
        metaString(r, "recoveryReason") ??
        "Forgotten content recovery required.",
      severity: r.severity,
    });
  }

  if (typeof metaBool(r, "stabilityGatePassed") === "boolean") {
    const passed = metaBool(r, "stabilityGatePassed") === true;
    // Any hard fail sticks; pass only if never failed
    if (acc.stabilityGatePassed === null) {
      acc.stabilityGatePassed = passed;
    } else if (!passed) {
      acc.stabilityGatePassed = false;
    }
    if (!passed) {
      acc.revisionPriority = true;
      acc.lockProgression = true;
      acc.allowNewHifz = false;
      applyHifzFalse(acc, r, "stabilityGateFailed");
    }
    acc.reasons.push({
      code: passed ? "stability_gate_passed" : "stability_gate_failed",
      ruleId: r.ruleId,
      message:
        metaString(r, "stabilityGateReason") ??
        (passed ? "Stability gate passed." : "Stability gate failed."),
      severity: r.severity,
    });
  }
}

function applyHifzFalse(
  acc: MergeAccumulator,
  r: RuleResult,
  code: string
): void {
  if (acc.newHifzEnabled === false) return;
  if (acc.newHifzEnabled === true) {
    const res = resolveScalarConflict({
      kind: "new_hifz_enabled",
      current: {
        ruleId: lastSetter(acc, "new_hifz") ?? "unknown",
        value: true,
        severity: severityOfSetter(acc, "new_hifz", r),
      },
      incoming: { ruleId: r.ruleId, value: false, severity: r.severity },
    });
    acc.newHifzEnabled = res.value;
    if (res.conflict) {
      acc.conflicts.push(res.conflict);
      acc.reasons.push({
        code: "conflict_" + code,
        ruleId: res.winnerRuleId,
        message: res.conflict.reason,
        severity: "hard",
      });
    }
  } else {
    acc.newHifzEnabled = false;
    acc.reasons.push({
      code,
      ruleId: r.ruleId,
      message: "New memorization disabled.",
      severity: r.severity,
    });
  }
  rememberSetter(acc, "new_hifz", r.ruleId, r.severity);
}

function mergeCapacity(
  acc: MergeAccumulator,
  kind: "daily_minute_capacity" | "daily_page_capacity",
  field: "dailyMinuteCapacity" | "dailyPageCapacity",
  incoming: number,
  r: RuleResult
): void {
  const current = acc[field];
  if (current === null) {
    acc[field] = incoming;
    acc.reasons.push({
      code: "set_" + field,
      ruleId: r.ruleId,
      message: `${field} := ${incoming}`,
      severity: r.severity,
    });
    rememberSetter(acc, field, r.ruleId, r.severity);
    return;
  }
  const res = resolveScalarConflict({
    kind,
    current: {
      ruleId: lastSetter(acc, field) ?? "unknown",
      value: current,
      severity: severityOfSetter(acc, field, r),
    },
    incoming: {
      ruleId: r.ruleId,
      value: incoming,
      severity: r.severity,
    },
  });
  acc[field] = res.value as number;
  if (res.conflict) {
    acc.conflicts.push(res.conflict);
    acc.reasons.push({
      code: "conflict_" + field,
      ruleId: res.winnerRuleId,
      message: res.conflict.reason,
      severity: "hard",
    });
  }
  rememberSetter(acc, field, res.winnerRuleId, r.severity);
}

// Track which rule last set a field (for conflict messages)
const setterStore = new WeakMap<
  MergeAccumulator,
  Map<string, { ruleId: string; severity: import("../../models").RuleSeverity }>
>();

function rememberSetter(
  acc: MergeAccumulator,
  key: string,
  ruleId: string,
  severity: import("../../models").RuleSeverity
): void {
  let m = setterStore.get(acc);
  if (!m) {
    m = new Map();
    setterStore.set(acc, m);
  }
  m.set(key, { ruleId, severity });
}

function lastSetter(acc: MergeAccumulator, key: string): string | undefined {
  return setterStore.get(acc)?.get(key)?.ruleId;
}

function severityOfSetter(
  acc: MergeAccumulator,
  key: string,
  fallback: RuleResult
): import("../../models").RuleSeverity {
  return setterStore.get(acc)?.get(key)?.severity ?? fallback.severity;
}

/**
 * Merge all ranked applied results into one accumulator.
 */
export function mergeRankedResults(
  rankedSorted: readonly RankedRuleResult[]
): MergeAccumulator {
  const acc = createEmptyAccumulator();
  // Process strongest first so first-writer is the hard lock
  for (const r of rankedSorted) {
    foldResult(acc, r);
  }
  return acc;
}
