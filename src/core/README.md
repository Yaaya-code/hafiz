# Hafiz Core — Quran Planning Engine

The brain of Hafiz. **No UI. No invented Quran rules until the Logic Bible says so.**

UI must not import planning internals directly — go through `@/application`.

## Layout

```
src/core/
  models/       Domain models
  engine/       Decision runner + IPlanningEngine contracts
  rules/        Rule infrastructure + Logic Bible (S / P / R)
  planning/     Plan generator + Quran chunk engine
  revision/     SRS intervals, ranking, near-revision
  adapters/     HafizProfile / app progress → core models
  utils/        Pure helpers
```

## Laws

1. Rules never touch React, DOM, network, or storage.
2. Rules never invent Quran pedagogy — only the Logic Bible does.
3. UI never contains planning logic; it only asks the engine (via `@/application`).
4. Do **not** merge UI `HafizProfile` with core `UserProfile` — adapters only.

## Phases

| Phase | Status |
|--------|--------|
| 1 Models + engine contracts | Done |
| 2 Rule infrastructure | Done |
| 3 Logic Bible S-001…S-004, P-001…P-004, R-001…R-004 | Done |
| 4 Plan generator + SRS revision + decision pipeline | Done |
| 5 Adapters (profile / state / planning context) | Done |
| 6 Application orchestration (outside `src/core`) | Done — see `@/application` |
| 7+ Further Bible chapters / refinements | Open as needed |

## Logic Bible rules implemented

| ID | Name | Effect (RuleResult only) |
|----|------|---------------------------|
| S-001 | Weak Memorization Lock | Disable new hifz; 100% revision capacity; listening + mistake review flags |
| S-002 | Beginner Track | Juz Amma, An-Nas→An-Naba bottom-up; no revision schedule until first hifz |
| S-003 | Existing Memorizer Track | Consecutive → continue after last surah; fragmented → revision only |
| S-004 | Capacity Lock | Hard minute ceiling for revision+hifz+listening+quiz |
| P-001 | Readiness for New Hifz | Gates new hifz on stability indicators |
| P-002 | Increase Capacity | Allows page capacity increase when stable |
| P-003 | Strengthening Threshold | Triggers extra revision when below threshold |
| P-004 | Regression Lock | Locks progression when stability drops |
| R-001 | Revision Priority | Elevates revision share when overdue items detected |
| R-002 | Revision Load | Adjusts item count based on available minutes |
| R-003 | Forgotten Content Recovery | Forces recovery items into near queue |
| R-004 | Revision Stability Gate | Blocks new hifz when stability is below gate |

## Usage (rules)

```ts
import {
  createRuleRegistry,
  registerLogicBibleRules,
  RulePipeline,
  createRuleExecutor,
} from "@/core/rules";

const registry = createRuleRegistry();
registerLogicBibleRules(registry);
const pipeline = RulePipeline.fromRegistry(registry);
const { results, log } = createRuleExecutor(registry).execute(pipeline, ctx);
```

Prefer the full path used in production:

```ts
import { runDecisionPipeline, generatePlan, buildPlanningContext } from "@/core";
// or, from UI: import { getTodayPlan } from "@/application";
```
