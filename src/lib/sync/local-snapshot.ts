/**
 * Collect / apply full localStorage progress snapshot (client only).
 */

import {
  STORAGE_KEYS,
  getOrCreateDeviceId,
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";
import { getDefaultProfile, type HafizProfile } from "@/lib/user-profile";
import type {
  LearningSnapshotCloud,
  ProgressSnapshot,
} from "@/lib/sync/types";
import type {
  AchievementState,
  BookmarkItem,
  MistakeItem,
  NoteItem,
  StreakState,
} from "@/lib/user-activity";
import type { JourneyProgress } from "@/lib/journey-progress";
import type { AyahProgress } from "@/lib/quran/types";
import type { MemSessionStats } from "@/lib/memorization-store";
import type { SurahRecitationProgress } from "@/lib/quran/recitation-progress";
import type { ReaderPos } from "@/lib/reader-store";
import { APP_STORAGE_KEYS } from "@/application/persistence/keys";
import {
  mergeLearningSnapshots,
  mergeUserIntent,
  isForecastOnlyLearningSnapshot,
  stripForecast,
  validateLearningSnapshotCloud,
} from "@/lib/sync/learning-merge";

export function collectLocalSnapshot(): ProgressSnapshot {
  const deviceId = getOrCreateDeviceId();
  if (!isBrowser()) {
    return emptySnapshot(deviceId);
  }

  return {
    version: 1,
    deviceId,
    updatedAt: new Date().toISOString(),
    profile: safeGetJSON<HafizProfile | null>(STORAGE_KEYS.profile, null),
    journey: safeGetJSON<JourneyProgress | null>(STORAGE_KEYS.journey, null),
    streak: safeGetJSON<StreakState | null>(STORAGE_KEYS.streak, null),
    mistakes: safeGetJSON<MistakeItem[]>(STORAGE_KEYS.mistakes, []),
    bookmarks: safeGetJSON<BookmarkItem[]>(STORAGE_KEYS.bookmarks, []),
    notes: safeGetJSON<NoteItem[]>(STORAGE_KEYS.notes, []),
    achievements: safeGetJSON<Record<string, AchievementState>>(
      STORAGE_KEYS.achievements,
      {}
    ),
    ayahProgress: safeGetJSON<Record<string, AyahProgress>>(
      STORAGE_KEYS.ayahProgress,
      {}
    ),
    memStats: safeGetJSON<MemSessionStats | null>(STORAGE_KEYS.memStats, null),
    recitationProgress: safeGetJSON<Record<string, SurahRecitationProgress>>(
      STORAGE_KEYS.recitation,
      {}
    ),
    readerPos: safeGetJSON<ReaderPos | null>(STORAGE_KEYS.readerPos, null),
    learningSnapshot: safeGetJSON<LearningSnapshotCloud | null>(
      APP_STORAGE_KEYS.learningSnapshot,
      null
    ),
  };
}

export function emptySnapshot(deviceId = "ssr"): ProgressSnapshot {
  return {
    version: 1,
    deviceId,
    updatedAt: new Date(0).toISOString(),
    profile: null,
    journey: null,
    streak: null,
    mistakes: [],
    bookmarks: [],
    notes: [],
    achievements: {},
    ayahProgress: {},
    memStats: null,
    recitationProgress: {},
    readerPos: null,
    learningSnapshot: null,
  };
}

type IdItem = { id: string; updatedAt?: string; createdAt?: string };

function parseIso(ts?: string): number {
  if (!ts) return 0;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Last-Write-Wins by updatedAt (then createdAt) for same id.
 * Local-only and remote-only rows are always kept (union) — never wipe a bank.
 */
export function mergeByIdLww<T extends IdItem>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of remote) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const pt = parseIso(prev.updatedAt || prev.createdAt);
    const rt = parseIso(item.updatedAt || item.createdAt);
    // Strict LWW: newer timestamp wins; equal → keep higher frequency if present
    if (rt > pt) {
      map.set(item.id, item);
    } else if (rt === pt) {
      const pf = (prev as { frequency?: number }).frequency ?? 0;
      const rf = (item as { frequency?: number }).frequency ?? 0;
      if (rf > pf) map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

/**
 * Streak is monotonic-ish: never wipe, never take a weaker remote over a stronger local
 * without a newer lastActiveDate. Protects new-device login from zeroing offline streak.
 */
export function mergeStreakLww(
  local: StreakState | null | undefined,
  remote: StreakState | null | undefined
): StreakState | null {
  if (!local && !remote) return null;
  if (!local) return remote ? { ...remote } : null;
  if (!remote) return { ...local };

  const lDay = local.lastActiveDate || "";
  const rDay = remote.lastActiveDate || "";
  // Prefer side with later activity day; if equal, take max current/longest
  if (rDay > lDay) {
    return {
      ...local,
      ...remote,
      current: Math.max(local.current || 0, remote.current || 0),
      longest: Math.max(local.longest || 0, remote.longest || 0),
      totalDays: Math.max(local.totalDays || 0, remote.totalDays || 0),
      lastActiveDate: rDay,
    };
  }
  if (lDay > rDay) {
    return {
      ...remote,
      ...local,
      current: Math.max(local.current || 0, remote.current || 0),
      longest: Math.max(local.longest || 0, remote.longest || 0),
      totalDays: Math.max(local.totalDays || 0, remote.totalDays || 0),
      lastActiveDate: lDay,
    };
  }
  // Same day (or both empty): max counters
  return {
    current: Math.max(local.current || 0, remote.current || 0),
    longest: Math.max(local.longest || 0, remote.longest || 0),
    totalDays: Math.max(local.totalDays || 0, remote.totalDays || 0),
    lastActiveDate: lDay || rDay,
  };
}

function mergeAyahProgress(
  local: Record<string, AyahProgress>,
  remote: Record<string, AyahProgress>
): Record<string, AyahProgress> {
  const out = { ...local };
  for (const [k, r] of Object.entries(remote || {})) {
    const l = out[k];
    if (!l) {
      out[k] = r;
      continue;
    }
    const lT = l.lastRevisedAt || l.memorizedAt || "";
    const rT = r.lastRevisedAt || r.memorizedAt || "";
    // Prefer higher practice signals or newer timestamp
    const lScore =
      (l.listenCount || 0) + (l.practiceCount || 0) + (l.successTests || 0);
    const rScore =
      (r.listenCount || 0) + (r.practiceCount || 0) + (r.successTests || 0);
    if (rT > lT || rScore >= lScore) out[k] = r;
  }
  return out;
}

export type ApplySnapshotOptions = {
  /**
   * When true (after authoritative server merge push), replace collections.
   * When false (pull), merge by id so offline local rows are not wiped by empty cloud.
   */
  replaceCollections?: boolean;
};

/**
 * Soft-merge local + cloud HafizProfile (User Intent).
 *
 * Phase 3: Intent fields use newest-wins merge (learningGoalId, progressionMode, …).
 * Never let a stale incomplete cloud profile downgrade completed onboarding.
 */
export function mergeProfilesForSync(
  local: HafizProfile | null,
  remote: HafizProfile
): HafizProfile {
  const merged = mergeUserIntent(local, remote);
  return merged ?? { ...getDefaultProfile(), ...remote, version: 2 };
}

/**
 * Write a server-merged snapshot into localStorage and notify listeners.
 * Default: merge collections; use replaceCollections after push merge.
 */
export function applyLocalSnapshot(
  snapshot: ProgressSnapshot,
  opts?: ApplySnapshotOptions
): void {
  if (!isBrowser()) return;
  const replace = opts?.replaceCollections === true;

  if (snapshot.profile) {
    // Always Intent-merge profile so learningGoalId / progressionMode never lost
    const local = safeGetJSON<HafizProfile | null>(STORAGE_KEYS.profile, null);
    const nextProfile = mergeProfilesForSync(local, snapshot.profile);
    safeSetJSON(STORAGE_KEYS.profile, nextProfile);
    emitStorageEvent("hafiz-profile-updated", nextProfile);
  } else if (replace) {
    // Keep local intent if cloud has no profile row
  }
  if (snapshot.journey) {
    const local = safeGetJSON<JourneyProgress | null>(STORAGE_KEYS.journey, null);
    if (
      replace ||
      !local ||
      snapshot.journey.date > (local.date || "") ||
      (snapshot.journey.date === local.date &&
        (snapshot.journey.completedStepIds?.length || 0) >=
          (local.completedStepIds?.length || 0))
    ) {
      safeSetJSON(STORAGE_KEYS.journey, snapshot.journey);
      emitStorageEvent("hafiz-journey-updated", snapshot.journey);
    }
  } else if (replace) {
    safeRemoveItem(STORAGE_KEYS.journey);
    emitStorageEvent("hafiz-journey-updated", null);
  }
  // ── Streak: NEVER wipe (new device / empty cloud must not reset offline streak)
  {
    const local = safeGetJSON<StreakState | null>(STORAGE_KEYS.streak, null);
    const remote = snapshot.streak;
    if (remote || local) {
      const merged = mergeStreakLww(local, remote);
      if (merged) safeSetJSON(STORAGE_KEYS.streak, merged);
    }
  }

  // ── Error bank + collections: ALWAYS union LWW by id (never pure replace wipe)
  if (snapshot.mistakes) {
    const local = safeGetJSON<MistakeItem[]>(STORAGE_KEYS.mistakes, []);
    safeSetJSON(
      STORAGE_KEYS.mistakes,
      mergeByIdLww(local, snapshot.mistakes)
    );
  }
  // Empty remote mistakes array must not clear local bank even on replace
  if (snapshot.bookmarks) {
    const local = safeGetJSON<BookmarkItem[]>(STORAGE_KEYS.bookmarks, []);
    safeSetJSON(
      STORAGE_KEYS.bookmarks,
      mergeByIdLww(local, snapshot.bookmarks)
    );
  }
  if (snapshot.notes) {
    const local = safeGetJSON<NoteItem[]>(STORAGE_KEYS.notes, []);
    safeSetJSON(STORAGE_KEYS.notes, mergeByIdLww(local, snapshot.notes));
  }
  if (snapshot.achievements) {
    const local = safeGetJSON<Record<string, AchievementState>>(
      STORAGE_KEYS.achievements,
      {}
    );
    safeSetJSON(
      STORAGE_KEYS.achievements,
      replace
        ? snapshot.achievements
        : { ...local, ...snapshot.achievements }
    );
  }
  if (snapshot.ayahProgress) {
    const local = safeGetJSON<Record<string, AyahProgress>>(
      STORAGE_KEYS.ayahProgress,
      {}
    );
    safeSetJSON(
      STORAGE_KEYS.ayahProgress,
      replace
        ? snapshot.ayahProgress
        : mergeAyahProgress(local, snapshot.ayahProgress)
    );
    emitStorageEvent("hafiz-mem-updated");
  }
  if (snapshot.memStats) {
    safeSetJSON(STORAGE_KEYS.memStats, snapshot.memStats);
  } else if (replace) {
    safeRemoveItem(STORAGE_KEYS.memStats);
  }
  if (snapshot.recitationProgress) {
    const local = safeGetJSON<Record<string, SurahRecitationProgress>>(
      STORAGE_KEYS.recitation,
      {}
    );
    safeSetJSON(
      STORAGE_KEYS.recitation,
      replace
        ? snapshot.recitationProgress
        : { ...local, ...snapshot.recitationProgress }
    );
    emitStorageEvent("hafiz-recitation-progress");
  }
  if (snapshot.readerPos) {
    safeSetJSON(STORAGE_KEYS.readerPos, snapshot.readerPos);
  } else if (replace) {
    safeRemoveItem(STORAGE_KEYS.readerPos);
  }
  // ── LearningSnapshot: Intent is profile; Actual merges; Forecast discarded ──
  if (snapshot.learningSnapshot) {
    const validation = validateLearningSnapshotCloud(snapshot.learningSnapshot);
    if (!validation.ok) {
      // Reject corrupt cloud payload — keep local Actual
      console.warn(
        "[sync] invalid learningSnapshot ignored:",
        validation.errors.join("; ")
      );
    } else if (isForecastOnlyLearningSnapshot(snapshot.learningSnapshot)) {
      // Case 3: forecast-only cloud must not touch cursor / SRS
    } else {
      const local = safeGetJSON<LearningSnapshotCloud | null>(
        APP_STORAGE_KEYS.learningSnapshot,
        null
      );
      let next: LearningSnapshotCloud | null;
      if (replace && !local) {
        next = stripForecast(snapshot.learningSnapshot);
      } else if (replace) {
        // Login / account switch: still merge Actual so offline progress is not lost
        next = mergeLearningSnapshots(local, snapshot.learningSnapshot);
      } else {
        next = mergeLearningSnapshots(local, snapshot.learningSnapshot);
      }
      if (next) {
        safeSetJSON(APP_STORAGE_KEYS.learningSnapshot, next);
        emitStorageEvent("hafiz-learning-snapshot-updated", next);
      }
    }
  } else if (replace) {
    // Do not wipe Actual learning on empty cloud pull — only clear if force + empty
    // Keep local when cloud has no learning state
  }

  safeSetItem(STORAGE_KEYS.lastSync, new Date().toISOString());
  emitStorageEvent("hafiz-activity");
  emitStorageEvent("hafiz-sync-applied", snapshot);
}

export function getLastSyncAt(): string | null {
  return safeGetItem(STORAGE_KEYS.lastSync);
}

export function getCloudUserId(): string | null {
  return safeGetItem(STORAGE_KEYS.cloudUserId);
}

export function setCloudUserId(userId: string) {
  if (!userId) {
    safeSetItem(STORAGE_KEYS.cloudUserId, "");
    return;
  }
  safeSetItem(STORAGE_KEYS.cloudUserId, userId);
}
