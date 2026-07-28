/**
 * Seven procedurally distinct days — never a copy of day 1.
 */

import type { ISODate } from "./primitives";
import type { TodaysPlan } from "./todays-plan";

export interface WeeklyPlanDaySummary {
  dayIndex: number;
  date: ISODate;
  weekdayAr: string;
  isWeeklyAnchor: boolean;
  revisionLabelAr: string;
  newHifzLabelAr: string;
  dayNoteAr: string;
}

/**
 * Weekly horizon produced by the same stateful loop as the monthly plan.
 * Each day is independently advanced from rolling pointers.
 */
export interface WeeklyPlan {
  startDate: ISODate;
  endDate: ISODate;
  days: WeeklyPlanDaySummary[];
  /** Optional full slot detail if the engine materializes it */
  detailedDays?: TodaysPlan[];
  coachingMessageAr: string;
  scenarioId: string;
}
