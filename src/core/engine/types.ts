/**
 * Engine public contracts.
 * Implementations come in later phases — this file is architecture only.
 */

import type {
  MonthlyPlan,
  PlanningState,
  TodaysPlan,
  UserProfile,
  UserState,
  WeeklyPlan,
} from "../models";

/**
 * Input context for a planning query.
 * UI / adapters assemble this; the engine never reads React or localStorage.
 */
export interface PlanningRequest {
  profile: UserProfile;
  state: UserState;
  /** Calendar day the UI is asking about (YYYY-MM-DD) */
  asOfDate: string;
  /** Optional horizon overrides */
  options?: {
    weekLength?: number;
    monthLength?: number;
  };
}

/**
 * Output of a planning query.
 * Includes the plan and the advanced state (caller may persist it).
 */
export interface PlanningResponse<TPlan> {
  plan: TPlan;
  /** State after generating this plan (pointer advances on commit, later phase) */
  nextState: UserState;
  /** Planning machine snapshot used for this run */
  planningState: PlanningState;
}

/**
 * The only façade the application layer should depend on.
 *
 *   const { plan } = engine.getTodaysPlan(request);
 *
 * No planning logic lives outside IPlanningEngine implementations.
 */
export interface IPlanningEngine {
  /** "What is today's plan?" */
  getTodaysPlan(request: PlanningRequest): PlanningResponse<TodaysPlan>;

  getWeeklyPlan(request: PlanningRequest): PlanningResponse<WeeklyPlan>;

  getMonthlyPlan(request: PlanningRequest): PlanningResponse<MonthlyPlan>;
}

/**
 * Optional: commit that the user finished a day, advancing durable pointers.
 * Implemented in a later phase — contract only.
 */
export interface IPlanningStateStore {
  load(userId: string): UserState | null;
  save(state: UserState): void;
}
