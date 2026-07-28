/**
 * Logic Bible — P-001 Readiness For New Hifz
 *
 * Soft progression rule: whether the learner may start/continue new memorization.
 * Does not generate plans or schedules.
 */

import type { RuleResult } from "../../../models";
import type { IPlanningRule } from "../../rule";
import type { RuleMetadata } from "../../metadata";
import { RulePriorityBand } from "../../metadata";
import type { RuleContext } from "../../context";
import { ruleApplied } from "../../result-factory";
import {
  computeRevisionStability,
  computeSessionStability,
  effectiveStrengthScore,
  isReadyForNewHifz,
  recentMistakeCount,
  resolveDecisionSignals,
} from "./predicates";

export const P001_ID = "P-001";

const metadata: RuleMetadata = {
  id: P001_ID,
  name: "Readiness For New Hifz",
  description:
    "Determine whether the user is ready to start or continue new memorization " +
    "from strength, recent mistakes, revision stability, and the current Decision " +
    "(or prior scenario locks).",
  category: "hifz",
  priority: RulePriorityBand.HIFZ + 0,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "progression", "P-001", "readiness"],
  source: "Hafiz Logic Bible — Progression Rules",
  version: 1,
};

export const readinessForNewHifzRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const strength = effectiveStrengthScore(ctx.profile, ctx.state);
    const mistakeCount = recentMistakeCount(ctx.state.mistakes, ctx.asOfDate);
    const revision = computeRevisionStability(ctx.state);
    const sessions = computeSessionStability(ctx.state.sessions, ctx.asOfDate);
    const signals = resolveDecisionSignals(ctx.decision, ctx.priorResults);

    const decisionLocked =
      signals.lockProgression ||
      signals.newHifzEnabled === false ||
      signals.revisionOnly === true;

    const verdict = isReadyForNewHifz({
      strength,
      mistakeCount,
      revision,
      sessions,
      decisionLocked,
    });

    const wantsNewHifz =
      typeof ctx.profile.pagesPerDay === "number" && ctx.profile.pagesPerDay > 0;
    // Self-declared weak alone should not cancel an explicit pages/day request.
    const strengthOnlyNotReady =
      !verdict.ready &&
      !decisionLocked &&
      strength <= 2 &&
      mistakeCount === 0 &&
      !revision.unstable &&
      !sessions.unstable;
    const allow =
      verdict.ready || (wantsNewHifz && strengthOnlyNotReady);

    return ruleApplied(P001_ID, {
      severity: "soft",
      messageAr: allow
        ? wantsNewHifz && strengthOnlyNotReady
          ? "نُبقي ورد الحفظ الذي اخترته مع مراجعة أقوى لتثبيت المحفوظ."
          : "أنت جاهز لمتابعة الحفظ الجديد وفق مؤشرات القوة والاستقرار."
        : "لست جاهزاً بعد للحفظ الجديد؛ ثبّت المراجعة أولاً.",
      overrides: {
        newHifzEnabled: allow,
      },
      meta: {
        logicBibleId: P001_ID,
        ruleName: "Readiness For New Hifz",
        allowNewHifz: allow,
        newHifzEnabled: allow,
        readinessReason: verdict.reason,
        strengthScore: strength,
        recentMistakeCount: mistakeCount,
        revisionStable: revision.stable,
        sessionsConsistent: sessions.consistent,
        decisionSource: signals.source,
        ...(strengthOnlyNotReady && wantsNewHifz
          ? { mode: "soft_allow_with_pages" }
          : {}),
      },
    });
  },
};
