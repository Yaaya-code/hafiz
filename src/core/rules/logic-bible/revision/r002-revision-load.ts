/**
 * Logic Bible — R-002 Revision Load
 *
 * Soft recommendation for revision pages/minutes relative to state & capacity.
 * Does not schedule activities.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied, ruleNotApplied } from "../../result-factory";
import {
  assessRevisionPriority,
  collectRevisionSignals,
  computeRevisionLoad,
  hasMemorizedCorpus,
} from "./predicates";

export const R002_ID = "R-002";

const metadata: RuleMetadata = {
  id: R002_ID,
  name: "Revision Load",
  description:
    "Recommend revision amount from memorized volume, weak areas, and daily capacity. " +
    "Soft recommendation only — never exceeds declared capacity.",
  category: "revision",
  priority: RulePriorityBand.REVISION + 30,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "revision", "R-002", "load"],
  source: "Hafiz Logic Bible — Revision Structure Rules",
  version: 1,
};

export const revisionLoadRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const signals = collectRevisionSignals(
      ctx.profile,
      ctx.state,
      ctx.asOfDate,
      ctx.decision,
      ctx.priorResults
    );

    // Beginners with zero corpus: still publish a minimal load when revision schedule
    // is eventually enabled; keep recommendation light.
    const priority = assessRevisionPriority(signals);
    const dailyMinutes =
      typeof ctx.profile.dailyMinutes === "number"
        ? ctx.profile.dailyMinutes
        : 0;

    if (dailyMinutes <= 0) {
      return ruleNotApplied(
        R002_ID,
        "dailyMinutes is zero or missing — no revision load to recommend."
      );
    }

    const load = computeRevisionLoad({
      signals,
      dailyMinutes,
      pagesPerDay: ctx.profile.pagesPerDay,
      priorityLevel: priority.level,
    });

    // If no memorization and load is effectively empty, skip
    if (!hasMemorizedCorpus(ctx.profile) && load.pages <= 0.25 && priority.level === "normal") {
      return ruleApplied(R002_ID, {
        severity: "soft",
        messageAr: "لا يوجد محفوظ كبير بعد؛ حمل المراجعة خفيف.",
        meta: {
          logicBibleId: R002_ID,
          ruleName: "Revision Load",
          recommendedRevisionPages: load.pages,
          recommendedRevisionMinutes: load.minutes,
          revisionLoadReason: load.reason,
          revisionPriorityLevel: priority.level,
          memorizedSurahCount: signals.memorizedSurahCount,
          weakSurahCount: signals.weakSurahCount,
        },
      });
    }

    return ruleApplied(R002_ID, {
      severity: "soft",
      messageAr:
        "يُقترح تخصيص حوالي " +
        load.pages +
        " صفحة / " +
        load.minutes +
        " دقيقة للمراجعة.",
      meta: {
        logicBibleId: R002_ID,
        ruleName: "Revision Load",
        recommendedRevisionPages: load.pages,
        recommendedRevisionMinutes: load.minutes,
        revisionLoadReason: load.reason,
        revisionPriorityLevel: priority.level,
        memorizedSurahCount: signals.memorizedSurahCount,
        weakSurahCount: signals.weakSurahCount,
      },
    });
  },
};
