/**
 * Bootstrap / merge ArchitectureState from profile + existing snapshot.
 * Backward compatible: seeds from HafizProfile when architecture missing.
 */

import type { HafizProfile } from "@/lib/user-profile";
import type { ArchitectureState, EvidenceRecord } from "./types";
import {
  buildMemorizationMapFromProfile,
  emptyMemorizationMap,
  normalizeRegions,
} from "./memorization-map";
import { inferUserIntentFromProfile } from "./path-resolver";
import { resolveUserCapacity } from "./measurement";
import { defaultAdaptation, computeAdaptation } from "./adaptation";

export function createArchitectureState(
  profile: HafizProfile,
  prior?: ArchitectureState | null
): ArchitectureState {
  if (prior && prior.version === 1) {
    return refreshArchitectureFromProfile(prior, profile);
  }

  return {
    version: 1,
    intent: inferUserIntentFromProfile(profile),
    memorizationMap: buildMemorizationMapFromProfile(profile),
    externalAssignments: [],
    capacity: resolveUserCapacity({
      pagesPerDay: profile.pagesPerDay,
      revisionPagesPerDay: profile.revisionPagesPerDay,
      dailyMinutes: profile.dailyMinutes,
    }),
    evidence: [],
    confusion: [],
    adaptation: defaultAdaptation(),
  };
}

/** Soft-refresh capacity/map when profile onboarding changes. */
export function refreshArchitectureFromProfile(
  state: ArchitectureState,
  profile: HafizProfile
): ArchitectureState {
  const fromProfile = buildMemorizationMapFromProfile(profile);
  // Keep SESSION/VERIFIED regions; merge DECLARED from profile
  const sessionRegions = state.memorizationMap.regions.filter(
    (r) => r.source === "SESSION" || r.source === "VERIFIED" || r.source === "TEACHER"
  );
  const declared = fromProfile.regions;
  const mergedRegions = [...sessionRegions, ...declared];

  return {
    ...state,
    capacity: resolveUserCapacity({
      pagesPerDay: profile.pagesPerDay,
      revisionPagesPerDay: profile.revisionPagesPerDay,
      dailyMinutes: profile.dailyMinutes,
      newHifzPages: state.capacity.newHifzPages,
      revisionPages: state.capacity.revisionPages,
    }),
    memorizationMap: {
      version: 1,
      regions: normalizeRegions(mergedRegions),
      updatedAt: new Date().toISOString(),
    },
    // Intent sticky if already set by user flow
    intent: state.intent?.mode
      ? state.intent
      : inferUserIntentFromProfile(profile),
  };
}

export function appendEvidence(
  state: ArchitectureState,
  records: EvidenceRecord[]
): ArchitectureState {
  const evidence = [...state.evidence, ...records].slice(-500);
  const adaptation = computeAdaptation(evidence, state.adaptation);
  return {
    ...state,
    evidence,
    adaptation,
  };
}

export function emptyArchitecture(): ArchitectureState {
  return {
    version: 1,
    intent: { mode: "FROM_SCRATCH", updatedAt: new Date().toISOString() },
    memorizationMap: emptyMemorizationMap(),
    externalAssignments: [],
    capacity: resolveUserCapacity({}),
    evidence: [],
    confusion: [],
    adaptation: defaultAdaptation(),
  };
}
