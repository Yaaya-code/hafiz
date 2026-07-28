/**
 * Logic Bible — S-001 Weak Memorization Lock
 *
 * Explicit educational decision only. No scheduling. No plan generation.
 */

import type { RuleResult } from "../../models";
import type { IPlanningRule } from "../rule";
import type { RuleMetadata } from "../metadata";
import { RulePriorityBand } from "../metadata";
import type { RuleContext } from "../context";
import { ruleApplied, ruleNotApplied } from "../result-factory";
import {
  isStrengthenExistingGoal,
  isWeakRetention,
} from "./predicates";

export const S001_ID = "S-001";

const metadata: RuleMetadata = {
  id: S001_ID,
  name: "Weak Memorization Lock",
  description:
    "If retention is Weak OR the primary goal is Strengthen Existing Memorization: " +
    "disable all new memorization; allocate 100% of daily capacity to revision-related " +
    "activities; enable additional listening practice; enable additional mistake review. " +
    "Highest scenario priority.",
  category: "scenario",
  priority: RulePriorityBand.SCENARIO + 0, // highest among scenario rules
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "scenario", "S-001"],
  source: "Hafiz Logic Bible — Scenario Rules",
  version: 1,
};

/**
 * Full hard lock only when:
 * - user goal is explicitly revision/strengthen-only, OR
 * - retention is weak AND they set pagesPerDay = 0 (revision-only capacity)
 *
 * If they declared pagesPerDay > 0 (want new hifz) and goal is complete Quran,
 * do NOT zero new hifz — only boost revision and optionally reduce pages.
 */
function wantsNewHifz(ctx: RuleContext): boolean {
  const pages = ctx.profile.pagesPerDay;
  return typeof pages === "number" && pages > 0;
}

export const weakMemorizationLockRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const strengthenGoal = isStrengthenExistingGoal(ctx.profile);
    const weak = isWeakRetention(ctx.profile);
    if (!strengthenGoal && !weak) {
      return ruleNotApplied(
        S001_ID,
        "Retention is not Weak and goal is not Strengthen Existing Memorization."
      );
    }

    const minutes = Math.max(0, ctx.profile.dailyMinutes);
    const declaredPages = Math.max(0, ctx.profile.pagesPerDay || 0);

    // Hard lock: revision-only intent
    if (strengthenGoal || !wantsNewHifz(ctx)) {
      return ruleApplied(S001_ID, {
        severity: "hard",
        messageAr:
          "بما أن حفظك يحتاج لتقوية أو هدفك تثبيت المحفوظ، أوقفنا الحفظ الجديد مؤقتاً وخصّصنا كامل سعتك اليومية للمراجعة، مع زيادة الاستماع ومراجعة الأخطاء.",
        overrides: {
          newHifzEnabled: false,
          dailyMinuteCapacity: minutes,
          dailyPageCapacity: 0,
        },
        meta: {
          logicBibleId: S001_ID,
          ruleName: "Weak Memorization Lock",
          disableNewMemorization: true,
          revisionCapacitySharePercent: 100,
          additionalListeningPractice: true,
          additionalMistakeReview: true,
          newHifzEnabled: false,
          scenarioLock: true,
          mode: "hard_lock",
        },
      });
    }

    // Soft path: weak retention but user still wants new hifz (e.g. 1 page/day)
    // Strength 1 → half page minimum 0.25; strength 2 → keep declared pages.
    const strength = ctx.profile.memorizationStrength;
    const softPages =
      strength <= 1
        ? Math.max(0.25, Math.round(declaredPages * 0.5 * 4) / 4)
        : declaredPages;

    return ruleApplied(S001_ID, {
      severity: "soft",
      messageAr:
        "حفظك يحتاج تثبيتاً أكثر — نُبقي ورد الحفظ الجديد الذي اخترته ونزيد المراجعة والاستماع حتى لا يفلت المحفوظ.",
      overrides: {
        newHifzEnabled: true,
        dailyMinuteCapacity: minutes,
        dailyPageCapacity: softPages,
      },
      meta: {
        logicBibleId: S001_ID,
        ruleName: "Weak Memorization Lock",
        disableNewMemorization: false,
        revisionCapacitySharePercent: 70,
        additionalListeningPractice: true,
        additionalMistakeReview: true,
        newHifzEnabled: true,
        scenarioLock: false,
        mode: "soft_boost_revision",
        softPageCapacity: softPages,
      },
    });
  },
};
