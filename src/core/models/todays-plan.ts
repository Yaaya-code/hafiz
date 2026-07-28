/**
 * The single answer the UI should request:
 *   engine.whatIsTodaysPlan(profile, state) → TodaysPlan
 */

import type { ISODate, PlanSlotKind, QuranSlice } from "./primitives";

export interface PlanSlot {
  id: string;
  order: number;
  kind: PlanSlotKind;
  titleAr: string;
  subtitleAr?: string;
  slice?: QuranSlice;
  estimatedMinutes: number;
  /** Opaque deep-link hint for UI routing (no UI logic) */
  actionHint?: string;
  teacherNoteAr?: string;
}

/**
 * Fully computed plan for one calendar day.
 * UI must not invent slots; it only renders this structure.
 */
export interface TodaysPlan {
  date: ISODate;
  dayIndexInHorizon: number;
  isWeeklyAnchor: boolean;

  slots: PlanSlot[];

  newHifz: QuranSlice | null;
  nearRevision: QuranSlice | null;
  farRevision: QuranSlice | null;

  totalEstimatedMinutes: number;

  /** Scenario-aware coaching for the dashboard */
  coachingMessageAr: string;

  /** Short balance / capacity note */
  balanceNoteAr: string;

  /** Engine scenario id that produced this plan */
  scenarioId: string;
}
