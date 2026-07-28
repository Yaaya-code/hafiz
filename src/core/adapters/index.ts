/**
 * Core adapters — app DTOs → pure domain models.
 * No rules. No DB. No browser storage. No UI.
 */

export type {
  HafizProfileSource,
  AppProgressSource,
  AppMistakeItem,
  AppSessionItem,
  AppMemorizationSelection,
  ProfileAdapterOptions,
  StateAdapterOptions,
} from "./types";

export {
  adaptHafizProfileToUserProfile,
  adaptMemorizationSelection,
} from "./profile-adapter";

export {
  adaptAppProgressToUserState,
  createDefaultUserState,
} from "./state-adapter";

export {
  buildPlanningContext,
  type BuildPlanningContextInput,
} from "./planning-context-builder";
