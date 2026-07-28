/**
 * Hafiz Quran Planning Engine — public core entry.
 *
 * Phase 1: models + engine contracts
 * Phase 2: rule pipeline + Logic Bible v1
 * Phase 3: adapters (app DTOs → PlanningContext → Decision)
 *
 * UI must depend only on IPlanningEngine + models (later).
 * Planning logic must never live in React components.
 *
 *   import {
 *     buildPlanningContext,
 *     runDecisionPipeline,
 *   } from "@/core";
 */

export * from "./models";
export * from "./engine";
export * from "./rules";
export * from "./utils";
export * from "./adapters";
export * from "./planning";
export * from "./revision";
export * from "./architecture";
