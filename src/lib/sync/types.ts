/**
 * Local-first progress snapshot exchanged with the API / Prisma layer.
 */

import type { HafizProfile } from "@/lib/user-profile";
import type {
  BookmarkItem,
  MistakeItem,
  NoteItem,
  StreakState,
  AchievementState,
} from "@/lib/user-activity";
import type { JourneyProgress } from "@/lib/journey-progress";
import type { SurahRecitationProgress } from "@/lib/quran/recitation-progress";
import type { AyahProgress } from "@/lib/quran/types";
import type { MemSessionStats } from "@/lib/memorization-store";
import type { ReaderPos } from "@/lib/reader-store";

/** Provenance stamp for Actual learning state (sync merge). */
export type LearningStateMetaCloud = {
  version: number;
  updatedAt: string;
  source:
    | "session_completed"
    | "review_outcome"
    | "sync_merge"
    | "plan_seed"
    | "bootstrap"
    | "unknown";
};

/**
 * Application LearningSnapshot for cloud restore.
 * Validated before merge/persist — not an opaque free-form blob.
 */
export type LearningSnapshotCloud = {
  version?: number;
  updatedAt?: string;
  /** Actual: cursor, sessions, queues */
  userState?: unknown;
  /** Actual: SRS bank */
  revisionMemory?: unknown[];
  /** Plan only — may be discarded after sync */
  planCache?: Record<string, unknown>;
  lastDecision?: unknown;
  cacheMeta?: unknown;
  loadAdjustment?: unknown;
  /** Forecast — discarded on merge; never Actual */
  lastForecastHint?: unknown;
  /** Phase 3: source of last Actual write */
  learningStateMeta?: LearningStateMetaCloud;
};

export type ProgressSnapshot = {
  version: 1;
  deviceId: string;
  updatedAt: string;
  profile: HafizProfile | null;
  journey: JourneyProgress | null;
  streak: StreakState | null;
  mistakes: MistakeItem[];
  bookmarks: BookmarkItem[];
  notes: NoteItem[];
  achievements: Record<string, AchievementState>;
  ayahProgress: Record<string, AyahProgress>;
  memStats: MemSessionStats | null;
  recitationProgress: Record<string, SurahRecitationProgress>;
  readerPos: ReaderPos | null;
  /** Application learning brain snapshot (SRS + userState) */
  learningSnapshot?: LearningSnapshotCloud | null;
};

export type SyncPushBody = {
  deviceId: string;
  /** Guest device key or authenticated user id */
  guestKey?: string;
  userId?: string;
  email?: string;
  name?: string;
  snapshot: ProgressSnapshot;
  clientVersion?: number;
};

export type SyncPullResult = {
  ok: boolean;
  mode: "local_only" | "cloud";
  synced: boolean;
  userId?: string;
  lastSyncedAt?: string;
  /** Server-merged snapshot to rehydrate localStorage when newer */
  snapshot?: ProgressSnapshot;
  message?: string;
  error?: string;
};
