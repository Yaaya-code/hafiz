/**
 * Logic Bible — S-004 Capacity Lock
 *
 * Explicit educational decision only. No activity generation.
 *
 * Reads the user's available daily time and publishes a hard capacity ceiling.
 * Later scheduling phases must never exceed this total for:
 *   Revision + New Memorization + Listening + Quiz
 */

import type { RuleResult } from "../../models";
import type { IPlanningRule } from "../rule";
import type { RuleMetadata } from "../metadata";
import { RulePriorityBand } from "../metadata";
import type { RuleContext } from "../context";
import { ruleApplied, ruleNotApplied } from "../result-factory";

export const S004_ID = "S-004";

const metadata: RuleMetadata = {
  id: S004_ID,
  name: "Capacity Lock",
  description:
    "Read the user's available daily time. Never generate activities exceeding " +
    "the available time. The total estimated duration of Revision + New Memorization " +
    "+ Listening + Quiz must fit within the user's declared capacity.",
  category: "capacity",
  priority: RulePriorityBand.CAPACITY + 0,
  /** Runs after scenario rules so scenario overrides are already in priorResults */
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "capacity", "S-004"],
  source: "Hafiz Logic Bible — Scenario Rules",
  version: 1,
};

export const capacityLockRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const declared = ctx.profile.dailyMinutes;

    if (typeof declared !== "number" || Number.isNaN(declared)) {
      return ruleNotApplied(
        S004_ID,
        "dailyMinutes is missing or not a number — Capacity Lock cannot apply."
      );
    }

    // Floor at 0: zero capacity means no timed activities may be scheduled later
    const maxDailyMinutes = Math.max(0, Math.floor(declared));

    // Respect a harder minute cap already published by a prior applied rule (e.g. S-001)
    let effectiveCap = maxDailyMinutes;
    for (const [, prior] of ctx.priorResults) {
      if (
        prior.applied &&
        typeof prior.overrides?.dailyMinuteCapacity === "number"
      ) {
        effectiveCap = Math.min(
          effectiveCap,
          Math.max(0, prior.overrides.dailyMinuteCapacity)
        );
      }
    }

    return ruleApplied(S004_ID, {
      severity: "hard",
      messageAr:
        "سعة يومك " +
        effectiveCap +
        " دقيقة. مجموع المراجعة + الحفظ الجديد + الاستماع + الاختبار يجب ألا يتجاوز هذه السعة.",
      overrides: {
        dailyMinuteCapacity: effectiveCap,
      },
      meta: {
        logicBibleId: S004_ID,
        ruleName: "Capacity Lock",
        declaredDailyMinutes: maxDailyMinutes,
        effectiveDailyMinuteCap: effectiveCap,
        /** Explicit budget categories that must share this cap later */
        budgetIncludesRevision: true,
        budgetIncludesNewHifz: true,
        budgetIncludesListening: true,
        budgetIncludesQuiz: true,
        neverExceedCapacity: true,
      },
    });
  },
};
