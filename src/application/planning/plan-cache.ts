/**
 * Plan cache invalidation helpers (application layer only).
 *
 * Strategy:
 * 1. Cache key = `${asOfDate}:${horizonDays}` — day rollover auto-misses old dates.
 * 2. Fingerprint covers profile capacity/scope + revision memory signals + userState id.
 * 3. Session/mistake/progress commits clear planCache (see PlanningService / ExecutionService).
 * 4. Multi-day horizons never commit simulated endingState (see computeAndPersist).
 * 5. force / refreshLearningState clears cache then recomputes.
 */

import type { HafizProfile } from "@/lib/user-profile";
import type { LearningSnapshot } from "../types";

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Stable signature of profile fields that affect planning decisions. */
export function profilePlanSignature(profile: HafizProfile): string {
  const sel = profile.memorizationSelection;
  return [
    profile.pagesPerDay,
    profile.dailyMinutes,
    profile.revisionSessionsPerDay,
    profile.revisionStyle,
    profile.memorizationStrength,
    profile.progressionMode ?? "continue_forward",
    profile.learningStyle ?? "",
    (profile.goals || []).join("|"),
    sel?.mode ?? "NONE",
    JSON.stringify(sel?.juzSelections ?? []),
    JSON.stringify(sel?.surahSelections ?? []),
    JSON.stringify(sel?.range ?? null),
  ].join(";");
}

/** Stable signature of revision memory outcomes (not full content). */
export function revisionMemorySignature(
  memory: LearningSnapshot["revisionMemory"]
): string {
  if (!memory?.length) return "empty";
  const parts = memory.map(
    (m) =>
      `${m.id}:${m.reviewCount}:${m.mistakesCount}:${m.nextReviewDate ?? ""}:${Math.round(
        (m.strengthScore ?? 0) * 100
      )}:${m.urgent ? 1 : 0}`
  );
  return simpleHash(parts.join(","));
}

/**
 * Full input fingerprint for a given asOfDate.
 * Any change → cached plans must not be reused.
 */
export function buildPlanInputFingerprint(
  profile: HafizProfile,
  snapshot: LearningSnapshot,
  asOfDate: string
): string {
  const stateId = snapshot.userState
    ? `${snapshot.userState.userId}:${snapshot.userState.updatedAt ?? ""}:${snapshot.userState.hifz?.currentPointer?.surah ?? ""}:${snapshot.userState.hifz?.currentPointer?.ayah ?? ""}`
    : "no-state";
  const raw = [
    asOfDate,
    profilePlanSignature(profile),
    revisionMemorySignature(snapshot.revisionMemory),
    stateId,
    String(snapshot.revisionMemory?.length ?? 0),
  ].join("#");
  return simpleHash(raw);
}

/** Drop planCache entries whose asOfDate is not today (or not matching asOfDate). */
export function prunePlanCache(
  planCache: Record<string, unknown>,
  asOfDate: string
): Record<string, never> | Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(planCache || {})) {
    if (key.startsWith(asOfDate + ":")) {
      next[key] = value;
    }
  }
  return next;
}

export function isCacheFingerprintValid(
  snapshot: LearningSnapshot,
  profile: HafizProfile,
  asOfDate: string
): boolean {
  if (!snapshot.cacheMeta?.fingerprint) return false;
  if (snapshot.cacheMeta.asOfDate !== asOfDate) return false;
  const current = buildPlanInputFingerprint(profile, snapshot, asOfDate);
  return current === snapshot.cacheMeta.fingerprint;
}
