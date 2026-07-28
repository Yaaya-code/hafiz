/**
 * Logic Bible — R-004 Revision Stability Gate
 *
 * Hard gate: block progression when revision stability is insufficient.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied } from "../../result-factory";
import {
  assessRecovery,
  assessStabilityGate,
  collectRevisionSignals,
  hasMemorizedCorpus,
} from "./predicates";

export const R004_ID = "R-004";

const metadata: RuleMetadata = {
  id: R004_ID,
  name: "Revision Stability Gate",
  description:
    "Prevent progression when revision stability is insufficient. " +
    "Hard constraint when the gate fails; soft info when it passes.",
  category: "revision",
  priority: RulePriorityBand.REVISION + 10,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "revision", "R-004", "stability-gate"],
  source: "Hafiz Logic Bible — Revision Structure Rules",
  version: 1,
};

export const revisionStabilityGateRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const signals = collectRevisionSignals(
      ctx.profile,
      ctx.state,
      ctx.asOfDate,
      ctx.decision,
      ctx.priorResults
    );
    const recovery = assessRecovery({
      signals,
      hasMemorization: hasMemorizedCorpus(ctx.profile),
    });
    // Also honor prior hard recovery if already evaluated
    let recoveryRequired = recovery.required;
    for (const [, prior] of ctx.priorResults) {
      if (prior.applied && prior.meta?.recoveryRequired === true) {
        recoveryRequired = true;
      }
    }

    const gate = assessStabilityGate({ signals, recoveryRequired });

    if (!gate.passed) {
      const wantsNewHifz =
        typeof ctx.profile.pagesPerDay === "number" &&
        ctx.profile.pagesPerDay > 0;
      // Soft fail when user still wants new hifz and recovery is only "declared weak"
      // without session mistakes (R-003 soft path already handled recoveryRequired).
      if (
        wantsNewHifz &&
        signals.mistakeCount === 0 &&
        !signals.sessions.unstable &&
        !signals.revision.unstable
      ) {
        return ruleApplied(R004_ID, {
          severity: "soft",
          messageAr:
            "نستمر في التثبيت اليومي مع ورد الحفظ — راقب الجودة قبل التوسّع.",
          overrides: {
            newHifzEnabled: true,
          },
          meta: {
            logicBibleId: R004_ID,
            ruleName: "Revision Stability Gate",
            stabilityGatePassed: true,
            stabilityGateReason: gate.reason,
            revisionPriority: true,
            revisionOnly: false,
            newHifzEnabled: true,
            lockProgression: false,
            strengthScore: signals.strength,
            revisionUnstable: signals.revision.unstable,
            recentMistakeCount: signals.mistakeCount,
            mode: "soft_with_new_hifz",
          },
        });
      }

      return ruleApplied(R004_ID, {
        severity: "hard",
        messageAr:
          "استقرار المراجعة غير كافٍ؛ أوقفنا التقدّم حتى تتحسّن المراجعة.",
        overrides: {
          newHifzEnabled: false,
        },
        meta: {
          logicBibleId: R004_ID,
          ruleName: "Revision Stability Gate",
          stabilityGatePassed: false,
          stabilityGateReason: gate.reason,
          revisionPriority: true,
          revisionOnly: true,
          newHifzEnabled: false,
          lockProgression: true,
          strengthScore: signals.strength,
          revisionUnstable: signals.revision.unstable,
          recentMistakeCount: signals.mistakeCount,
          mode: "hard_lock",
        },
      });
    }

    return ruleApplied(R004_ID, {
      severity: "info",
      messageAr: "استقرار المراجعة كافٍ لمتابعة المسار.",
      meta: {
        logicBibleId: R004_ID,
        ruleName: "Revision Stability Gate",
        stabilityGatePassed: true,
        stabilityGateReason: gate.reason,
        strengthScore: signals.strength,
        revisionStable: signals.revision.stable,
        recentMistakeCount: signals.mistakeCount,
      },
    });
  },
};
