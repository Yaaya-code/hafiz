/**
 * Rolling revision queues and far/near revision cursors.
 */

import type { ISODate, QuranSlice } from "./primitives";

/** One unit waiting in the far-revision corpus */
export interface RevisionQueueItem {
  id: string;
  slice: QuranSlice;
  /** Higher = sooner */
  priority: number;
  /** How many times this unit has been served recently */
  timesServed: number;
  lastServedDate?: ISODate;
  source: "memorized_corpus" | "foundation" | "near_carry" | "weekly_anchor";
}

/**
 * Stateful revision machinery.
 * The engine advances these queues; it never random-picks in the UI.
 */
export interface RevisionState {
  /** Near revision: typically yesterday's new hifz (newest at end) */
  nearStack: RevisionQueueItem[];

  /** Far revision: historical / foundation corpus, consumed in order */
  farQueue: RevisionQueueItem[];

  /** Cursor into farQueue (0-based) */
  farIndex: number;

  /** Units completed this calendar week (for Friday anchors) */
  weekLog: RevisionQueueItem[];

  /** Maximum near-stack depth the engine should retain */
  nearStackMax: number;
}
