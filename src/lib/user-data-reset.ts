/**
 * Wipe all local user progress so account switches never leak data.
 * Preserves device id only (anonymous sync identity).
 */

import {
  STORAGE_KEYS,
  isBrowser,
  safeRemoveItem,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";
import { APP_STORAGE_KEYS } from "@/application/persistence/keys";

/** Keys that must never be wiped (stable device identity). */
const PRESERVE_KEYS = new Set<string>([STORAGE_KEYS.deviceId]);

/**
 * Extra feature keys not yet on STORAGE_KEYS but still user-owned.
 * Keep this list exhaustive — any user progress key belongs here.
 */
export const EXTRA_USER_STORAGE_KEYS = [
  APP_STORAGE_KEYS.learningSnapshot,
  "hafiz_mutashabihat_progress_v1",
  "hafiz_reader_bookmarks_v1",
  "hafiz_reader_notes_v1",
] as const;

/**
 * Remove every local progress key except device id.
 * Emits storage events so live UI re-reads empty state.
 */
export function clearLocalUserData(): void {
  if (!isBrowser()) return;

  for (const key of Object.values(STORAGE_KEYS)) {
    if (PRESERVE_KEYS.has(key)) continue;
    safeRemoveItem(key);
  }

  for (const key of EXTRA_USER_STORAGE_KEYS) {
    safeRemoveItem(key);
  }

  // Notify all listeners that used to watch these stores
  emitStorageEvent("hafiz-profile-updated", null);
  emitStorageEvent("hafiz-activity");
  emitStorageEvent("hafiz-mem-updated");
  emitStorageEvent("hafiz-journey-updated");
  emitStorageEvent("hafiz-recitation-progress");
  emitStorageEvent("hafiz-learning-snapshot-updated", null);
  emitStorageEvent("hafiz-user-data-cleared");
}

/**
 * True when localStorage is bound to a cloud account id.
 * Guests have empty / missing cloudUserId.
 */
export function isAccountBoundLocally(): boolean {
  if (!isBrowser()) return false;
  try {
    const id = localStorage.getItem(STORAGE_KEYS.cloudUserId);
    return Boolean(id && id.trim().length > 0);
  } catch {
    return false;
  }
}
