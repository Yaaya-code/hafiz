/**
 * New memorization (hifz) pointer and progress.
 */

import type { ISODate, MushafPointer, QuranSlice } from "./primitives";

/**
 * Where the learner is on the new-hifz track.
 * Advanced only by the engine after a day is committed.
 */
export interface HifzState {
  /** Next ayah to memorize (rolling pointer) */
  currentPointer: MushafPointer;

  /**
   * Track semantics:
   * - top_down: Baqarah-forward / continuation
   * - bottom_up: foundation from Amma upward
   * - from_start: Fatiha then Baqarah sequence
   */
  track: "top_down" | "bottom_up" | "from_start" | "continue_forward";

  /** True when new hifz is frozen (e.g. foundation-builder) */
  paused: boolean;

  /** Slices of new hifz completed in the current week */
  weekHifzLog: QuranSlice[];

  /** Last successfully completed hifz slice (for near revision) */
  lastCompletedSlice?: QuranSlice;

  lastAdvancedDate?: ISODate;
}
