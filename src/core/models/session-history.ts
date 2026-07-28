/**
 * Append-only history of completed learner sessions.
 * Rules in later phases will read this; no scoring logic here.
 */

import type {
  AyahRange,
  ISODate,
  PlanSlotKind,
  SurahNumber,
  UserId,
} from "./primitives";

export type SessionOutcome = "completed" | "partial" | "skipped" | "failed";

export interface SessionRecord {
  id: string;
  userId: UserId;
  date: ISODate;
  kind: PlanSlotKind;
  /** What was practiced */
  target?: AyahRange;
  surahNumber?: SurahNumber;
  outcome: SessionOutcome;
  durationMinutes?: number;
  /** Optional free-form notes from later phases */
  notes?: string;
  createdAt: ISODate;
}

export interface SessionHistory {
  records: SessionRecord[];
  /** Cap for in-memory / snapshot retention (engine policy later) */
  maxRecords: number;
}
