/**
 * Logic Bible — R-001 Revision Priority
 *
 * Soft/elevated structure rule: whether revision takes priority over new hifz.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied } from "../../result-factory";
import {
  assessRevisionPriority,
  collectRevisionSignals,
} from "./predicates";

export const R001_ID = "R-001";

const metadata: RuleMetadata = {
  id: R001_ID,
  name: "Revision Priority",
  description:
    "Determine whether revision takes priority over new memorization " +
    "from strength, mistakes, stability, and existing decision locks.",
  category: "revision",
  priority: RulePriorityBand.REVISION + 20,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "revision", "R-001", "priority"],
  source: "Hafiz Logic Bible — Revision Structure Rules",
  version: 1,
};

export const revisionPriorityRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const signals = collectRevisionSignals(
      ctx.profile,
      ctx.state,
      ctx.asOfDate,
      ctx.decision,
      ctx.priorResults
    );
    const verdict = assessRevisionPriority(signals);

    const critical = verdict.level === "critical";
    const wantsNewHifz =
      typeof ctx.profile.pagesPerDay === "number" && ctx.profile.pagesPerDay > 0;

    // Critical priority = more revision share in load, NOT kill NEW_HIFZ
    // when user declared pages/day. Hard locks remain R-003/R-004/P/S-001 hard.
    return ruleApplied(R001_ID, {
      severity: "soft",
      messageAr: verdict.priority
        ? "المراجعة لها الأولوية الآن — مع الإبقاء على ورد الحفظ إن طلبته."
        : "المراجعة متوازنة مع الحفظ الجديد.",
      overrides: undefined,
      meta: {
        logicBibleId: R001_ID,
        ruleName: "Revision Priority",
        revisionPriority: verdict.priority,
        revisionPriorityLevel: verdict.level,
        revisionPriorityReason: verdict.reason,
        // Never set revisionOnly/newHifzEnabled false here when user wants pages
        ...(critical && !wantsNewHifz
          ? { revisionOnly: true, newHifzEnabled: false }
          : {}),
        strengthScore: signals.strength,
        recentMistakeCount: signals.mistakeCount,
      },
    });
  },
};
