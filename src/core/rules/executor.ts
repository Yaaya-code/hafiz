/**
 * RuleExecutor — runs a RulePipeline with dependency checks and full tracing.
 * Never invents Quran logic; only evaluates registered rules.
 */

import type { RuleResult } from "../models";
import { createEntityId } from "../utils/ids";
import type { RuleContext } from "./context";
import { createRuleContext, withPriorResult } from "./context";
import type { RulePipeline } from "./pipeline";
import type { RuleRegistry } from "./registry";
import {
  ruleError,
  ruleSkippedDisabled,
  ruleSkippedPrerequisite,
} from "./result-factory";
import type { RuleExecutionLog, RuleTrace, RuleTraceStatus } from "./trace";
import { emptyExecutionLog } from "./trace";

export interface RuleExecutorOptions {
  /**
   * If true (default), catch evaluate() throws and convert to ruleError result.
   * If false, rethrow (strict debug mode).
   */
  catchRuleErrors?: boolean;

  /**
   * If true (default), skip rule when a prerequisite was disabled or missing.
   */
  enforcePrerequisites?: boolean;

  /**
   * If true, still evaluate rules whose prerequisites did not apply
   * (only requires them to have *run*). Default true.
   */
  requirePrerequisitesEvaluated?: boolean;

  /** Attach full traces (default true). Set false for hot paths later. */
  enableTracing?: boolean;
}

export interface RuleExecutionOutput {
  results: readonly RuleResult[];
  /** Map of all results by rule id */
  resultById: ReadonlyMap<string, RuleResult>;
  /** Only applied results, in execution order */
  applied: readonly RuleResult[];
  log: RuleExecutionLog;
}

/**
 * Executes rules in pipeline order against a RuleContext.
 */
export class RuleExecutor {
  constructor(
    private readonly registry: RuleRegistry,
    private readonly options: RuleExecutorOptions = {}
  ) {}

  /**
   * Validate registry dependencies, then run the pipeline.
   */
  execute(
    pipeline: RulePipeline,
    ctxInput: Omit<RuleContext, "priorResults" | "scratch"> &
      Partial<Pick<RuleContext, "priorResults" | "scratch" | "decision">>
  ): RuleExecutionOutput {
    const catchErrors = this.options.catchRuleErrors ?? true;
    const enforcePrereq = this.options.enforcePrerequisites ?? true;
    const enableTracing = this.options.enableTracing ?? true;

    const runId = createEntityId("rule_run");
    const started = nowMs();
    const startedAt = new Date().toISOString();

    const pipelineIds = pipeline.ids();
    const dep = this.registry.validateDependencies(pipelineIds);
    const traces: RuleTrace[] = [];
    const results: RuleResult[] = [];
    let ctx = createRuleContext({
      profile: ctxInput.profile,
      state: ctxInput.state,
      planning: ctxInput.planning,
      asOfDate: ctxInput.asOfDate,
      dayIndex: ctxInput.dayIndex,
      horizonLength: ctxInput.horizonLength,
      priorResults: ctxInput.priorResults,
      decision: ctxInput.decision,
      scratch: ctxInput.scratch,
    });

    const appliedIds: string[] = [];
    const skippedIds: string[] = [];
    const errorIds: string[] = [];

    // If hard dependency registration failed, still attempt run but log errors
    let executionIndex = 0;

    for (const rule of pipeline.rules) {
      const meta = rule.metadata;
      const id = meta.id;
      const t0 = nowMs();

      // Disabled (shouldn't appear if enabledOnly, but guard anyway)
      if (!this.registry.isEnabled(id)) {
        const result = ruleSkippedDisabled(id);
        results.push(result);
        ctx = withPriorResult(ctx, id, result);
        skippedIds.push(id);
        if (enableTracing) {
          traces.push(
            makeTrace({
              rule,
              status: "skipped_disabled",
              result,
              durationMs: nowMs() - t0,
              executionIndex,
              satisfied: [],
              missing: [],
            })
          );
        }
        executionIndex += 1;
        continue;
      }

      // Prerequisite enforcement
      const missing: string[] = [];
      const satisfied: string[] = [];
      if (enforcePrereq) {
        for (const pre of meta.prerequisites) {
          if (!this.registry.has(pre)) {
            missing.push(pre);
            continue;
          }
          // Prerequisite must have a prior result in this run if it's in the pipeline
          if (pipelineIds.includes(pre)) {
            if (!ctx.priorResults.has(pre)) {
              missing.push(pre);
            } else {
              satisfied.push(pre);
            }
          } else {
            // Outside pipeline: only require registration
            satisfied.push(pre);
          }
        }
      }

      if (missing.length > 0) {
        const result = ruleSkippedPrerequisite(id, missing);
        results.push(result);
        ctx = withPriorResult(ctx, id, result);
        skippedIds.push(id);
        if (enableTracing) {
          traces.push(
            makeTrace({
              rule,
              status: "skipped_prerequisite",
              result,
              durationMs: nowMs() - t0,
              executionIndex,
              satisfied,
              missing,
            })
          );
        }
        executionIndex += 1;
        continue;
      }

      // Evaluate
      let result: RuleResult;
      let status: RuleTraceStatus;
      try {
        result = rule.evaluate(ctx);
        // Normalize ruleId on result
        if (result.ruleId !== id) {
          result = { ...result, ruleId: id };
        }
        status = result.applied ? "applied" : "not_applied";
        if (result.applied) appliedIds.push(id);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        if (!catchErrors) throw err;
        result = ruleError(id, message);
        status = "error";
        errorIds.push(id);
      }

      results.push(result);
      ctx = withPriorResult(ctx, id, result);

      if (enableTracing) {
        traces.push(
          makeTrace({
            rule,
            status,
            result,
            durationMs: nowMs() - t0,
            executionIndex,
            satisfied,
            missing: [],
          })
        );
      }
      executionIndex += 1;
    }

    const finishedAt = new Date().toISOString();
    const totalDurationMs = nowMs() - started;

    const log: RuleExecutionLog = {
      runId,
      asOfDate: ctx.asOfDate,
      dayIndex: ctx.dayIndex,
      startedAt,
      finishedAt,
      totalDurationMs,
      traces: Object.freeze(traces),
      appliedRuleIds: Object.freeze(appliedIds),
      skippedRuleIds: Object.freeze(skippedIds),
      errorRuleIds: Object.freeze(errorIds),
      dependencyValidationOk: dep.ok,
      dependencyErrors: Object.freeze([...dep.errors]),
    };

    const resultById = new Map(results.map((r) => [r.ruleId, r]));
    const applied = results.filter((r) => r.applied);

    return {
      results: Object.freeze(results),
      resultById,
      applied: Object.freeze(applied),
      log,
    };
  }

  /**
   * Dry-run dependency validation without evaluating rules.
   */
  validate(pipeline: RulePipeline): {
    ok: boolean;
    errors: string[];
    order: readonly string[];
  } {
    const order = pipeline.ids();
    const dep = this.registry.validateDependencies(order);
    return {
      ok: dep.ok,
      errors: dep.errors,
      order,
    };
  }
}

function makeTrace(args: {
  rule: import("./rule").IPlanningRule;
  status: RuleTraceStatus;
  result: RuleResult;
  durationMs: number;
  executionIndex: number;
  satisfied: readonly string[];
  missing: readonly string[];
}): RuleTrace {
  return {
    ruleId: args.rule.metadata.id,
    ruleName: args.rule.metadata.name,
    category: args.rule.metadata.category,
    priority: args.rule.metadata.priority,
    status: args.status,
    result: args.result,
    durationMs: args.durationMs,
    executionIndex: args.executionIndex,
    satisfiedPrerequisites: args.satisfied,
    missingPrerequisites: args.missing,
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

export function createRuleExecutor(
  registry: RuleRegistry,
  options?: RuleExecutorOptions
): RuleExecutor {
  return new RuleExecutor(registry, options);
}

/** Convenience when you only need an empty log shell for failed bootstrap. */
export function failedBootstrapLog(
  asOfDate: string,
  errors: readonly string[]
): RuleExecutionLog {
  return emptyExecutionLog(createEntityId("rule_run"), asOfDate, undefined, errors);
}
