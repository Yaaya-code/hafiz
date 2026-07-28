/**
 * Local-first learning snapshot store.
 * I/O lives here — never inside src/core.
 */

import {
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";
import type { LearningSnapshot } from "../types";
import { APP_STORAGE_KEYS } from "./keys";

export const LEARNING_SNAPSHOT_EVENT = "hafiz-learning-snapshot-updated";

export function createEmptyLearningSnapshot(): LearningSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    userState: null,
    revisionMemory: [],
    planCache: {},
  };
}

/**
 * Abstract store so tests can inject in-memory persistence.
 */
export interface LearningStore {
  load(): LearningSnapshot;
  save(snapshot: LearningSnapshot): void;
  clear(): void;
}

/**
 * localStorage-backed store (SSR-safe: returns empty snapshot on server).
 */
export class LocalLearningStore implements LearningStore {
  load(): LearningSnapshot {
    if (!isBrowser()) {
      return createEmptyLearningSnapshot();
    }
    const raw = safeGetJSON<LearningSnapshot | null>(
      APP_STORAGE_KEYS.learningSnapshot,
      null
    );
    if (!raw || raw.version !== 1) {
      return createEmptyLearningSnapshot();
    }
    return {
      version: 1,
      updatedAt: raw.updatedAt || new Date().toISOString(),
      userState: raw.userState ?? null,
      revisionMemory: Array.isArray(raw.revisionMemory)
        ? raw.revisionMemory
        : [],
      planCache:
        raw.planCache && typeof raw.planCache === "object"
          ? raw.planCache
          : {},
      lastDecision: raw.lastDecision,
      cacheMeta: raw.cacheMeta,
      loadAdjustment: raw.loadAdjustment,
      lastForecastHint: raw.lastForecastHint,
      learningStateMeta: raw.learningStateMeta,
      architecture: raw.architecture,
      lastDailyJourney: raw.lastDailyJourney,
      lastPathResolution: raw.lastPathResolution,
      revisionSeq: raw.revisionSeq,
    };
  }

  save(snapshot: LearningSnapshot): void {
    if (!isBrowser()) return;
    const next: LearningSnapshot = {
      ...snapshot,
      version: 1,
      updatedAt: snapshot.updatedAt || new Date().toISOString(),
    };
    safeSetJSON(APP_STORAGE_KEYS.learningSnapshot, next);
    emitStorageEvent(LEARNING_SNAPSHOT_EVENT, next);
  }

  clear(): void {
    if (!isBrowser()) return;
    safeSetJSON(
      APP_STORAGE_KEYS.learningSnapshot,
      createEmptyLearningSnapshot()
    );
    emitStorageEvent(LEARNING_SNAPSHOT_EVENT, null);
  }
}

/** In-memory store for unit tests (no browser). */
export class MemoryLearningStore implements LearningStore {
  private data: LearningSnapshot = createEmptyLearningSnapshot();

  load(): LearningSnapshot {
    return JSON.parse(JSON.stringify(this.data)) as LearningSnapshot;
  }

  save(snapshot: LearningSnapshot): void {
    this.data = JSON.parse(JSON.stringify(snapshot)) as LearningSnapshot;
    // Preserve caller updatedAt when set (sync/session provenance)
    if (!snapshot.updatedAt) {
      this.data.updatedAt = new Date().toISOString();
    }
  }

  clear(): void {
    this.data = createEmptyLearningSnapshot();
  }
}

let defaultStore: LearningStore | null = null;

export function getDefaultLearningStore(): LearningStore {
  if (!defaultStore) {
    defaultStore = new LocalLearningStore();
  }
  return defaultStore;
}

/** Test helper: swap default store */
export function setDefaultLearningStore(store: LearningStore | null): void {
  defaultStore = store;
}
