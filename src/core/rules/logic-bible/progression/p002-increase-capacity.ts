/**
 * Logic Bible — P-002 Capacity Increase
 *
 * Soft progression recommendation when performance is consistently strong.
 * Never raises the hard S-004 ceiling; only publishes a suggested delta.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied, ruleNotApplied } from "../../result-factory";
import {
  computeRevisionStability,
  computeSessionStability,
  effectiveStrengthScore,
  recentMistakeCount,
  resolveDecisionSignals,
  shouldIncreaseCapacity,
} from "./predicates";

export const P002_ID = "P-002";

const metadata: RuleMetadata = {
  id: P002_ID,
  name: "Capacity Increase",
  description:
    "Suggest a capacity increase only after consistent performance, successful " +
    "revision stability, and a low mistake rate. Soft recommendation — does not " +
    "override hard capacity locks.",
  category: "capacity",
  /** After hard capacity lock (S-004 at CAPACITY+0) */
  priority: RulePriorityBand.CAPACITY + 50,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "progression", "P-002", "capacity"],
  source: "Hafiz Logic Bible — Progression Rules",
  version: 1,
};

export const increaseCapacityRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const strength = effectiveStrengthScore(ctx.profile, ctx.state);
    const mistakeCount = recentMistakeCount(ctx.state.mistakes, ctx.asOfDate);
    const revision = computeRevisionStability(ctx.state);
    const sessions = computeSessionStability(ctx.state.sessions, ctx.asOfDate);
    const signals = resolveDecisionSignals(ctx.decision, ctx.priorResults);

    const progressionLocked =
      signals.lockProgression ||
      signals.newHifzEnabled === false ||
      signals.revisionOnly === true;

    const verdict = shouldIncreaseCapacity({
      strength,
      mistakeCount,
      sessions,
      revision,
      progressionLocked,
    });

    if (!verdict.increase) {
      return ruleNotApplied(P002_ID, verdict.reason);
    }

    return ruleApplied(P002_ID, {
      severity: "soft",
      messageAr:
        "أداؤك مستقر: يمكن زيادة سعة الحفظ تدريجياً (اقتراح ناعم ضمن سقف السعة).",
      // Do NOT set overrides.dailyMinuteCapacity — hard S-004 owns the ceiling.
      meta: {
        logicBibleId: P002_ID,
        ruleName: "Capacity Increase",
        capacityIncreaseSuggested: true,
        suggestedPagesDelta: verdict.pagesDelta,
        suggestedMinutesDelta: verdict.minutesDelta,
        capacityChangeReason: verdict.reason,
        strengthScore: strength,
        recentMistakeCount: mistakeCount,
        sessionsCompleted: sessions.completed,
      },
    });
  },
};
