/**
 * Internal brain state of the planning engine across days.
 * This is the rolling-pointer machine — not UI state.
 */

import type { ISODate, MushafPointer } from "./primitives";
import type { RevisionQueueItem } from "./revision-state";
import type { QuranSlice } from "./primitives";

/** Named planning scenarios the rule layer may select */
export type PlanningScenarioId =
  | "foundation_builder"
  | "continue_forward"
  | "from_start"
  | "balanced"
  | "unknown";

/**
 * Complete mutable planning machinery for sequential day generation.
 * generateFullPlan-style loops advance this object day by day.
 */
export interface PlanningState {
  scenarioId: PlanningScenarioId;

  /** Rolling new-hifz cursor */
  currentHifzPointer: MushafPointer;

  /** Near revision stack (recent hifz) */
  nearStack: RevisionQueueItem[];

  /** Far / foundation revision queue */
  farQueue: RevisionQueueItem[];
  farIndex: number;

  /** Current week accumulation of new hifz slices */
  weekHifzLog: QuranSlice[];

  /** How many days of the horizon have been generated in this run */
  generatedDayCount: number;

  /** Horizon start date for this planning run */
  horizonStartDate?: ISODate;

  /** Whether new hifz is allowed under the active scenario */
  hifzEnabled: boolean;

  /** Page capacity used by volume calculator */
  dailyPageCapacity: number;

  /** Last coaching message produced for the user */
  lastCoachingMessageAr?: string;
}
