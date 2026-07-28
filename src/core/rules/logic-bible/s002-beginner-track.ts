/**
 * Logic Bible — S-002 Beginner Track
 *
 * Explicit educational decision only. No scheduling. No plan generation.
 */

import type { RuleResult } from "../../models";
import type { IPlanningRule } from "../rule";
import type { RuleMetadata } from "../metadata";
import { RulePriorityBand } from "../metadata";
import type { RuleContext } from "../context";
import { ruleApplied, ruleNotApplied } from "../result-factory";
import { hasNoMemorizedQuran } from "./predicates";

export const S002_ID = "S-002";

/** Explicit Bible direction: An-Nas (114) → An-Naba (78), bottom-up. */
export const BEGINNER_TRACK = {
  direction: "bottom_up" as const,
  startSurah: 114, // الناس
  endSurah: 78, // النبأ
  region: "juz_amma" as const,
};

const metadata: RuleMetadata = {
  id: S002_ID,
  name: "Beginner Track",
  description:
    "If the user has no memorized Quran, start from Juz Amma. " +
    "Initial memorization direction is An-Nas → An-Naba (bottom-up). " +
    "No revision schedule exists until the first memorization session is completed.",
  category: "scenario",
  priority: RulePriorityBand.SCENARIO + 10,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "scenario", "S-002", "beginner"],
  source: "Hafiz Logic Bible — Scenario Rules",
  version: 1,
};

export const beginnerTrackRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    if (!hasNoMemorizedQuran(ctx.profile.memorizationSelection)) {
      return ruleNotApplied(
        S002_ID,
        "User already has memorized Quran declared — Beginner Track does not apply."
      );
    }

    return ruleApplied(S002_ID, {
      severity: "hard",
      messageAr:
        "أنت تبدأ من الصفر: المسار من جزء عمّ، من سورة الناس صعوداً إلى سورة النبأ. لا جدول مراجعة حتى تُكمل أول جلسة حفظ.",
      overrides: {
        // Beginner may still receive new hifz unless S-001 also locked it.
        // This rule does not force-enable hifz; it only sets the track.
      },
      meta: {
        logicBibleId: S002_ID,
        ruleName: "Beginner Track",
        track: BEGINNER_TRACK.direction,
        startSurah: BEGINNER_TRACK.startSurah,
        endSurah: BEGINNER_TRACK.endSurah,
        region: BEGINNER_TRACK.region,
        /** Explicit: no revision schedule until first hifz session completed */
        revisionScheduleEnabled: false,
        requiresFirstHifzSessionBeforeRevision: true,
      },
    });
  },
};
