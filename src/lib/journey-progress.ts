/**
 * Daily journey completion + sequential unlock.
 */

import { recordActivity } from "@/lib/user-activity";
import type { JourneyStep } from "@/lib/quran/types";
import {
  STORAGE_KEYS,
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";

const KEY = STORAGE_KEYS.journey;

export type JourneyProgress = {
  date: string;
  completedStepIds: string[];
  finished: boolean;
  startedAt?: string;
  finishedAt?: string;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function empty(date = todayStr()): JourneyProgress {
  return { date, completedStepIds: [], finished: false };
}

export function loadJourneyProgress(): JourneyProgress {
  if (!isBrowser()) return empty();
  const p = safeGetJSON<JourneyProgress | null>(KEY, null);
  if (!p) return empty();
  if (p.date !== todayStr()) return empty();
  return p;
}

export function saveJourneyProgress(p: JourneyProgress): void {
  if (!isBrowser()) return;
  safeSetJSON(KEY, p);
  emitStorageEvent("hafiz-journey-updated", p);
}

export function completeJourneyStep(stepId: string): JourneyProgress {
  const p = loadJourneyProgress();
  if (!p.startedAt) p.startedAt = new Date().toISOString();
  if (!p.completedStepIds.includes(stepId)) {
    p.completedStepIds = [...p.completedStepIds, stepId];
  }
  if (stepId === "finish") {
    p.finished = true;
    p.finishedAt = new Date().toISOString();
  }
  saveJourneyProgress(p);
  recordActivity();
  return p;
}

export function finishJourney(): JourneyProgress {
  return completeJourneyStep("finish");
}

export function isStepCompleted(
  progress: JourneyProgress,
  stepId: string
): boolean {
  return progress.completedStepIds.includes(stepId);
}

/**
 * Sequential unlock: a step is available only if all previous steps are done.
 * First incomplete step is the "current" active step.
 */
export function getStepLockState(
  steps: JourneyStep[],
  progress: JourneyProgress
): {
  unlockedIds: Set<string>;
  lockedIds: Set<string>;
  currentStepId: string | null;
  allDone: boolean;
} {
  const done = new Set(progress.completedStepIds);
  const unlocked = new Set<string>();
  const locked = new Set<string>();
  let current: string | null = null;
  let blocked = false;

  const ordered = [...steps].sort((a, b) => a.order - b.order);
  for (const step of ordered) {
    if (blocked) {
      locked.add(step.id);
      continue;
    }
    unlocked.add(step.id);
    if (!done.has(step.id)) {
      current = step.id;
      blocked = true; // subsequent stay locked
    }
  }

  const allDone =
    ordered.length > 0 && ordered.every((s) => done.has(s.id));

  return {
    unlockedIds: unlocked,
    lockedIds: locked,
    currentStepId: allDone ? null : current,
    allDone: allDone || progress.finished,
  };
}

export function journeyCompletionRatio(
  progress: JourneyProgress,
  totalSteps: number
): number {
  if (totalSteps <= 0) return 0;
  return Math.min(1, progress.completedStepIds.length / totalSteps);
}

/** Build session URL for a journey step */
export function stepSessionHref(step: JourneyStep): string {
  const q = new URLSearchParams();
  q.set("step", step.id);
  if (step.surahNumber) q.set("surah", String(step.surahNumber));
  if (step.fromAyah) q.set("from", String(step.fromAyah));
  if (step.toAyah) q.set("to", String(step.toAyah));
  q.set("kind", step.kind);

  switch (step.kind) {
    case "revision":
      return "/session/revision?" + q.toString();
    case "new_hifz":
      return (
        "/session/revision?" +
        q.toString() +
        "&mode=memorize"
      );
    case "listening":
      return "/session/listen?" + q.toString();
    case "quiz":
      return "/session/quiz?" + q.toString();
    case "mutashabihat":
      return "/mutashabihat/practice?step=" + step.id;
    case "reflection":
      return "/session/reflect?" + q.toString();
    case "finish":
      return "/plans/journey";
    default:
      return "/plans/journey";
  }
}
