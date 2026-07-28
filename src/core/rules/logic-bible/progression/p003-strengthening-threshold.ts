/**
 * Logic Bible — P-003 Strengthening Threshold
 *
 * Detects when memorized material needs strengthening before further progression.
 * When required: hard signal to prefer revision over new hifz.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied, ruleNotApplied } from "../../result-factory";
import {
  assessStrengthening,
  computeRevisionStability,
  dominantMistakeSurah,
  effectiveStrengthScore,
  recentMistakeCount,
  resolveDecisionSignals,
} from "./predicates";

export const P003_ID = "P-003";

const metadata: RuleMetadata = {
  id: P003_ID,
  name: "Strengthening Threshold",
  description:
    "Detect whether memorized content needs strengthening before progression. " +
    "Outputs strengtheningRequired, affected area, and reason.",
  category: "revision",
  priority: RulePriorityBand.REVISION + 0,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "progression", "P-003", "strengthening"],
  source: "Hafiz Logic Bible — Progression Rules",
  version: 1,
};

export const strengtheningThresholdRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const strength = effectiveStrengthScore(ctx.profile, ctx.state);
    const mistakeCount = recentMistakeCount(ctx.state.mistakes, ctx.asOfDate);
    const revision = computeRevisionStability(ctx.state);
    const dominantSurah = dominantMistakeSurah(ctx.state.mistakes, ctx.asOfDate);
    const signals = resolveDecisionSignals(ctx.decision, ctx.priorResults);

    // Scenario lock alone is already handled by scenario rules; P-003 focuses on
    // strength/mistake/revision thresholds. Still note decision lock as area.
    const decisionLocked =
      signals.lockProgression || signals.newHifzEnabled === false;

    const verdict = assessStrengthening({
      strength,
      mistakeCount,
      revision,
      dominantSurah,
      // Only treat scenario lock as strengthening if strength/mistakes are also weak,
      // OR if strength is weak — avoid double-counting pure scenario locks without issues.
      decisionLocked: decisionLocked && strength <= 3,
    });

    if (!verdict.required) {
      return ruleNotApplied(P003_ID, verdict.reason);
    }

    const wantsNewHifz =
      typeof ctx.profile.pagesPerDay === "number" && ctx.profile.pagesPerDay > 0;
    // Self-declared weak alone (no mistakes / unstable revision): soft advice only.
    // Do not hard-kill NEW_HIFZ when the user asked for pages/day.
    const evidenceHeavy =
      mistakeCount > 0 ||
      revision.unstable ||
      verdict.area === "specific_surah" ||
      verdict.area === "revision_queue";

    if (wantsNewHifz && !evidenceHeavy && verdict.area === "overall_retention") {
      return ruleApplied(P003_ID, {
        severity: "soft",
        messageAr:
          "المحفوظ يحتاج تثبيتاً منتظماً — نزيد المراجعة مع الإبقاء على ورد الحفظ الذي اخترته.",
        overrides: {
          // keep new hifz; plan layer already boosts revision share
          newHifzEnabled: true,
        },
        meta: {
          logicBibleId: P003_ID,
          ruleName: "Strengthening Threshold",
          strengtheningRequired: false,
          strengtheningArea: verdict.area,
          strengtheningReason: verdict.reason,
          affectedSurah: dominantSurah ?? 0,
          newHifzEnabled: true,
          strengthScore: strength,
          recentMistakeCount: mistakeCount,
          mode: "soft_with_new_hifz",
        },
      });
    }

    return ruleApplied(P003_ID, {
      severity: "hard",
      messageAr:
        "المحفظ يحتاج إلى تثبيت قبل التقدّم في الحفظ الجديد.",
      overrides: {
        newHifzEnabled: false,
      },
      meta: {
        logicBibleId: P003_ID,
        ruleName: "Strengthening Threshold",
        strengtheningRequired: true,
        strengtheningArea: verdict.area,
        strengtheningReason: verdict.reason,
        affectedSurah: dominantSurah ?? 0,
        newHifzEnabled: false,
        strengthScore: strength,
        recentMistakeCount: mistakeCount,
        mode: "hard_lock",
      },
    });
  },
};
