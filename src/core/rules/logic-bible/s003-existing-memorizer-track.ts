/**
 * Logic Bible — S-003 Existing Memorizer Track
 *
 * Explicit educational decision only. No scheduling. No plan generation.
 *
 * Contiguity definition (explicit):
 * - Consecutive: declared surah numbers form one gap-free block [min…max],
 *   OR a single contiguous juz selection block.
 * - Fragmented: memorization exists but is not consecutive under that definition.
 */

import type { RuleResult } from "../../models";
import type { IPlanningRule } from "../rule";
import type { RuleMetadata } from "../metadata";
import { RulePriorityBand } from "../metadata";
import type { RuleContext } from "../context";
import { ruleApplied, ruleNotApplied } from "../result-factory";
import {
  collectMemorizedSurahNumbers,
  hasAnyMemorization,
  hasNoMemorizedQuran,
  isConsecutiveMemorization,
  isFragmentedMemorization,
  isJuzSelectionConsecutive,
  lastMemorizedSurah,
} from "./predicates";

export const S003_ID = "S-003";

const metadata: RuleMetadata = {
  id: S003_ID,
  name: "Existing Memorizer Track",
  description:
    "If the user already memorized Quran, determine the track from onboarding. " +
    "If memorization is consecutive, continue from the last memorized Surah. " +
    "If memorization is fragmented, disable automatic new memorization until " +
    "fragmented memorization is resolved; only revision is generated.",
  category: "scenario",
  priority: RulePriorityBand.SCENARIO + 20,
  prerequisites: [],
  enabledByDefault: true,
  tags: ["logic-bible", "scenario", "S-003", "existing-memorizer"],
  source: "Hafiz Logic Bible — Scenario Rules",
  version: 1,
};

function resolveContiguity(ctx: RuleContext): {
  hasMem: boolean;
  consecutive: boolean;
  fragmented: boolean;
  surahs: number[];
  lastSurah: number | null;
} {
  const sel = ctx.profile.memorizationSelection;
  if (hasNoMemorizedQuran(sel)) {
    return {
      hasMem: false,
      consecutive: false,
      fragmented: false,
      surahs: [],
      lastSurah: null,
    };
  }

  const surahs = collectMemorizedSurahNumbers(sel);

  // Surah/range path
  if (surahs.length > 0) {
    return {
      hasMem: true,
      consecutive: isConsecutiveMemorization(surahs),
      fragmented: isFragmentedMemorization(surahs),
      surahs,
      lastSurah: lastMemorizedSurah(surahs),
    };
  }

  // Juz-only path (no expanded surah list)
  const juzNums = (sel.juzSelections ?? []).map((j) => j.juz);
  if (juzNums.length > 0) {
    const consecutive = isJuzSelectionConsecutive(juzNums);
    return {
      hasMem: true,
      consecutive,
      fragmented: !consecutive,
      surahs: [],
      // Last surah unknown without juz→surah expansion
      lastSurah: null,
      maxJuz: Math.max(...juzNums),
    } as {
      hasMem: boolean;
      consecutive: boolean;
      fragmented: boolean;
      surahs: number[];
      lastSurah: number | null;
      maxJuz?: number;
    };
  }

  return {
    hasMem: hasAnyMemorization(sel),
    consecutive: false,
    fragmented: hasAnyMemorization(sel),
    surahs: [],
    lastSurah: null,
  };
}

export const existingMemorizerTrackRule: IPlanningRule = {
  metadata,

  evaluate(ctx: RuleContext): RuleResult {
    const sel = ctx.profile.memorizationSelection;
    if (hasNoMemorizedQuran(sel)) {
      return ruleNotApplied(
        S003_ID,
        "User has no memorized Quran — Existing Memorizer Track does not apply."
      );
    }

    const c = resolveContiguity(ctx);
    const juzNums = (sel.juzSelections ?? []).map((j) => j.juz);
    const maxJuz = juzNums.length ? Math.max(...juzNums) : undefined;

    // Progression preference from onboarding (explicit field — user may resolve fragmented map)
    const progressionMode = ctx.profile.progressionMode;

    // Fragmented + user already chose a path in onboarding → honor choice (soft)
    if (c.fragmented) {
      if (progressionMode === "from_start") {
        return ruleApplied(S003_ID, {
          severity: "soft",
          messageAr:
            "محفوظك متفرّق. اخترت المسار من الفاتحة — نتابع من HifzCursor (من البداية).",
          overrides: { newHifzEnabled: true },
          meta: {
            logicBibleId: S003_ID,
            ruleName: "Existing Memorizer Track",
            track: "continue_from_last_surah",
            memorizationShape: "fragmented",
            progressionMode,
            /** Executive: Generator must use application-resolved cursor only */
            continuationMode: "from_cursor",
            /** Observability only — not a position override */
            continueAfterSurah: c.lastSurah ?? 0,
            lastMemorizedSurah: c.lastSurah ?? 0,
            maxJuz: maxJuz ?? 0,
            newHifzEnabled: true,
            revisionOnly: false,
          },
        });
      }
      if (progressionMode === "bottom_up") {
        return ruleApplied(S003_ID, {
          severity: "soft",
          messageAr:
            "محفوظك متفرّق. اخترت المسار من جزء عمّ صعوداً — نتابع من HifzCursor.",
          overrides: { newHifzEnabled: true },
          meta: {
            logicBibleId: S003_ID,
            ruleName: "Existing Memorizer Track",
            track: "bottom_up",
            memorizationShape: "fragmented",
            progressionMode,
            continuationMode: "from_cursor",
            startSurah: 114,
            endSurah: 78,
            continueAfterSurah: c.lastSurah ?? 0,
            lastMemorizedSurah: c.lastSurah ?? 0,
            maxJuz: maxJuz ?? 0,
            newHifzEnabled: true,
            revisionOnly: false,
          },
        });
      }
      // Fragmented maps still allow NEW_HIFZ when the user wants to continue.
      // Position comes from HifzCursor (application), not max(surahNumber).
      const continueFrom = c.lastSurah;
      return ruleApplied(S003_ID, {
        severity: "soft",
        messageAr:
          progressionMode === "complete_nearby"
            ? "محفوظك متفرّق. نكمل من HifzCursor (مقاطع ناقصة أولاً)."
            : "محفوظك متفرّق. نتابع الحفظ من HifzCursor مع مراجعة الأولوية للأضعف.",
        overrides: { newHifzEnabled: true },
        meta: {
          logicBibleId: S003_ID,
          ruleName: "Existing Memorizer Track",
          track: "continue_from_last_surah",
          memorizationShape: "fragmented",
          progressionMode,
          continuationMode: "from_cursor",
          lastMemorizedSurah: continueFrom ?? 0,
          /** Observability: max declared surah — NOT a generator position */
          continueAfterSurah: continueFrom ?? 0,
          maxJuz: maxJuz ?? 0,
          newHifzEnabled: true,
          revisionOnly: false,
          preferCompleteNearby: progressionMode === "complete_nearby",
        },
      });
    }

    // Consecutive
    const continueFrom = c.lastSurah;

    // User may still force bottom_up or from_start on continuous corpus
    if (progressionMode === "bottom_up") {
      return ruleApplied(S003_ID, {
        severity: "soft",
        messageAr: "مسار جزء عمّ صعوداً — نتابع من HifzCursor.",
        overrides: { newHifzEnabled: true },
        meta: {
          logicBibleId: S003_ID,
          ruleName: "Existing Memorizer Track",
          track: "bottom_up",
          memorizationShape: "consecutive",
          progressionMode,
          continuationMode: "from_cursor",
          startSurah: 114,
          endSurah: 78,
          lastMemorizedSurah: continueFrom ?? 0,
          continueAfterSurah: continueFrom ?? 0,
          maxJuz: maxJuz ?? 0,
          newHifzEnabled: true,
        },
      });
    }
    if (progressionMode === "from_start") {
      return ruleApplied(S003_ID, {
        severity: "soft",
        messageAr: "اخترت البدء من الفاتحة — نتابع من HifzCursor.",
        overrides: { newHifzEnabled: true },
        meta: {
          logicBibleId: S003_ID,
          ruleName: "Existing Memorizer Track",
          track: "continue_from_last_surah",
          memorizationShape: "consecutive",
          progressionMode,
          continuationMode: "from_cursor",
          lastMemorizedSurah: continueFrom ?? 0,
          continueAfterSurah: continueFrom ?? 0,
          maxJuz: maxJuz ?? 0,
          newHifzEnabled: true,
        },
      });
    }

    return ruleApplied(S003_ID, {
      severity: "soft",
      messageAr:
        continueFrom != null
          ? "محفوظك متّصل. نكمل الحفظ من HifzCursor (تفسير: بعد سورة " +
            continueFrom +
            ")."
          : "محفوظك متّصل. نكمل من HifzCursor.",
      overrides: {
        // Does not force-enable if S-001 already disabled hifz;
        // later merge policy will respect hard locks.
        newHifzEnabled: true,
      },
      meta: {
        logicBibleId: S003_ID,
        ruleName: "Existing Memorizer Track",
        track: "continue_from_last_surah",
        memorizationShape: "consecutive",
        disableAutomaticNewMemorization: false,
        newHifzEnabled: true,
        revisionOnly: false,
        progressionMode,
        continuationMode: "from_cursor",
        lastMemorizedSurah: continueFrom ?? 0,
        /** Observability only — Generator must not relocate cursor from this */
        continueAfterSurah: continueFrom ?? 0,
        maxJuz: maxJuz ?? 0,
      },
    });
  },
};
