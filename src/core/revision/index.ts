/**
 * Revision Intelligence Engine
 *
 * UserState + Revision History
 *   → rankRevisionItems / selectRevisionItemsForCapacity
 *   → Ranked Revision Queue
 *
 * Plan generator consumes ranked results for FAR/NEAR revision selection.
 * No pedagogy about what to newly memorize.
 */

export type {
  RevisionContentRef,
  RevisionMemoryItem,
  ReviewOutcome,
  RankedRevisionItem,
  RevisionCapacity,
} from "../models/revision-memory";

export {
  createMemoryItem,
  computeNextInterval,
  applyReviewOutcome,
} from "./srs-intervals";

export { scoreRevisionItem, compareRankedRevision } from "./scoring";

export {
  scheduleNearRevision,
  applyNearReviewOutcome,
  isUrgentNear,
  partitionNearFar,
} from "./near-revision";

export {
  rankRevisionItems,
  selectRevisionItemsForCapacity,
  rankFarRevisionQueue,
  rankNearRevisionQueue,
} from "./rank-queue";

export type { RankRevisionOptions } from "./rank-queue";
export type { IntervalUpdate } from "./srs-intervals";
export type { ScoreOptions } from "./scoring";
