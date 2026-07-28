/**
 * Execution tracing for the rule pipeline — debugging & audit only.
 * Traces never affect planning outcomes.
 */

import type { RuleResult } from "../models";
import type { RuleCategory, RulePriority } from "./metadata";

export type RuleTraceStatus =
  | "applied"
  | "not_applied"
  | "skipped_disabled"
  | "skipped_prerequisite"
  | "error";

/**
 * One rule's evaluation record within a pipeline run.
 */
export interface RuleTrace {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  priority: RulePriority;
  status: RuleTraceStatus;
  result: RuleResult;
  /** Wall-clock microseconds if available, else ms * 1000 approximation */
  durationMs: number;
  /** Order of execution in this run (0-based) */
  executionIndex: number;
  /** Prerequisites that were satisfied */
  satisfiedPrerequisites: readonly string[];
  /** Prerequisites missing (if skipped) */
  missingPrerequisites: readonly string[];
}

/**
 * Full log of one pipeline execution.
 */
export interface RuleExecutionLog {
  /** Unique id for this run */
  runId: string;
  asOfDate: string;
  dayIndex?: number;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  traces: readonly RuleTrace[];
  /** Rule ids that applied */
  appliedRuleIds: readonly string[];
  /** Rule ids that were skipped or errored */
  skippedRuleIds: readonly string[];
  errorRuleIds: readonly string[];
  /** Whether dependency validation passed before run */
  dependencyValidationOk: boolean;
  dependencyErrors: readonly string[];
}

export function summarizeExecutionLog(log: RuleExecutionLog): string {
  const lines: string[] = [
    `RuleExecutionLog runId=${log.runId} date=${log.asOfDate} day=${log.dayIndex ?? "-"}`,
    `duration=${log.totalDurationMs.toFixed(2)}ms applied=${log.appliedRuleIds.length} skipped=${log.skippedRuleIds.length} errors=${log.errorRuleIds.length}`,
  ];
  if (!log.dependencyValidationOk) {
    lines.push(`DEPENDENCY ERRORS: ${log.dependencyErrors.join("; ")}`);
  }
  for (const t of log.traces) {
    lines.push(
      `  [${t.executionIndex}] ${t.ruleId} p=${t.priority} ${t.status} (${t.durationMs.toFixed(2)}ms)`
    );
  }
  return lines.join("\n");
}

export function emptyExecutionLog(
  runId: string,
  asOfDate: string,
  dayIndex: number | undefined,
  dependencyErrors: readonly string[]
): RuleExecutionLog {
  const now = new Date().toISOString();
  return {
    runId,
    asOfDate,
    dayIndex,
    startedAt: now,
    finishedAt: now,
    totalDurationMs: 0,
    traces: [],
    appliedRuleIds: [],
    skippedRuleIds: [],
    errorRuleIds: [],
    dependencyValidationOk: dependencyErrors.length === 0,
    dependencyErrors,
  };
}
