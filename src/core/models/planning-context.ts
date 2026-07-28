/**
 * Planning Context — sole input contract for the Logic Bible pipeline.
 *
 * Adapters produce this. The decision runner consumes only this shape.
 * No UI, storage, or network types here.
 */

import type { UserProfile } from "./user-profile";
import type { UserState } from "./user-state";

/**
 * Canonical bag for a decision (and later planning) run.
 *
 * asOfDate is a Date at the boundary; pure rules receive YYYY-MM-DD strings.
 */
export interface PlanningContext {
  profile: UserProfile;
  state: UserState;
  asOfDate: Date;
}
