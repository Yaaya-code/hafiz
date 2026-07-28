/**
 * P6 — Path Resolver: WHERE NEW_HIFZ continues.
 * Does not write Actual, does not order revision.
 */

import type { HafizProfile } from "@/lib/user-profile";
import {
  applyPathPreference,
  deriveMemorizationState,
} from "./memorization-map";
import type {
  ExternalAssignment,
  MemorizationMap,
  PathPreference,
  PathResolution,
  AyahPointer,
  UserIntent,
  UserIntentMode,
} from "./types";

export type PathResolverInput = {
  intent: UserIntent;
  map: MemorizationMap;
  /** Actual execution cursor when present */
  hifzCursor?: { surah: number; ayah: number } | null;
  externalAssignments?: ExternalAssignment[];
  /** Optional intelligence: prefer stabilize over advancing */
  preferStabilize?: boolean;
  profile?: HafizProfile | null;
};

/**
 * Resolve NEW_HIFZ continuation candidate (plan input only).
 */
export function resolveNewHifzPath(input: PathResolverInput): PathResolution {
  const mode: UserIntentMode = input.intent?.mode ?? inferMode(input);

  // EXTERNAL_TEACHER: assignment owns NEW_HIFZ
  if (mode === "EXTERNAL_TEACHER") {
    const active = (input.externalAssignments ?? []).find((a) => a.active);
    if (active) {
      return {
        mode,
        newHifzPointer: {
          surahId: active.surahId,
          ayah: active.fromAyah,
        },
        source: "external_assignment",
        reasonAr: active.teacherLabel
          ? `مسار معلمك: ${active.teacherLabel}`
          : "نبدأ المسار الذي اختاره معلمك",
        externalAssignmentId: active.id,
      };
    }
    // No assignment yet — still external mode, no invented path aggressive jump
    const derived = deriveMemorizationState(input.map);
    return {
      mode,
      newHifzPointer: derived.suggestedContinuePointer,
      source: derived.suggestedContinuePointer
        ? "incomplete_partial"
        : "from_scratch_default",
      reasonAr:
        "وضع المعلم: لا يوجد واجب نشط — نقترح استمراراً من الخريطة حتى يُضاف واجب",
    };
  }

  if (mode === "FROM_SCRATCH" || input.map.regions.length === 0) {
    // Product default: bottom-up Amma (existing product default)
    return {
      mode: "FROM_SCRATCH",
      newHifzPointer: { surahId: 114, ayah: 1 },
      source: "from_scratch_default",
      reasonAr: "مسار البداية من جزء عم (افتراضي المنتج)",
    };
  }

  // SYSTEM_GUIDED
  const derived = deriveMemorizationState(input.map);
  const preference: PathPreference =
    input.intent.pathPreference ??
    preferenceFromProfile(input.profile) ??
    "unset";

  // Middle-only / true ambiguity: honor preference or surface choices
  if (derived.ambiguity && derived.journeyShape === "middle_only") {
    if (preference && preference !== "unset") {
      const applied = applyPathPreference(derived, preference);
      return {
        mode: "SYSTEM_GUIDED",
        newHifzPointer: applied.pointer,
        source: "long_term_build",
        reasonAr: applied.reasonAr,
      };
    }
    return {
      mode: "SYSTEM_GUIDED",
      newHifzPointer: derived.suggestedContinuePointer,
      source: "ambiguous",
      reasonAr: derived.pathReasonAr,
      ambiguousAlternatives: derived.pathChoices?.map((c) => c.pointer),
    };
  }

  // Prefer Actual cursor if it is consistent with map continuation
  if (input.hifzCursor && !input.preferStabilize) {
    const c: AyahPointer = {
      surahId: input.hifzCursor.surah,
      ayah: input.hifzCursor.ayah,
    };
    if (isPlausibleContinue(c, derived)) {
      return {
        mode: "SYSTEM_GUIDED",
        newHifzPointer: c,
        source: "cursor_continue",
        reasonAr: "نكمل من حيث توقفت",
      };
    }
  }

  if (derived.incompletePartials.length > 0) {
    return {
      mode: "SYSTEM_GUIDED",
      newHifzPointer: derived.suggestedContinuePointer,
      source: "incomplete_partial",
      reasonAr: derived.pathReasonAr || "نكمل المقطع الناقص",
    };
  }

  if (
    derived.journeyShape === "early_forward" ||
    derived.journeyShape === "mixed_early_amma"
  ) {
    return {
      mode: "SYSTEM_GUIDED",
      newHifzPointer: derived.suggestedContinuePointer,
      source: "gap_fill",
      reasonAr: derived.pathReasonAr || "متابعة مسار الحفظ في المصحف",
    };
  }

  if (derived.journeyShape === "amma_bottom") {
    return {
      mode: "SYSTEM_GUIDED",
      newHifzPointer: derived.suggestedContinuePointer,
      source:
        derived.suggestedContinuePointer?.surahId === 2
          ? "long_term_build"
          : "from_scratch_default",
      reasonAr: derived.pathReasonAr,
    };
  }

  return {
    mode: "SYSTEM_GUIDED",
    newHifzPointer: derived.suggestedContinuePointer,
    source: "long_term_build",
    reasonAr: derived.pathReasonAr || "متابعة مسار الحفظ",
  };
}

function preferenceFromProfile(
  profile: HafizProfile | null | undefined
): PathPreference | null {
  if (!profile?.progressionMode) return null;
  if (profile.progressionMode === "from_start") return "mushaf_start";
  if (profile.progressionMode === "bottom_up") return "mushaf_end";
  if (profile.progressionMode === "continue_forward") return "continue_frontier";
  return null;
}

function inferMode(input: PathResolverInput): UserIntentMode {
  if (input.externalAssignments?.some((a) => a.active)) {
    return "EXTERNAL_TEACHER";
  }
  if (!input.map.regions.length) return "FROM_SCRATCH";
  // Profile progression hints
  if (input.profile?.progressionMode === "from_start") {
    return "SYSTEM_GUIDED";
  }
  return "SYSTEM_GUIDED";
}

/**
 * Trust Actual cursor only when it sits at/after the continue edge —
 * never when it is still inside already-declared memory (that causes
 * re-teaching Baqarah as NEW_HIFZ).
 */
function isPlausibleContinue(
  cursor: AyahPointer,
  derived: ReturnType<typeof deriveMemorizationState>
): boolean {
  if (cursor.surahId < 1 || cursor.surahId > 114) return false;

  // Incomplete partial: cursor must be at continueAt (or slightly past)
  for (const p of derived.incompletePartials) {
    if (cursor.surahId === p.surahId) {
      return cursor.ayah >= p.continueAt;
    }
  }

  const s = derived.suggestedContinuePointer;
  if (!s) return false;

  // Same surah as suggested: must be at/after suggested ayah
  if (cursor.surahId === s.surahId) {
    return cursor.ayah >= s.ayah;
  }

  // Later surah than suggested continue = real progress past the plan
  if (cursor.surahId > s.surahId) return true;

  // Earlier surah than suggested = stale bootstrap (e.g. 2:1 while map says 3:1)
  return false;
}

/**
 * Infer intent from profile when architecture state not yet seeded.
 */
export function inferUserIntentFromProfile(
  profile: HafizProfile
): UserIntent {
  const hasMem =
    (profile.memorizationSelection?.surahSelections?.length ?? 0) > 0 ||
    (profile.memorizationSelection?.juzSelections?.length ?? 0) > 0 ||
    Boolean(profile.memorizationSelection?.range);

  // Heuristic: if goals mention teacher — external; else map-based
  const goals = (profile.goals ?? []).join(" ");
  const teacher =
    /شيخ|معلم|محفظ|teacher/i.test(goals) ||
    /teacher/i.test(profile.learningStyle ?? "");

  let mode: UserIntentMode = "FROM_SCRATCH";
  if (teacher) mode = "EXTERNAL_TEACHER";
  else if (hasMem) mode = "SYSTEM_GUIDED";
  else mode = "FROM_SCRATCH";

  const pathPreference = preferenceFromProfile(profile) ?? "unset";

  return {
    mode,
    goalHint: profile.learningGoalId,
    pathPreference,
    updatedAt: new Date().toISOString(),
  };
}
