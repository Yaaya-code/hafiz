# Hafiz — Migration Log & Architecture Audit

This document tracks:
1. The migration of UI pages from the legacy planning engine to the new
   orchestration architecture.
2. A full architecture audit of the current codebase state.

---

## 1. Project Structure — `src/` Folders

```
src/
  core/           Pure planning brain. No I/O, no React, no Prisma.
  application/    Orchestration layer. Bridges UI ↔ core.
  app/            Next.js App Router pages and API routes.
  components/     Shared UI components (layout, quran, dashboard, onboarding).
  hooks/          Client-side React hooks.
  lib/            Utility and data layer (localStorage, Quran data, audio, sync).
```

### Folder responsibilities

| Folder | Responsibility |
|---|---|
| `src/core` | Domain models, rule engine (Logic Bible), plan generator, SRS revision engine, adapters. **Never imports from UI, React, Prisma, or localStorage.** |
| `src/application` | Orchestrates core: loads profile → builds context → runs decision pipeline → generates plan → persists snapshot. Exposes clean API to UI. |
| `src/app` | Next.js routes. Pages consume `@/application` via hooks. API routes under `api/v1/`. |
| `src/components` | React UI components. No planning logic. Consume hooks and render data. |
| `src/hooks` | `useOrchestratedPlan`, `useHafizProfile`, `useGlobalAudio`, `useSyncProgress`, `useHydratedStorage`, `useIsMounted`. |
| `src/lib` | localStorage stores, Quran static data (surahs, ayahs, juz, mutashabihat JSON), audio helpers, sync, onboarding/sync server actions, mock-data (Phase 4B). |

---

## 2. Application Layer — `src/application/`

### Files

```
src/application/
  index.ts                          Public door — all UI imports from here
  types.ts                          Shared types: LearningSnapshot, TodayPlanResult, etc.
  planning/
    planning-service.ts             PlanningService class + singleton functions
    planning-service.test.ts
  learning/
    execution-service.ts            LearningExecutionService class + singleton functions
    execution-service.test.ts
    execution-types.ts              Event/input types for session completion
  mappers/
    plan-to-dashboard.ts            GeneratedPlan → DashboardPlanView
    plan-to-dashboard.test.ts
  persistence/
    learning-store.ts               LocalLearningStore / MemoryLearningStore
    keys.ts                         localStorage key: hafiz_learning_snapshot_v1
```

### Main Services

**`PlanningService`**
- `getTodayPlan(options?)` → `TodayPlanResult`
- `generateJourneyPlan({ days })` → `JourneyPlanResult`
- `refreshLearningState()` → force-recompute + persist
- `commitDayProgress(events[])` → update SRS memory + optional replan
- `getLearningSnapshot()` → current `LearningSnapshot` from localStorage

**`LearningExecutionService`**
- `completeSession(input)` → records session, updates SRS memory, reruns plan
- `recordReviewOutcome(input)` → SM-2 interval update on a memory item
- `recordMistake(input)` → logs mistake, degrades item strength

**`mapOrchestrationToDashboard(input)`**
- Maps `TodayPlanResult` + optional week/month `JourneyPlanResult` →
  `DashboardPlanView` (steps, revisionRows, forgetRows, weekly, monthly cards,
  coaching message, balance note).

### Orchestration Flow — how UI gets today's plan

```
useOrchestratedPlan (hook)
  └─ getTodayPlan()  [PlanningService]
       └─ generateJourneyPlan({ days: 1 })
            ├─ loadProfile()              [src/lib/user-profile — localStorage]
            ├─ loadAyahProgress()         [src/lib/memorization-store]
            ├─ loadMistakes()             [src/lib/user-activity]
            ├─ getLearningSnapshot()      [LocalLearningStore — hafiz_learning_snapshot_v1]
            ├─ buildPlanningContext()     [src/core/adapters]
            │    ├─ adaptHafizProfileToUserProfile()
            │    └─ adaptAppProgressToUserState()
            ├─ runDecisionPipeline()      [src/core/engine]
            │    ├─ createRuleRegistry()
            │    ├─ registerLogicBibleRules()
            │    ├─ RulePipeline.fromRegistry()
            │    ├─ executor.execute()
            │    └─ buildDecision()
            ├─ generatePlan()             [src/core/planning]
            │    ├─ Quran chunk engine   → NEW_HIFZ items
            │    └─ SRS rank-queue       → NEAR_REVISION / FAR_REVISION items
            └─ persist to localStorage   [LearningSnapshot]

mapOrchestrationToDashboard()
  └─ DashboardPlanView → rendered by DashboardView / journey page / plans/* pages
```

---

## 3. Core Layer — `src/core/`

### Files

```
src/core/
  index.ts                          Re-exports everything
  README.md                         Phase documentation
  models/
    primitives.ts                   SurahNumber, AyahNumber, PageNumber, ISODate, QuranSlice, PlanSlotKind
    user-profile.ts                 UserProfile, MemorizationSelection, MemorizedSurahEntry
    user-state.ts                   UserState (aggregate: hifz + revision + learning + planning + sessions + mistakes)
    hifz-state.ts                   HifzState (currentPointer, track, nearStack, weekHifzLog)
    revision-state.ts               RevisionState (nearStack, farQueue, farIndex, weekLog)
    learning-state.ts               LearningState (effectiveStrength, learningStyle, dailyCapacities)
    planning-state.ts               PlanningState (scenarioId, pointers, queues)
    revision-memory.ts              RevisionMemoryItem, RevisionContentRef, RankedRevisionItem
    todays-plan.ts                  TodaysPlan, PlanSlot
    rule-result.ts                  RuleResult
    session-history.ts              SessionHistory, SessionRecord
    mistake-history.ts              MistakeHistory, MistakeRecord
    planning-context.ts             PlanningContext
    weekly-plan.ts / monthly-plan.ts
  engine/
    decision-runner.ts              runDecisionPipeline() → ValidatedDecisionResult
    types.ts                        IPlanningEngine contract
  rules/
    metadata.ts                     RuleMetadata, RulePriorityBand, RuleCategory
    rule.ts                         IPlanningRule interface
    registry.ts                     RuleRegistry (register/enable/disable/dep graph)
    pipeline.ts                     RulePipeline (ordered snapshot)
    executor.ts                     RuleExecutor (run pipeline with tracing)
    context.ts                      RuleContext / createRuleContext
    result-factory.ts               ruleApplied / ruleNotApplied / ruleError helpers
    trace.ts                        RuleTrace, RuleExecutionLog
    logic-bible/
      s001-weak-memorization-lock.ts   S-001
      s002-beginner-track.ts           S-002
      s003-existing-memorizer-track.ts S-003
      s004-capacity-lock.ts            S-004
      progression/
        p001-readiness-for-new-hifz.ts P-001
        p002-increase-capacity.ts      P-002
        p003-strengthening-threshold.ts P-003
        p004-regression-lock.ts        P-004
      revision/
        r001-revision-priority.ts      R-001
        r002-revision-load.ts          R-002
        r003-forgotten-content-recovery.ts R-003
        r004-revision-stability-gate.ts    R-004
      predicates.ts / index.ts
    resolution/
      merge-results.ts               foldResult, mergeRankedResults
      decision-builder.ts            buildDecision()
      decision-validator.ts          validateDecision()
      conflict-resolver.ts           resolveScalarConflict
      priority-engine.ts             sortByResolutionPriority
      explainability.ts              buildDecisionEffects, normalizeReasons
      types.ts                       Decision, DecisionReason, ConflictRecord
  adapters/
    profile-adapter.ts              adaptHafizProfileToUserProfile()
    state-adapter.ts                adaptAppProgressToUserState(), createDefaultUserState()
    planning-context-builder.ts     buildPlanningContext()
    types.ts                        HafizProfileSource, AppProgressSource, AppMistakeItem
  planning/
    plan-generator.ts               generatePlan() — multi-day, SRS + chunk engine
    types.ts                        PlanItem, PlanDay, GeneratedPlan, PlanItemType
    quran/
      chunk-engine.ts               createNextHifzChunk(), advancePointer()
      default-geometry.ts           createDefaultQuranGeometry() / createMetadataQuranGeometry()
      types.ts                      QuranGeometry, QuranChunk, QuranPointer
  revision/
    srs-intervals.ts                createMemoryItem(), computeNextInterval(), applyReviewOutcome()
    rank-queue.ts                   rankRevisionItems(), selectRevisionItemsForCapacity()
    scoring.ts                      scoreRevisionItem(), compareRankedRevision()
    near-revision.ts                scheduleNearRevision(), applyNearReviewOutcome()
    dates.ts                        addDays(), dayDiff(), clamp01()
  utils/
    ids.ts                          nanoid-style id generation
    dates.ts                        toIsoDate, addDays
```

### Rules Currently Implemented (Logic Bible)

| ID | Name | Effect |
|---|---|---|
| S-001 | Weak Memorization Lock | Disables new hifz; 100% revision capacity; listening + mistake flags |
| S-002 | Beginner Track | Routes to Juz Amma bottom-up (An-Nas → An-Naba); no revision until first hifz |
| S-003 | Existing Memorizer Track | Consecutive → continue forward; fragmented → revision-only |
| S-004 | Capacity Lock | Hard minute ceiling for revision+hifz+listening+quiz |
| P-001 | Readiness for New Hifz | Gates new hifz on stability indicators |
| P-002 | Increase Capacity | Allows page capacity increase when stable |
| P-003 | Strengthening Threshold | Triggers extra revision when below threshold |
| P-004 | Regression Lock | Locks progression when stability drops |
| R-001 | Revision Priority | Elevates revision share when overdue items detected |
| R-002 | Revision Load | Adjusts item count based on available minutes |
| R-003 | Forgotten Content Recovery | Forces recovery items into near queue |
| R-004 | Revision Stability Gate | Blocks new hifz when stability is below gate |

### Decision Pipeline

```
PlanningContext { profile, state, asOfDate }
  → createRuleRegistry()
  → registerLogicBibleRules()          (S + P + R rules)
  → RulePipeline.fromRegistry()
  → RuleExecutor.execute(pipeline, ctx) → RuleExecutionLog
  → buildDecision(results)             → Decision
  → validateDecision(decision)         → DecisionValidationResult
  → ValidatedDecisionResult {
      decision, validation, conflicts,
      rankedOrder, appliedRules, asOfDate
    }
```

### Key Types

**`Decision`** (output of pipeline)
```ts
{
  track: DecisionTrack           // bottom_up | continue_from_last_surah | fragmented_revision_only
  newHifzEnabled: boolean
  revisionOnly: boolean
  allowNewHifz: boolean
  lockProgression: boolean
  recoveryRequired: boolean
  revisionPriority: boolean
  additionalListeningPractice: boolean
  additionalMistakeReview: boolean
  dailyCapacity: { minutes?, pages? }
  appliedRules: string[]
  reasons: DecisionReason[]
}
```

**`PlanItem`** (output of plan generator)
```ts
{
  id: string
  type: "NEW_HIFZ" | "NEAR_REVISION" | "FAR_REVISION" | "LISTENING" | "QUIZ"
  sourceRange?: { surah, fromAyah, toAyah, fromSurah, toSurah, startPage, endPage, pagesApprox }
  surah?: number
  page?: number
  estimatedMinutes: number
  labelAr?: string
  revisionMemoryId?: string    // links to RevisionMemoryItem.id
  priorityScore?: number
  priorityReasons?: string[]
}
```

**`RevisionMemoryItem`** (SRS unit)
```ts
{
  id: string
  content: RevisionContentRef  // surah, page, fromAyah, toAyah, pagesApprox, labelAr
  lastReviewedAt: ISODate | null
  reviewCount: number
  mistakesCount: number
  successRate: number          // 0–1
  strengthScore: number        // 0–1
  stabilityScore: number       // 0–1
  nextReviewDate: ISODate | null
  intervalDays: number         // SM-2 interval
  easeFactor: number           // ≥ 1.3
  consecutiveSuccesses: number
  consecutiveFailures: number
  isNear?: boolean
  urgent?: boolean
  source?: "new_hifz" | "near_carry" | "far_corpus" | "foundation" | "manual"
}
```

**`LearningSnapshot`** (persisted to localStorage)
```ts
{
  version: 1
  updatedAt: string
  userState: UserState | null      // core engine state (pointers, queues)
  revisionMemory: RevisionMemoryItem[]
  planCache: Record<string, GeneratedPlan>
  lastDecision?: { asOfDate, appliedRules, validation, decision }
}
```

---

## 4. Data Models Summary

### User / Profile

| Model | Location | Description |
|---|---|---|
| `HafizProfile` | `src/lib/user-profile.ts` | App-facing profile stored in localStorage. Name, pagesPerDay, dailyMinutes, memorizationSelection, learningStyle, revisionStyle, preferredQariId, onboardingComplete, plan. |
| `UserProfile` | `src/core/models/user-profile.ts` | Core domain profile. Immutable input to rule engine. memorizationStrength 1–5, goals, progressionMode, flags. |
| `UserState` | `src/core/models/user-state.ts` | Live operational state. Persisted between days inside LearningSnapshot.userState. Contains HifzState, RevisionState, LearningState, PlanningState, SessionHistory, MistakeHistory. |

### Plan Models

| Model | Location | Description |
|---|---|---|
| `GeneratedPlan` | `src/core/planning/types.ts` | Full output of `generatePlan()`. Contains `days[]`, `startingState`, `endingState`, `endingRevisionMemory`, `meta`. |
| `PlanDay` | `src/core/planning/types.ts` | One day: `dayNumber`, `date`, `items: PlanItem[]`, `totalMinutes`. |
| `PlanItem` | `src/core/planning/types.ts` | One work unit. Type: NEW_HIFZ / NEAR_REVISION / FAR_REVISION / LISTENING / QUIZ. |
| `TodaysPlan` | `src/core/models/todays-plan.ts` | Higher-level plan structure with `slots[]`, `coachingMessageAr`, `scenarioId`. (Currently used by `DashboardPlanView` adapter.) |
| `TodayPlanResult` | `src/application/types.ts` | What `getTodayPlan()` returns to UI. Contains `plan`, `today` (first PlanDay), `decision`, `appliedRules`, `fromCache`. |
| `DashboardPlanView` | `src/application/mappers/plan-to-dashboard.ts` | UI view model. Steps, revision blocks, forget rows, weekly/monthly cards. |

### Memory / Revision Models

| Model | Location | Description |
|---|---|---|
| `RevisionMemoryItem` | `src/core/models/revision-memory.ts` | Single SRS-tracked unit. SM-2 fields, isNear, urgent, source. |
| `RankedRevisionItem` | `src/core/models/revision-memory.ts` | Scored row from `rankRevisionItems()`. Contains item + priorityScore + reasons. |
| `RevisionState` | `src/core/models/revision-state.ts` | nearStack (recent hifz), farQueue (full corpus), weekLog. |

### Session / Completion Models

| Model | Location | Description |
|---|---|---|
| `SessionRecord` | `src/core/models/session-history.ts` | One completed session in UserState. kind, outcome, date, target. |
| `CompleteSessionInput` | `src/application/learning/execution-types.ts` | Input to `completeSession()`. sessionKind, planItemId, revisionMemoryId, outcome, quality, surahNumber. |
| `LearningProgressEvent` | `src/application/learning/execution-types.ts` | Union type for all progress events: plan_item_completed, review_outcome, session_completed, mistake_recorded, invalidate_plan_cache. |
| `CommitProgressResult` | `src/application/learning/execution-types.ts` | Result of committing progress. snapshot, replanRecommended, today?. |

---

## 5. Legacy Code Status

### Removed (Phase 3 + Phase 4A)

| File | Status |
|---|---|
| `src/lib/daily-plans.ts` | ✅ Deleted (Phase 3 cleanup) |
| `src/lib/plan-engine.ts` | ✅ Deleted (Phase 3 cleanup) |
| `src/lib/actions/revision.ts` | ✅ Deleted (Phase 4A — zero callers) |
| `src/lib/actions/mistakes.ts` | ✅ Deleted (Phase 4A — zero callers) |
| `src/lib/quran/revision-ai.ts` | ✅ Deleted (Phase 4A — superseded by llm-provider / RAG) |
| `src/lib/quran/recitation-compare.ts` | ✅ Deleted (Phase 4A — zero callers) |

**Kept on purpose:** `src/lib/quran/quran-phonetic.ts` (used by live-recitation + quran-rag).

**Deferred (still used by mock-data):** `src/lib/srs.ts`, `src/lib/types.ts` — clean up after Phase 4B mock migration.

### Remaining Migration Targets

| File | Status | Notes |
|---|---|---|
| `src/components/layout/app-header.tsx` | ⚠️ Partial mock | Shows `currentUser.hafizScore` from mock-data. Should read from real profile/orchestration. |
| `src/app/(app)/planner/page.tsx` | ⚠️ Mock only | Uses `currentUser` and `pageStats` from mock-data. Not wired to orchestration. |
| `src/app/(app)/goals/page.tsx` | ⚠️ Mock only | Uses `achievements` and `goals` from mock-data. |
| `src/app/(app)/quiz/page.tsx` | ⚠️ Hardcoded questions | 5 hardcoded questions. Not wired to SRS engine. |
| `src/app/api/v1/revision/queue/route.ts` | ⚠️ Mock | Returns hardcoded mock data. |
| `src/app/api/v1/analytics/hafiz-score/route.ts` | ⚠️ Mock | Returns hardcoded mock data. |

---

## 6. Current App Pages — `src/app/(app)/`

### Fully migrated (use orchestration layer)

| Page | Route | What it does |
|---|---|---|
| `dashboard/page.tsx` | `/dashboard` | Main hub. Uses `useOrchestratedPlan` for plan data. Shows coaching, steps, revision rows, forget risk, streak. Some chrome still uses mock (score, achievements). |
| `plans/journey/page.tsx` | `/plans/journey` | Daily journey with sequential step unlock. Uses `useOrchestratedPlan` for steps. Calls `completeSession` on each step. |
| `plans/new/page.tsx` | `/plans/new` | New hifz ward. Uses `useOrchestratedPlan`. Shows NEW_HIFZ item. Graceful fallback when hifz disabled. ✅ Migrated in Phase 3. |
| `plans/revision/page.tsx` | `/plans/revision` | Revision checklist. Uses `useOrchestratedPlan`. Shows NEAR+FAR items with SRS reasons. ✅ Migrated in Phase 3. |
| `listen-memorize/page.tsx` | `/listen-memorize` | 6-phase listening memorization. Seeded from orchestrated NEW_HIFZ item or URL params. ✅ Migrated in Phase 3. |
| `plan-reveal/page.tsx` | `/plan-reveal` | First-time plan wow screen. Uses `refreshLearningState` + `generateJourneyPlan`. |

### Fully working (use real local data, not mock)

| Page | Route | What it does |
|---|---|---|
| `session/revision/page.tsx` | `/session/revision` | Full surah session: audio, live voice recitation, bookmarks, notes, SurahGuide. Calls `completeSession` + `recordMistake`. |
| `session/listen/page.tsx` | `/session/listen` | Per-ayah audio listening session. Calls `completeSession`. |
| `session/quiz/page.tsx` | `/session/quiz` | Inline quiz for a range of ayahs. Calls `completeSession` + `recordMistake`. |
| `session/reflect/page.tsx` | `/session/reflect` | End-of-day reflection + note. Calls `completeSession`. |
| `quran/page.tsx` | `/quran` | Full Quran reader with audio, bookmarks, notes, position memory. |
| `mutashabihat/page.tsx` | `/mutashabihat` | Similar verses browser. Surah filter, group viewer, highlighted diffs. |
| `mutashabihat/practice/page.tsx` | `/mutashabihat/practice` | Practice similar verses. |
| `qaris/page.tsx` | `/qaris` | Qari library. Preview audio, select preferred qari (saved to profile). |
| `mistakes/page.tsx` | `/mistakes` | Reads real mistake log from localStorage. Shows guidance, resolve action. |
| `stats/page.tsx` | `/stats` | Real data: streak, ayah progress, mastered count, mistakes. |
| `achievements/page.tsx` | `/achievements` | Real localStorage achievements + streak. |
| `settings/page.tsx` | `/settings` | Profile editing, sync status, speech capability, theme, reset onboarding. |

### Partially wired / mock data

| Page | Route | Status |
|---|---|---|
| `planner/page.tsx` | `/planner` | Uses mock `pageStats`. "تفعيل الخطة" button does nothing. |
| `goals/page.tsx` | `/goals` | Uses mock goals + achievements arrays. |
| `quiz/page.tsx` | `/quiz` | 5 hardcoded questions. `quizTypes` from mock-data does nothing. |
| `social/page.tsx` | `/social` | UI stub with mock data. |
| `teacher/page.tsx` | `/teacher` | UI stub with mock students/classes. |
| `admin/page.tsx` | `/admin` | UI stub with mock `pageStats`. |
| `notes/page.tsx` | `/notes` | Shows localStorage notes. Functional but basic UI. |
| `bookmarks/page.tsx` | `/bookmarks` | Shows localStorage bookmarks. Functional but basic UI. |
| `search/page.tsx` | `/search` | Basic ayah text search in local data. Functional. |

### Redirect-only stubs

| Page | Route | Redirects to |
|---|---|---|
| `revision/page.tsx` | `/revision` | `/plans/journey` |
| `memorize/page.tsx` | `/memorize` | `/plans/new` |
| `voice/page.tsx` | `/voice` | `/plans/journey` |
| `map/page.tsx` | `/map` | `/plans/journey` |
| `focus/page.tsx` | `/focus` | `/plans/journey` |
| `notifications/page.tsx` | `/notifications` | `/settings` |

---

## 7. Current State Summary

### ✅ Completed

- `src/core` — Full brain: 12 Logic Bible rules, SRS engine, chunk engine, adapters, decision pipeline. Well-tested.
- `src/application` — Full orchestration: PlanningService, LearningExecutionService, plan-to-dashboard mapper, LocalLearningStore.
- Dashboard (`/dashboard`) — Connected to orchestration.
- Plan reveal (`/plan-reveal`) — Connected to orchestration.
- Daily journey (`/plans/journey`) — Connected to orchestration.
- All session pages — Call `completeSession` / `recordMistake` from `@/application`.
- **Phase 3 migration:** `plans/new`, `plans/revision`, `listen-memorize` — all migrated from `daily-plans.ts` to orchestration layer.
- **Phase 3 cleanup:** `daily-plans.ts` and `plan-engine.ts` deleted.
- **Phase 4A cleanup:** dead server actions (`revision.ts`, `mistakes.ts`) and unused Quran helpers (`revision-ai.ts`, `recitation-compare.ts`) deleted.

### ⚠️ Partially Migrated

- **Dashboard header** (`app-header.tsx`) — Shows hardcoded `currentUser.hafizScore` from mock-data instead of real data.
- **Dashboard chrome** (`dashboard-view.tsx`) — Plan/coaching section is real; score shell, goals snippet, weekly analytics section still use mock-data.

### ❌ Missing / Not Yet Started (Phase 4B+)

- **Mock chrome** — Replace mock Hafiz score, goals, planner stats, weekly analytics with real local stores + learning snapshot.
- **Auth** — No `middleware.ts`. `/(app)/*` routes are publicly accessible. Login/signup forms are non-functional HTML forms.
- **API routes** — `/api/v1/revision/queue` and `/api/v1/analytics/hafiz-score` return hardcoded mock data.
- **Planner, Goals, Quiz** — Still on mock data with no real wiring.
- **Notification preferences** — Settings checkboxes do not persist.
- **Deferred cleanup** — `src/lib/srs.ts` and legacy shapes in `src/lib/types.ts` after mock-data migration.

### Recommended Next Migration Order (Phase 4B+)

| Order | Task | Impact |
|---|---|---|
| 1 | Replace mock Hafiz score in `app-header.tsx` / dashboard with real data | Every page shows wrong score |
| 2 | Connect `planner/page.tsx` to orchestration | Remove mock dependency |
| 3 | Connect `goals/page.tsx` to real progress | Remove mock dependency |
| 4 | Wire `quiz/page.tsx` to SRS engine | Real quiz from weak items |
| 5 | After mock-data shrinks: clean `lib/srs.ts` / legacy `lib/types.ts` usage | Remove dual SRS surface |
| 6 | Add auth `middleware.ts` to protect `/(app)/*` | Security — all routes currently open |
| 7 | Wire login/signup to real auth (NextAuth / Clerk) | Users can't actually authenticate |

---

## Phase 4C — Plan Cache Invalidation Strategy

| Trigger | Behavior |
|---|---|
| Session complete / review / progress commit | `planCache = {}`, `cacheMeta` cleared; optional auto-replan via `refreshLearningState` |
| Profile change (`hafiz-profile-updated`) | `useOrchestratedPlan` force-replans today |
| Fingerprint mismatch (capacity, goals, scope, memory, pointer) | Full cache wipe + recompute |
| Calendar day rollover | Keys not matching today's `asOfDate` pruned |
| Multi-day horizon (7/30/90) | Cached for display only — **never** commits simulated `endingState` into durable userState |
| 1-day / today plan | Commits durable `userState` + `revisionMemory` |
| Explicit `invalidatePlanCache()` / `refreshLearningState()` | Clears cache then recomputes today |

Fingerprint inputs: pagesPerDay, dailyMinutes, revision style/strength, progression, goals, memorization selection, revision memory review signals, hifz pointer identity.

---

## Phase 3 Migration — Change Log

### ✅ `src/app/(app)/plans/new/page.tsx`

**Removed:** `buildDailyJourney`, `getNextMemorizationTarget` from `@/lib/daily-plans`

**Added:** `useOrchestratedPlan`, `PlanItem` from `@/application`, `getSurah` from `@/lib/quran`

**Behavior:** Reads first `NEW_HIFZ` item from `today.today.items`. Session href carries real `planItemId` + `revisionMemoryId`. Graceful fallback when hifz disabled by brain.

---

### ✅ `src/app/(app)/plans/revision/page.tsx`

**Removed:** `buildDailyJourney` from `@/lib/daily-plans`

**Added:** `useOrchestratedPlan`, `PlanItem` from `@/application`

**Behavior:** Reads `NEAR_REVISION` + `FAR_REVISION` items from `today.today.items`. Shows SRS priority reasons. Near badge on near items. Real `planItemId` + `revisionMemoryId` in session hrefs.

---

### ✅ `src/app/(app)/listen-memorize/page.tsx`

**Removed:** `getNextMemorizationTarget` from `@/lib/daily-plans`

**Added:** `useOrchestratedPlan`, `useSearchParams`, `Suspense` wrapper

**Behavior:** Seed priority — URL params → orchestrated NEW_HIFZ → safe defaults. All 6 learning phases unchanged.

---

## TypeScript Verification

All phases: `npx tsc --noEmit` → exit code 0, zero errors.
