/**
 * Logic Bible — R-003 Forgotten Content Recovery
 *
 * Hard lock when previously memorized content needs recovery before progression.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied, ruleNotApplied } from "../../result-factory";
import {
  assessRecovery,
  collectRevisionSignals,
  hasMemorizedCorpus,
} from "./predicates";

export const R003_ID = "R-003";

const metadata: RuleMetadata = {
  id: R003_ID,
  name: "Forgotten Content Recovery",
  description:
    "Detect when previously memorized content requires recovery before progression. " +
    "Hard constraint when recovery is required.",
  category: "revision",
  /** Early in revision band — recovery before load recommendations */
  priority: RulePriorityBand.REVISION + 0,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "revision", "R-003", "recovery"],
  source: "Hafiz Logic Bible — Revision Structure Rules",
  version: 1,
};

export const forgottenContentRecoveryRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const signals = collectRevisionSignals(
      ctx.profile,
      ctx.state,
      ctx.asOfDate,
      ctx.decision,
      ctx.priorResults
    );
    const hasMem = hasMemorizedCorpus(ctx.profile);
    const verdict = assessRecovery({ signals, hasMemorization: hasMem });

    if (!verdict.required) {
      return ruleNotApplied(R003_ID, verdict.reason);
    }

    const wantsNewHifz =
      typeof ctx.profile.pagesPerDay === "number" && ctx.profile.pagesPerDay > 0;
    // Declared weak / broad weak retention without session mistakes: soft —
    // keep NEW_HIFZ if user chose pages/day (complete-Quran path).
    const softOnly =
      wantsNewHifz &&
      signals.mistakeCount === 0 &&
      !signals.sessions.unstable &&
      (verdict.scope === "weak_surahs" || verdict.scope === "broad_corpus");

    if (softOnly) {
      return ruleApplied(R003_ID, {
        severity: "soft",
        messageAr:
          "هناك مواضع تحتاج تثبيتاً — نراجعها أولاً يومياً مع الإبقاء على ورد الحفظ الجديد.",
        overrides: {
          newHifzEnabled: true,
        },
        meta: {
          logicBibleId: R003_ID,
          ruleName: "Forgotten Content Recovery",
          recoveryRequired: false,
          recoveryScope: verdict.scope,
          recoveryReason: verdict.reason,
          revisionPriority: true,
          revisionOnly: false,
          newHifzEnabled: true,
          lockProgression: false,
          strengthScore: signals.strength,
          weakSurahCount: signals.weakSurahCount,
          recentMistakeCount: signals.mistakeCount,
          mode: "soft_with_new_hifz",
        },
      });
    }

    return ruleApplied(R003_ID, {
      severity: "hard",
      messageAr:
        "هناك محفوظ يحتاج استرجاعاً قبل التقدّم في الحفظ الجديد.",
      overrides: {
        newHifzEnabled: false,
      },
      meta: {
        logicBibleId: R003_ID,
        ruleName: "Forgotten Content Recovery",
        recoveryRequired: true,
        recoveryScope: verdict.scope,
        recoveryReason: verdict.reason,
        revisionPriority: true,
        revisionOnly: true,
        newHifzEnabled: false,
        lockProgression: true,
        strengthScore: signals.strength,
        weakSurahCount: signals.weakSurahCount,
        recentMistakeCount: signals.mistakeCount,
        mode: "hard_lock",
      },
    });
  },
};
