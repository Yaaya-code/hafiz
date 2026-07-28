/**
 * Plan Generation Engine — foundation + Quran chunk geometry.
 *
 * Consumes Validated Decision + UserState.
 * Does not evaluate rules or access I/O.
 */

export type {
  PlanItemType,
  PlanItemSourceRange,
  PlanItem,
  PlanDay,
  GeneratedPlan,
  GeneratedPlanMeta,
  GeneratePlanOptions,
} from "./types";

export type { PlanGeneratorDecisionInput } from "./plan-generator";
export {
  generatePlan,
  cloneUserState,
  cloneRevisionMemory,
} from "./plan-generator";

export type {
  RevisionBucketKind,
  RevisionBucket,
  RevisionPolicy,
  RevisionPolicyInput,
  MemorizedRange,
} from "./revision-policy";
export {
  buildRevisionPolicy,
  resolvePrimarySurah,
} from "./revision-policy";

export type { RevisionUnit, RangeRef } from "./revision-units";
export {
  expandToMinUnit,
  nextStabilizeChunk,
  buildNeighborhoodUnit,
  MIN_REVISION_AYAHS,
  MIN_REVISION_PAGES,
} from "./revision-units";

export type {
  HorizonRevisionCursor,
  PackRevisionDayInput,
  PackRevisionDayResult,
} from "./day-revision-packer";
export {
  packRevisionDay,
  memorizedRangesFromMemory,
} from "./day-revision-packer";

export type {
  QuranPointer,
  QuranChunk,
  SurahRange,
  ChunkCapacity,
  ChunkDirection,
  QuranGeometry,
  CreateChunkOptions,
  AdvancePointerOptions,
} from "./quran";
export {
  createNextHifzChunk,
  advancePointer,
  normalizePointer,
  pagesBetween,
  remainingSurahPages,
  createDefaultQuranGeometry,
  createMetadataQuranGeometry,
} from "./quran";
