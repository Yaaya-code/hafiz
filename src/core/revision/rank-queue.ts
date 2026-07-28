/**
 * Ranked revision queue API — replace far-queue round-robin.
 *
 * Plan generator can consume results later without this module
 * importing plan-generator.
 */

import type {
  RankedRevisionItem,
  RevisionCapacity,
  RevisionMemoryItem,
} from "../models/revision-memory";
import { compareRankedRevision, scoreRevisionItem } from "./scoring";
import { partitionNearFar } from "./near-revision";
import { dayDiff } from "./dates";

export interface RankRevisionOptions {
  asOfDate: string;
  /**
   * If true (default), near/urgent items keep their near boost
   * but still sort in the same deterministic list.
   */
  includeNear?: boolean;
  /**
   * If true, only include items due on or before asOfDate
   * (or never reviewed / urgent).
   */
  dueOnly?: boolean;
}

function isDue(item: RevisionMemoryItem, asOfDate: string): boolean {
  if (item.urgent || item.isNear) return true;
  if (!item.nextReviewDate) return true;
  return dayDiff(item.nextReviewDate, asOfDate) >= 0;
}

/**
 * Rank revision memory items by priority.
 * Pure: does not mutate input array or items.
 */
export function rankRevisionItems(
  items: readonly RevisionMemoryItem[],
  options: RankRevisionOptions
): RankedRevisionItem[] {
  const includeNear = options.includeNear !== false;
  const dueOnly = options.dueOnly === true;

  const ranked: RankedRevisionItem[] = [];
  for (const raw of items) {
    if (!includeNear && (raw.isNear || raw.urgent)) continue;
    if (dueOnly && !isDue(raw, options.asOfDate)) continue;
    // Defensive copy of item reference content only in score wrapper
    ranked.push(
      scoreRevisionItem(
        {
          ...raw,
          content: { ...raw.content },
        },
        { asOfDate: options.asOfDate }
      )
    );
  }

  ranked.sort(compareRankedRevision);
  return ranked;
}

/**
 * Select a capacity-limited prefix of a ranked queue.
 * Prefer near/urgent first (already scored higher), then far by rank.
 * Does not mutate inputs.
 */
export function selectRevisionItemsForCapacity(
  ranked: readonly RankedRevisionItem[],
  capacity: RevisionCapacity = {}
): RankedRevisionItem[] {
  const maxItems =
    typeof capacity.maxItems === "number" && capacity.maxItems >= 0
      ? Math.floor(capacity.maxItems)
      : Number.POSITIVE_INFINITY;
  const maxMinutes =
    typeof capacity.maxMinutes === "number" && capacity.maxMinutes >= 0
      ? capacity.maxMinutes
      : Number.POSITIVE_INFINITY;
  const maxPages =
    typeof capacity.maxPages === "number" && capacity.maxPages >= 0
      ? capacity.maxPages
      : Number.POSITIVE_INFINITY;

  const selected: RankedRevisionItem[] = [];
  let minutes = 0;
  let pages = 0;

  for (const row of ranked) {
    if (selected.length >= maxItems) break;

    const itemPages = Math.max(0.25, row.item.content.pagesApprox ?? 0.5);
    const itemMinutes = Math.max(5, Math.round(itemPages * 12));

    // Skip oversize units so one giant Baqarah block cannot monopolize the day
    // (previously: force-include first item then break → single short/long domination).
    if (minutes + itemMinutes > maxMinutes && selected.length > 0) {
      continue;
    }
    if (pages + itemPages > maxPages && selected.length > 0) {
      continue;
    }
    if (
      selected.length === 0 &&
      Number.isFinite(maxMinutes) &&
      itemMinutes > maxMinutes * 1.35 &&
      ranked.length > 1
    ) {
      // Prefer smaller diverse units when the top-ranked item alone blows the budget
      continue;
    }

    selected.push(row);
    minutes += itemMinutes;
    pages += itemPages;
  }

  // Fallback: if everything was skipped as oversize, take the single highest-ranked
  if (selected.length === 0 && ranked.length > 0 && maxItems > 0) {
    selected.push(ranked[0]);
  }

  return selected;
}

/**
 * Build a far-revision ranked list (excludes near-only unless urgent graduated).
 * Convenience for plan-generator integration later.
 */
export function rankFarRevisionQueue(
  items: readonly RevisionMemoryItem[],
  asOfDate: string,
  dueOnly = false
): RankedRevisionItem[] {
  const { farEligible } = partitionNearFar(items);
  // Also include near items that are no longer near but present in bank
  return rankRevisionItems(farEligible, {
    asOfDate,
    includeNear: false,
    dueOnly,
  });
}

/**
 * Build near-revision ranked list (isNear or urgent).
 */
export function rankNearRevisionQueue(
  items: readonly RevisionMemoryItem[],
  asOfDate: string
): RankedRevisionItem[] {
  const { nearUrgent } = partitionNearFar(items);
  return rankRevisionItems(nearUrgent, {
    asOfDate,
    includeNear: true,
    dueOnly: false,
  });
}
