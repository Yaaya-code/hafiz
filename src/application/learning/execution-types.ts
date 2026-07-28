/**
 * Learning execution loop — event contracts for session → brain feedback.
 */

import type { AppDate, CommitDayProgressResult, TodayPlanResult } from "../types";

/** Review quality 0–5 (SM-2 style). <3 = fail, >=3 = success. */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export type SessionKind =
  | "revision"
  | "new_hifz"
  | "listening"
  | "quiz"
  | "reflect"
  | "mutashabihat"
  | "other";

export type SessionOutcome = "success" | "fail" | "partial" | "skipped";

/**
 * Expanded day progress events (application-owned).
 * PlanningService.commitDayProgress understands these.
 */
export type LearningProgressEvent =
  | {
      type: "plan_item_completed";
      planItemId: string;
      outcome: SessionOutcome;
      revisionMemoryId?: string;
      quality?: ReviewQuality;
      sessionKind?: SessionKind;
      date?: AppDate;
    }
  | {
      type: "review_outcome";
      revisionMemoryId: string;
      outcome: "success" | "fail";
      quality?: ReviewQuality;
      extraMistakes?: number;
      date?: AppDate;
    }
  | {
      type: "session_completed";
      sessionKind: SessionKind;
      planItemId?: string;
      revisionMemoryId?: string;
      outcome: SessionOutcome;
      quality?: ReviewQuality;
      surahNumber?: number;
      fromAyah?: number;
      toAyah?: number;
      durationMinutes?: number;
      date?: AppDate;
    }
  | {
      type: "mistake_recorded";
      surahNumber: number;
      ayahNumber?: number;
      pageNumber?: number;
      mistakeType?: string;
      difficulty?: number;
      note?: string;
      /** Optional: bump this memory unit’s mistakesCount */
      revisionMemoryId?: string;
      date?: AppDate;
      /** P7 — similar-ayah confusion context */
      confusedSurah?: number;
      confusedAyah?: number;
      nearSequence?: boolean;
    }
  | {
      type: "invalidate_plan_cache";
    };

export interface CommitProgressOptions {
  /** When true (default), replan after meaningful changes */
  autoReplan?: boolean;
  asOfDate?: AppDate | Date;
}

export interface CommitProgressResult extends CommitDayProgressResult {
  /** Fresh today plan when autoReplan ran */
  today?: TodayPlanResult;
}

export interface CompleteSessionInput {
  sessionKind: SessionKind;
  /** Journey / plan step id (also used for journey unlock) */
  planItemId?: string;
  revisionMemoryId?: string;
  outcome?: SessionOutcome;
  quality?: ReviewQuality;
  surahNumber?: number;
  fromAyah?: number;
  toAyah?: number;
  durationMinutes?: number;
  date?: AppDate;
  autoReplan?: boolean;
}

export interface RecordReviewInput {
  revisionMemoryId: string;
  outcome: "success" | "fail";
  quality?: ReviewQuality;
  extraMistakes?: number;
  date?: AppDate;
  autoReplan?: boolean;
}

export interface RecordMistakeInput {
  surahNumber: number;
  ayahNumber?: number;
  pageNumber?: number;
  type?: string;
  difficulty?: number;
  note?: string;
  revisionMemoryId?: string;
  date?: AppDate;
  confusedSurah?: number;
  confusedAyah?: number;
  nearSequence?: boolean;
  /** Default false — mistakes alone don’t always force full replan mid-session */
  autoReplan?: boolean;
}
