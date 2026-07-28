/**
 * Application-owned local persistence keys.
 * Kept separate from UI feature keys so orchestration storage is explicit.
 */

export const APP_STORAGE_KEYS = {
  /** Learning snapshot: userState + revisionMemory + plan cache */
  learningSnapshot: "hafiz_learning_snapshot_v1",
} as const;
