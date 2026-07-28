/**
 * Shared onboarding types (safe for client + server imports).
 * Keep outside "use server" files so clients can import types freely.
 */

import type { LearningStyle, MemorizationSelection } from "@/lib/quran/types";

export type JourneyAnswers = {
  displayName?: string;
  relationship?: string;
  motivation?: string;
  motivationCustom?: string;
  feeling?: string;
  habitTime?: string;
  topChallenge?: string;
  /**
   * After selecting memorized range:
   * - continue_forward: after last continuous block
   * - from_start: Fatiha → Nas
   * - bottom_up: Nas upward (Juz Amma path)
   * - complete_nearby: fill unfinished partial ranges first
   */
  progressionMode?:
    | "continue_forward"
    | "from_start"
    | "bottom_up"
    | "complete_nearby";
};

export type OnboardingPayload = {
  pagesPerDay: number;
  /** Separate revision capacity (pages/day) */
  revisionPagesPerDay?: number;
  revisionSessionsPerDay: number;
  dailyMinutes: number;
  memorizationStrength: 1 | 2 | 3 | 4 | 5;
  revisionStyle: "intensive" | "balanced" | "light";
  goals: string[];
  learningGoalId?: "complete_quran" | "selected_surahs" | "revision_only" | string;
  journey?: JourneyAnswers;
  memorizationSelection: MemorizationSelection;
  learningStyle?: LearningStyle;
  preferredQariId?: string;
  /** Explicit progression choice (also stored on journey) */
  progressionMode?:
    | "continue_forward"
    | "from_start"
    | "bottom_up"
    | "complete_nearby";
  /** Multi-track onboarding */
  usageTrack?: "AUTOMATIC_PLAN" | "EXTERNAL_TRACKER" | "FREE_EXPLORER";
  hasActivePlan?: boolean;
  hifzStartPreference?:
    | "START_FROM_BEGINNING"
    | "START_FROM_REVERSE"
    | "START_FROM_CUSTOM_SURAH"
    | "CONTINUE_FORWARD";
  customStartSurah?: number;
};
