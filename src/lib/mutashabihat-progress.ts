/**
 * Local-first Mutashabihat practice progress.
 * Complements LearningExecutionService sessions — not a second engine.
 */

import {
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  emitStorageEvent,
  STORAGE_KEYS,
} from "@/lib/storage/safe-storage";

const KEY = STORAGE_KEYS.mutashabihatProgress;

export type MutashabihatProgress = {
  version: 1;
  totalAttempts: number;
  totalCorrect: number;
  sessionsCompleted: number;
  lastScore: number;
  lastTotal: number;
  lastCompletedAt: string;
  /** Per group / question id */
  groupStats: Record<
    string,
    { attempts: number; correct: number; lastAt: string }
  >;
};

function empty(): MutashabihatProgress {
  return {
    version: 1,
    totalAttempts: 0,
    totalCorrect: 0,
    sessionsCompleted: 0,
    lastScore: 0,
    lastTotal: 0,
    lastCompletedAt: "",
    groupStats: {},
  };
}

export function loadMutashabihatProgress(): MutashabihatProgress {
  if (!isBrowser()) return empty();
  const raw = safeGetJSON<MutashabihatProgress | null>(KEY, null);
  if (!raw || raw.version !== 1) return empty();
  return {
    ...empty(),
    ...raw,
    groupStats: raw.groupStats || {},
  };
}

export function recordMutashabihatAttempt(input: {
  groupId: string;
  correct: boolean;
}): MutashabihatProgress {
  const p = loadMutashabihatProgress();
  const now = new Date().toISOString();
  p.totalAttempts += 1;
  if (input.correct) p.totalCorrect += 1;
  const g = p.groupStats[input.groupId] || {
    attempts: 0,
    correct: 0,
    lastAt: "",
  };
  g.attempts += 1;
  if (input.correct) g.correct += 1;
  g.lastAt = now;
  p.groupStats[input.groupId] = g;
  if (isBrowser()) {
    safeSetJSON(KEY, p);
    emitStorageEvent("hafiz-mutashabihat-progress", p);
    // Re-use generic activity bus so stats/dashboard refresh
    emitStorageEvent("hafiz-activity", { source: "mutashabihat" });
  }
  return p;
}

export function completeMutashabihatSession(input: {
  score: number;
  total: number;
}): MutashabihatProgress {
  const p = loadMutashabihatProgress();
  p.sessionsCompleted += 1;
  p.lastScore = input.score;
  p.lastTotal = input.total;
  p.lastCompletedAt = new Date().toISOString();
  if (isBrowser()) {
    safeSetJSON(KEY, p);
    emitStorageEvent("hafiz-mutashabihat-progress", p);
    emitStorageEvent("hafiz-activity", { source: "mutashabihat-session" });
  }
  return p;
}

export function mutashabihatAccuracy(p: MutashabihatProgress): number {
  if (p.totalAttempts <= 0) return 0;
  return Math.round((p.totalCorrect / p.totalAttempts) * 100);
}
