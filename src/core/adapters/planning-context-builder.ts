/**
 * Assemble PlanningContext from app DTOs (mapping only).
 */

import type { PlanningContext } from "../models/planning-context";
import { adaptHafizProfileToUserProfile } from "./profile-adapter";
import { adaptAppProgressToUserState } from "./state-adapter";
import type {
  AppProgressSource,
  HafizProfileSource,
  ProfileAdapterOptions,
  StateAdapterOptions,
} from "./types";

export interface BuildPlanningContextInput {
  profile: HafizProfileSource | null | undefined;
  progress?: AppProgressSource | null;
  asOfDate?: Date | string;
  profileOptions?: ProfileAdapterOptions;
  stateOptions?: Omit<StateAdapterOptions, "profile" | "asOfDate">;
}

function toDate(d: Date | string | undefined): Date {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  if (typeof d === "string" && d.length > 0) {
    // Date-only YYYY-MM-DD → UTC noon to avoid TZ edge flips
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return new Date(`${d}T12:00:00.000Z`);
    }
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Build the sole Logic Pipeline input from app profile + progress.
 */
export function buildPlanningContext(
  input: BuildPlanningContextInput
): PlanningContext {
  const asOfDate = toDate(input.asOfDate);
  const profile = adaptHafizProfileToUserProfile(
    input.profile,
    input.profileOptions
  );
  const state = adaptAppProgressToUserState(input.progress, {
    ...input.stateOptions,
    profile,
    userId: input.stateOptions?.userId ?? profile.userId,
    asOfDate,
  });

  return {
    profile,
    state,
    asOfDate,
  };
}
