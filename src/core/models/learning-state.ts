/**
 * Cross-cutting learning posture (strength, modality, capacity).
 */

import type {
  LearningStyle,
  MemorizationStrengthLevel,
  RevisionStyle,
} from "./primitives";

export interface LearningState {
  /** Effective strength used by rules (may differ from onboarding self-score later) */
  effectiveStrength: MemorizationStrengthLevel;

  /** Numeric 1–5 mirror for threshold rules */
  strengthScore: 1 | 2 | 3 | 4 | 5;

  learningStyle: LearningStyle;
  revisionStyle: RevisionStyle;

  /**
   * Whether new hifz is currently allowed.
   * Foundation-builder scenarios set this false until retention recovers.
   */
  newHifzEnabled: boolean;

  /** Soft daily capacity in mushaf pages for active work */
  dailyPageCapacity: number;

  /** Soft daily capacity in minutes */
  dailyMinuteCapacity: number;

  /** Engine-facing scenario label (set by rule resolution, not UI) */
  activeScenarioId?: string;
}
