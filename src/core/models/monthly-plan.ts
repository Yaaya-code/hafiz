/**
 * Thirty procedurally distinct days, groupable into weeks.
 * No static "week theme" templates — week cards summarize real day output.
 */

import type { ISODate } from "./primitives";
import type { WeeklyPlanDaySummary } from "./weekly-plan";

export interface MonthlyWeekCard {
  weekNumber: number;
  startDate: ISODate;
  endDate: ISODate;
  focusAr: string;
  detailAr: string;
  days: WeeklyPlanDaySummary[];
}

/**
 * Full monthly horizon from the stateful generator.
 */
export interface MonthlyPlan {
  startDate: ISODate;
  endDate: ISODate;
  dayCount: number;
  days: WeeklyPlanDaySummary[];
  weeks: MonthlyWeekCard[];
  coachingMessageAr: string;
  scenarioId: string;
  hifzEnabled: boolean;
}
