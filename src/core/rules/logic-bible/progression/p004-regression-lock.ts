/**
 * Logic Bible — P-004 Regression Lock
 *
 * Hard safety constraint: block progression when stability drops below threshold.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied, ruleNotApplied } from "../../result-factory";
import {
  assessRegression,
  computeRevisionStability,
  computeSessionStability,
  effectiveStrengthScore,
  recentMistakeCount,
} from "./predicates";

export const P004_ID = "P-004";

const metadata: RuleMetadata = {
  id: P004_ID,
  name: "Regression Lock",
  description:
    "Prevent progression when stability drops below a safe threshold. " +
    "Hard constraint over soft readiness / capacity recommendations.",
  category: "safety",
  /** After system band; runs before scenario (100) so hard lock is early in pipeline */
  priority: RulePriorityBand.SAFETY + 20,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "progression", "P-004", "regression", "safety"],
  source: "Hafiz Logic Bible — Progression Rules",
  version: 1,
};

export const regressionLockRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const strength = effectiveStrengthScore(ctx.profile, ctx.state);
    const mistakeCount = recentMistakeCount(ctx.state.mistakes, ctx.asOfDate);
    const revision = computeRevisionStability(ctx.state);
    const sessions = computeSessionStability(ctx.state.sessions, ctx.asOfDate);

    const verdict = assessRegression({
      strength,
      mistakeCount,
      sessions,
      revision,
    });

    if (!verdict.lock) {
      return ruleNotApplied(P004_ID, verdict.reason);
    }

    return ruleApplied(P004_ID, {
      severity: "hard",
      messageAr:
        "استقرار الحفظ انخفض: أوقفنا التقدّم مؤقتاً لحماية المحفوظ.",
      overrides: {
        newHifzEnabled: false,
        dailyPageCapacity: 0,
      },
      meta: {
        logicBibleId: P004_ID,
        ruleName: "Regression Lock",
        lockProgression: true,
        newHifzEnabled: false,
        regressionReason: verdict.reason,
        strengthScore: strength,
        recentMistakeCount: mistakeCount,
        revisionUnstable: revision.unstable,
        sessionsUnstable: sessions.unstable,
      },
    });
  },
};
