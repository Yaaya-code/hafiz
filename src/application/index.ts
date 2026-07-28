/**
 * Hafiz Application Layer — public orchestration door.
 *
 * UI / hooks should import from here only:
 *
 *   import { getTodayPlan, completeSession, recordMistake } from "@/application";
 *
 * Do not import @/core adapters or generatePlan from pages.
 */

export type {
  AppDate,
  LearningSnapshot,
  GenerateJourneyOptions,
  GetTodayPlanOptions,
  TodayPlanResult,
  JourneyPlanResult,
  RefreshLearningStateResult,
  DayProgressEvent,
  CommitDayProgressResult,
  GeneratedPlan,
  PlanDay,
  PlanItem,
  Decision,
  DecisionValidationResult,
  UserState,
  RevisionMemoryItem,
} from "./types";

export {
  PlanningService,
  getPlanningService,
  resetPlanningService,
  getTodayPlan,
  generateJourneyPlan,
  refreshLearningState,
  invalidatePlanCache,
  resetLearningForNewProfile,
  getLearningSnapshot,
  type PlanningServiceOptions,
} from "./planning/planning-service";

export {
  resolveHifzCursor,
  advanceHifzCursorAfterSession,
  cursorToPointer,
  type HifzCursor,
  type HifzCursorSource,
} from "./planning/hifz-cursor";

export {
  initializeSrsFromProfile,
  countDueOn,
} from "./planning/srs-init";

export {
  computeLoadAdjustment,
  type LoadAdjustment,
} from "./planning/load-adjustment";

/** Architecture baseline (P0–P8) — domain services */
export {
  createArchitectureState,
  resolveNewHifzPath,
  measureQuranRange,
  composeDailyJourney,
  buildMemorizationMapFromProfile,
  deriveMemorizationState,
  evaluateRegionStrength,
  type UserIntentMode,
  type ArchitectureState,
  type PathResolution,
  type ComposedDailyJourney,
  type MemorizationMap,
  type ExternalAssignment,
} from "@/core/architecture";

/** Learning execution loop (sessions, reviews, mistakes → replan) */
export {
  LearningExecutionService,
  getLearningExecutionService,
  resetLearningExecutionService,
  commitDayProgress,
  completeSession,
  recordReviewOutcome,
  recordMistake,
} from "./learning/execution-service";

export type {
  LearningProgressEvent,
  CommitProgressOptions,
  CommitProgressResult,
  CompleteSessionInput,
  RecordReviewInput,
  RecordMistakeInput,
  ReviewQuality,
  SessionKind,
  SessionOutcome,
} from "./learning/execution-types";

export {
  LocalLearningStore,
  MemoryLearningStore,
  getDefaultLearningStore,
  setDefaultLearningStore,
  createEmptyLearningSnapshot,
  LEARNING_SNAPSHOT_EVENT,
  type LearningStore,
} from "./persistence/learning-store";

export { APP_STORAGE_KEYS } from "./persistence/keys";

export {
  mapOrchestrationToDashboard,
  type DashboardPlanView,
  type DashboardJourneyStep,
  type DashboardDayCard,
  type DashboardMonthWeek,
  type DashboardRevisionRow,
} from "./mappers/plan-to-dashboard";
