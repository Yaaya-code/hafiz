/**
 * Near-revision intelligence.
 *
 * Rule kept: yesterday's new hifz → today's near revision.
 * Added: fail keeps unit urgent; success graduates to SRS far path.
 */

import type {
  RevisionContentRef,
  RevisionMemoryItem,
  ReviewOutcome,
} from "../models/revision-memory";
import { createMemoryItem, applyReviewOutcome } from "./srs-intervals";

/**
 * Schedule a near-revision item for content just memorized (new hifz).
 * First review is next calendar day.
 */
export function scheduleNearRevision(
  id: string,
  content: RevisionContentRef,
  asOfDate: string,
  strengthScore?: number
): RevisionMemoryItem {
  return createMemoryItem(id, content, asOfDate, {
    isNear: true,
    source: "new_hifz",
    strengthScore,
  });
}

/**
 * Apply near-revision outcome.
 * - fail → stays near + urgent, short interval
 * - success → leaves near queue, normal SRS interval growth
 */
export function applyNearReviewOutcome(
  item: RevisionMemoryItem,
  outcome: ReviewOutcome,
  asOfDate: string
): RevisionMemoryItem {
  // Ensure near flag for scoring path
  const nearItem: RevisionMemoryItem = {
    ...item,
    isNear: true,
  };
  return applyReviewOutcome(nearItem, outcome, asOfDate);
}

/**
 * True when the item should remain in the urgent near queue.
 */
export function isUrgentNear(item: RevisionMemoryItem): boolean {
  return item.isNear === true && item.urgent === true;
}

/**
 * Partition memory bank into near-urgent vs far-eligible.
 * Does not mutate inputs.
 */
export function partitionNearFar(
  items: readonly RevisionMemoryItem[]
): {
  nearUrgent: RevisionMemoryItem[];
  farEligible: RevisionMemoryItem[];
} {
  const nearUrgent: RevisionMemoryItem[] = [];
  const farEligible: RevisionMemoryItem[] = [];
  for (const it of items) {
    if (it.isNear || it.urgent) {
      nearUrgent.push(it);
    } else {
      farEligible.push(it);
    }
  }
  return { nearUrgent, farEligible };
}
