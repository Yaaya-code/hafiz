/**
 * Rule classification: category, priority, metadata.
 * No Quran rule content — infrastructure only.
 */

/**
 * Coarse grouping for rules. Quran domains will register under these
 * categories later; the pipeline itself is category-agnostic.
 */
export type RuleCategory =
  | "scenario"
  | "capacity"
  | "hifz"
  | "revision"
  | "scheduling"
  | "safety"
  | "coaching"
  | "system"
  | "experimental";

/**
 * Numeric priority: lower number runs earlier.
 * Explicit bands prevent accidental ordering chaos.
 *
 *   0–99    system / safety
 *   100–199 scenario selection
 *   200–299 capacity / freezes
 *   300–399 revision structure
 *   400–499 hifz volume
 *   500–599 scheduling anchors
 *   600–699 coaching messages
 *   900–999 experimental
 */
export type RulePriority = number;

export const RulePriorityBand = {
  SYSTEM: 0,
  SAFETY: 50,
  SCENARIO: 100,
  CAPACITY: 200,
  REVISION: 300,
  HIFZ: 400,
  SCHEDULING: 500,
  COACHING: 600,
  EXPERIMENTAL: 900,
} as const;

/**
 * Static description of a rule, independent of evaluation.
 */
export interface RuleMetadata {
  /** Unique stable id (kebab-case recommended) */
  id: string;

  /** Human name (English or Arabic) */
  name: string;

  /** What this rule decides — for the Logic Bible / debugging */
  description: string;

  category: RuleCategory;

  /** Lower runs first */
  priority: RulePriority;

  /**
   * Rule ids that must be registered and must have completed evaluation
   * before this rule runs (whether or not they applied).
   */
  prerequisites: readonly string[];

  /**
   * If true, registry starts with this rule enabled.
   * Default true when omitted at registration time.
   */
  enabledByDefault: boolean;

  /** Optional tags for filtering / docs */
  tags?: readonly string[];

  /** Optional author / doc reference */
  source?: string;

  /** Schema version of this rule's metadata contract */
  version?: number;
}
