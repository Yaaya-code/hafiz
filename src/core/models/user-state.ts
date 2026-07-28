/**
 * Live operational state of a learner — mutates as sessions complete.
 * The engine advances this state; the UI only reads and reports events.
 */

import type { ISODate, UserId } from "./primitives";
import type { HifzState } from "./hifz-state";
import type { RevisionState } from "./revision-state";
import type { LearningState } from "./learning-state";
import type { SessionHistory } from "./session-history";
import type { MistakeHistory } from "./mistake-history";
import type { PlanningState } from "./planning-state";

/**
 * Aggregate runtime state for one user.
 * Persistable snapshot of everything the planning brain needs between days.
 */
export interface UserState {
  userId: UserId;

  /** Last calendar day the engine produced a plan for */
  lastPlannedDate?: ISODate;

  /** Consecutive active days (engine may update later) */
  streakDays: number;

  hifz: HifzState;
  revision: RevisionState;
  learning: LearningState;
  planning: PlanningState;

  sessions: SessionHistory;
  mistakes: MistakeHistory;

  /** Schema version for migrations of this snapshot */
  stateVersion: number;

  updatedAt: ISODate;
}
