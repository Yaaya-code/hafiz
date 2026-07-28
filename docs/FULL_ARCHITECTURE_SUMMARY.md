# Hafiz — Full Project Architecture Summary (A→Z)

> **Audience:** AI collaborators, staff engineers, product partners.  
> **Status:** Production-hardening stage (local-first + optional cloud sync).  
> **Stack:** Next.js 15 · React 19 · Prisma · TypeScript · Vitest · everyayah CDN.

This document explains the **entire system** from first principles through the gamified test engine, recitation pipeline, Madani page map, and event-driven sync layer.

---

## 0. Product Intent

**Hafiz** is a Quran memorization companion that:

1. Builds a **daily plan** from the user’s real memorization map (not generic “read N ayahs”).
2. Measures progress in **Madani mushaf pages (1–604)** as production truth.
3. Runs **scoped revision/hifz sessions** (StartAyah–EndAyah only — never dump full Al-Baqarah for a 16-ayah wird).
4. Scores **live Arabic recitation** only on that scoped word stream.
5. Generates **infinite adaptive quizzes** from weak spots, mutashabihat, and error bank.
6. Stays **local-first** (LearningSnapshot + safe localStorage) with optional JWT/Prisma sync.

---

## 1. Repository Layout (mental map)

```
src/
  app/                    # Next.js App Router (UI routes + API)
    (app)/                # Authenticated shell: dashboard, journey, session, quiz…
    api/v1/               # REST: analytics, sync, mutashabihat…
    onboarding/           # Multi-track onboarding
  application/            # Application services (ports for UI)
    planning/             # PlanningService, hifz-cursor, plan-cache, SRS init
    learning/             # ExecutionService: completeSession, recordMistake
    persistence/          # LearningSnapshot store + events
    mappers/              # plan → dashboard view models
  core/                   # Domain engine (no React)
    models/               # Pure types: UserState, RevisionMemory, RuleResult…
    architecture/         # Path resolver, memorization map, strength, mutashabihat intel
    planning/             # plan-generator, sequential-revision, day packer, Madani geometry
    revision/             # SRS intervals, ranking, near-revision
    rules/                # Logic Bible (P/R/S rules) + executor + resolution
    adapters/             # App profile/progress → UserState / PlanningContext
  lib/                    # Cross-cutting client libs
    quran/                # Surahs, ayahs, audio, Madani map, speech, mutashabihat DB
    storage/              # safe-storage + STORAGE_KEYS + emitStorageEvent
    sync/                 # local-snapshot merge + server-sync
    quiz-from-learning.ts # Gamified exam generator
    user-activity.ts      # Mistakes, streak, achievements, quiz results
  components/             # UI primitives + dashboard/quran widgets
  hooks/                  # useOrchestratedPlan, useHafizProfile, useSyncProgress…
prisma/schema.prisma      # Server User, Progress, Mistake, Session…
docs/                     # Architecture, API, production notes
```

**Import rule of thumb**

| Layer | May import | Must not import |
|--------|------------|-----------------|
| `core/` | only other core + pure data | React, Next, Prisma client UI |
| `application/` | core + lib persistence | page components |
| `app/` / `components/` | application + lib | deep engine internals when a service exists |

Public façade: `@/application` (`getTodayPlan`, `completeSession`, `recordMistake`, `getLearningSnapshot`…).

---

## 2. Core Architecture — Local-First + Madani Truth

### 2.1 Local-first LearningSnapshot

- Key store: `application/persistence/learning-store.ts`
- Event: `LEARNING_SNAPSHOT_EVENT` (`hafiz-learning-snapshot-updated`)
- Holds: revision memory items, hifz cursor, plan cache keys, progress signals.

UI never “owns” plan math. Flow:

```
Profile (onboarding)
  → adapters.buildPlanningContext
  → Decision (Logic Bible rules)
  → generatePlan / sequential revision pack
  → TodayPlanResult
  → mapOrchestrationToDashboard
  → Journey UI / Session links
```

On session end:

```
completeSession / recordMistake
  → ExecutionService.commitProgress
  → update LearningSnapshot
  → emit LEARNING_SNAPSHOT_EVENT
  → recordActivity / bumpStreak / achievements
  → emit hafiz-activity (+ specialized events)
  → Dashboard / Stats / Achievements listeners refresh
```

### 2.2 Madani pages (1–604)

**Truth unit for revision volume = mushaf face (Page_ID), not “ayah count ≈ pages”.**

| Asset | Role |
|--------|------|
| `src/lib/quran/data/madani-pages.json` | Exact offline map (imported from Quran.com page boundaries) |
| `madani-page-map.ts` | Lookup helpers |
| `page-boundaries.ts` | Surah/ayah ↔ page |
| `memorized-pages.ts` | Full-page-only skip set for NEW_HIFZ (partial pages are **not** skipped) |

**Sequential N-page revision** (`core/planning/sequential-revision.ts`):

- Packs **N unique Page_IDs** with no gaps.
- Cursor does not advance past dropped units.
- Loop wrap for circular revision of memorized corpus.
- `mergeConsecutiveSameSurahUnits` → UI label like:  
  `البقرة · 1–16 · ص 2–3`

### 2.3 Multi-track usage

`usageTrack` on profile (`lib/usage-track.ts`):

| Track | Engine | UI |
|--------|--------|-----|
| `AUTOMATIC_PLAN` | Full daily plan + journey | Default dashboard |
| `EXTERNAL_TRACKER` | **Off** — optional single `manualWird` item | `ManualWirdCard` on dashboard + settings: set surah/from/to → scoped session/quiz |
| `FREE_EXPLORER` | **Off** — empty shell | `CreatePlanCta`: one-click → `AUTOMATIC_PLAN` + `/plan-reveal` |

Helpers:

- `buildManualWird` / `profileWithManualWird` / `manualWirdSessionHref`
- `profileWithAutomaticPlan` + `invalidatePlanCache()` on convert

Hifz pointer skip: only **fully memorized pages** are skipped so “1–100” continues at 101, not mid-page holes.

---

## 3. Data Model & Schemas

### 3.1 Client profile (`HafizProfile` — `lib/user-profile.ts`)

```
version, name, onboardingComplete
pagesPerDay, revisionPagesPerDay, dailyMinutes
memorizationStrength (1–5), revisionStyle
memorizationSelection (SURAH | JUZ | RANGE | …)
usageTrack, hasActivePlan, progressionMode
preferredQariId, journey?, plan?: StoredPlan
```

### 3.2 Learning / revision memory (domain)

`RevisionMemoryItem` (core models): content span (surah/from/to/pages), strengthScore, mistakesCount, nextReviewDate, urgent flag.

`UserState` aggregates: progress, mistakes history, session history, hifz pointer.

### 3.3 Error bank (User_Error_Bank)

Implemented as **`MistakeItem[]`** in `STORAGE_KEYS.mistakes` via `logMistake` / `recordMistake`:

```
id, surahNumber, ayahNumber?, pageNumber?
type: MISSING_WORD | WRONG_WORD | QUIZ_WRONG | MUTASHABIH | …
difficulty, frequency, note, createdAt, updatedAt
```

Speech pipeline writes `MISSING_WORD` / `WRONG_WORD` with note  
`المتوقع «…» · سمعت «…»`.  
Quiz wrong answers write `QUIZ_WRONG`.  
Mistakes page + quiz “بنك الأخطاء” consume the same bank.

### 3.4 Achievements & streak

`STORAGE_KEYS.achievements`, `STORAGE_KEYS.streak`  
Defs in `user-activity.ts` (first review, streaks, quiz_perfect, quiz_10, hardcore_pass…).

### 3.5 Server (Prisma) — optional cloud

Users, progress aggregates, mistakes, sessions — merged through `lib/sync/*` (LWW-style merge for local snapshot). App remains usable offline.

---

## 4. Engine Logic — Daily Plan & Pointers

### 4.1 Pipeline

```
Profile
  → Map / Path (memorization-map, path-resolver)
  → Decision (decision-runner + Logic Bible rules P/R/S)
  → Plan (plan-generator + day-revision-packer + sequential-revision)
  → Session (UI: /session/revision?surah&from&to)
  → Actual (completeSession → snapshot + replan)
```

### 4.2 Hifz cursor

`application/planning/hifz-cursor.ts` + bootstrap-from-profile:

- Resolves next NEW_HIFZ start from selection + skip set.
- Guards against “Nas flood” / wrong surah flips via plan cache + decision tracks.
- Soft rules when `pagesPerDay > 0` so revision-only modes do not kill all new hifz without reason (P-001 soft allow).

### 4.3 Logic Bible (examples)

| ID | Concern |
|----|---------|
| P-001 | Readiness for new hifz (strength + mistakes + session consistency) |
| R-003 / R-004 | Revision load / priority |
| S-001 / S-003 | Track / continue_forward |

Rules return `RuleResult` with `overrides`, `meta` (string|number|boolean only — no `undefined` values).

### 4.4 Plan cache

`plan-cache.ts` keys by date + horizon (1/7/30).  
Session/mistake commits invalidate so tomorrow’s plan reflects today’s actuals.

---

## 5. Recitation & Audio Pipeline

### 5.1 Strict range rendering

`session/revision/page.tsx`:

- `focusFrom` / `focusTo` from query (never default full surah; default window ~15 ayahs if `to` missing).
- `ayahs = allAyahs.filter(in range)` only.
- Sticky bottom bar: **أتممت بنجاح** → scoped `/session/quiz?surah&from&to`.
- **اقرأ وخلف الشيخ**: play scoped wird → auto-start mic recitation.

### 5.2 Scoped speech engine

```
getReciteAyahsList()  // clamped to wird
  → buildLiveWordStream(ayahs)
  → matchLive(stream, transcript)
  → stats.total / matched / incorrect / missing / accuracy  // ALL scoped
```

Realtime CSS:

- correct → emerald  
- missing → amber wavy  
- incorrect → **red** highlight  

Post: error cards (expected / heard / location) + `recordMistake` → error bank.

### 5.3 Audio / Qaris

CDN: `https://everyayah.com/data/{folder}/{SSS}{AAA}.mp3` (verse-by-verse).

| API | Behavior |
|-----|----------|
| `QARIS` | Catalog of known packs |
| `INCOMPLETE_QARI_IDS` | Never shown in UI |
| `getAvailableQaris()` | Filter complete packs |
| `resolvePlayableQariId()` | Prefer user choice else Alafasy |
| Playback `onError` | Fallback URL → Alafasy |

**Procurement audit (current):**

| Reciter | Verdict |
|---------|---------|
| Mustafa Ismail | everyayah incomplete (~4220 missing) → **excluded** |
| Islam Sobhi | **No** full 114 V2V on everyayah; third parties partial/surah-level → **excluded** |
| Hazza Al Balushi (هزاع البلوشي) | **Absent** from everyayah V2V; way2quran ~98 surahs; mp3quran surah packs → **excluded**. Runtime Alafasy fallback on 404. |

Documented in `QARI_CDN_AUDIT` + `INCOMPLETE_QARI_IDS` inside `lib/quran/audio.ts`.

### 5.4 Mutashabihat highlight

`HighlightedAyah`: soft pastel amber background (`bg-amber-200/35`) — keeps original text contrast (no opaque gold wash).

---

## 6. Testing System (Gamified Multi-Tier Engine)

**Generator:** `lib/quiz-from-learning.ts`  
**UI:** `app/(app)/quiz/page.tsx`  
**Scoped daily test:** `app/(app)/session/quiz/page.tsx` (auto after successful wird).

### 6.1 Modes & tiers

| Mode | Tier | Format |
|------|------|--------|
| معركة المتشابهات | tactical | MCQ surah among similars |
| الآية التالية (سرعة) | fun | MCQ + **timer** (12s / 8s hardcore) |
| اختبار الترتيب | fun | **Reorder** 3–5 consecutive ayahs |
| اسم السورة | easy | MCQ |
| أوائل وأواخر | tactical | Edge position / identify |
| الامتحان الشامل الصعب | hard | Mix + stricter pass **80%** |
| بنك الأخطاء | tactical | From `loadMistakes()` |
| نطاق مخصص | easy | User surah + from–to → `buildScopedQuiz` |

### 6.2 Question formats

- `mcq` — pick option index  
- `speed` — mcq + `timeLimitSec`  
- `reorder` — `reorderItems` correct order; UI builds ordered picks  

Pass thresholds: `quizPassThreshold(kind)`.

### 6.3 Sync on quiz end

```
completeSession(sessionKind: "quiz")
recordQuizResult({ modeId, score, total, perfect, hardcore })
  → bumpAchievements (quiz_perfect, quiz_10, hardcore_pass)
  → emit hafiz-activity
  → emit hafiz-quiz-completed
  → emit hafiz-achievements-updated
```

Dashboard / Stats / Achievements subscribe to these events.

---

## 7. Global Sync Layer (Event-Driven)

### 7.1 Event bus (browser CustomEvents via `emitStorageEvent`)

| Event | Producers | Consumers |
|-------|-----------|-----------|
| `hafiz-learning-snapshot-updated` | learning-store | dashboard, plan hooks |
| `hafiz-activity` | streak, mistakes, activity, quiz | dashboard, stats, achievements |
| `hafiz-quiz-completed` | recordQuizResult | dashboard, stats, achievements |
| `hafiz-achievements-updated` | bumpAchievements | achievements page |
| `hafiz-mem-updated` | memorization-store | dashboard, stats |
| `hafiz-journey-updated` | journey-progress | dashboard |
| `hafiz-mutashabihat-progress` | mutashabihat-progress | stats |
| `hafiz-sync-applied` | cloud merge | all refresh listeners |
| `hafiz-profile-updated` | saveProfile | profile hooks |

### 7.2 Guarantees

1. **completeSession** always bumps activity/streak and commits snapshot.  
2. **recordMistake** updates error bank + optional memory mistake counts.  
3. **passQuiz / recordQuizResult** unlocks badges and refreshes dashboard without reload.  
4. Local writes go through `safeSetJSON` (try/catch, SSR-safe).  
5. Cloud path: `useSyncProgress` / `api/v1/sync` merges without wiping local banks.

### 7.3 Production LWW / offline hard rules

| Bank | Rule |
|------|------|
| `STORAGE_KEYS.mistakes` | **Always union** by `id`; same id → LWW on `updatedAt` (`mergeByIdLww`). Never pure replace-wipe on login. |
| `STORAGE_KEYS.streak` | `mergeStreakLww`: never wipe; max current/longest; prefer later `lastActiveDate`. |
| `preferredQariId` | Intent merge sticky; local non-default preference not dropped for empty cloud. |
| Audio offline | `playGlobalAudio` + `fallbackUrl` + soft `hafiz-audio-notice` toast — session never crashes. |
| LearningSnapshot | Cursor never regresses (max pointer); forecast discarded. |

---

## 8. Auth & App Shell

- Middleware protects `(app)/*` routes.  
- JWT session (`lib/auth/*`).  
- Onboarding gate until `onboardingComplete`.  
- Plan reveal wow-flow: `/plan-reveal` then dashboard/journey.

---

## 9. Key User Journeys (end-to-end)

### A. First-time AUTOMATIC_PLAN

1. Onboarding track → memorized selection → strength/style → generate plan.  
2. `resetLearningForNewProfile` → bootstrap pointer from selection.  
3. Plan reveal → journey steps (revision units + NEW_HIFZ).  
4. Open revision session with `?surah=&from=&to=`.  
5. Listen / recite scoped → complete → daily scoped quiz.  
6. Snapshot + streak + achievements update live.

### B. Recitation failure loop

1. Wrong/missing words → red/amber live marks.  
2. stopRecite → error cards + `recordMistake`.  
3. Mistakes center + error-bank quiz target those ayahs.  
4. Next plan replan soft-prioritizes weak memory.

### C. Free explorer

Minimal plan shell, dashboard free tools, no forced journey monopoly.

---

## 10. Testing & Quality Gates

```bash
npx vitest run          # domain + application + quiz + madani tests
npx tsc --noEmit        # zero errors target
```

Notable suites:

- sequential revision / N-page / merge labels  
- hifz-cursor / pointer-trace / journey-entry-audit  
- execution-service completeSession / recordMistake  
- quiz-from-learning gamified modes + qari audit  
- auth config production secrets  

---

## 11. Production Hardening Checklist (current)

- [x] Madani exact page map (no linear approx)  
- [x] N-page sequential revision without cursor gaps  
- [x] Multi-track onboarding  
- [x] Strict range session UX + sticky complete  
- [x] Scoped speech accuracy  
- [x] Soft mutashabihat highlight  
- [x] Incomplete qari exclusion + Alafasy fallback  
- [x] Gamified multi-tier quiz engine  
- [x] Event-driven dashboard/achievements/error bank sync  
- [x] Zero TypeScript errors (onboarding + P-001 fixed)  
- [x] EXTERNAL_TRACKER manual wird UI (dashboard + settings)  
- [x] FREE_EXPLORER → AUTOMATIC_PLAN one-click CTA  
- [ ] Islam Sobhi / Hazza Al Balushi when full 114 V2V CDN packs exist  
- [ ] Expand cloud conflict UI for multi-device power users  

---

## 12. File Hotspots for AI Collaborators

| Task | Start here |
|------|------------|
| Change daily revision packing | `core/planning/sequential-revision.ts`, `day-revision-packer.ts` |
| Change plan composition | `core/planning/plan-generator.ts`, `application/planning/planning-service.ts` |
| Session UX / speech | `app/(app)/session/revision/page.tsx`, `lib/quran/live-recitation.ts` |
| Quiz modes | `lib/quiz-from-learning.ts`, `app/(app)/quiz/page.tsx` |
| Qaris | `lib/quran/audio.ts` |
| Mistakes / badges | `lib/user-activity.ts` |
| Madani map | `lib/quran/madani-page-map.ts`, `data/madani-pages.json` |
| Sync events | `lib/storage/safe-storage.ts`, learning-store, dashboard-view |
| Multi-track UI | `lib/usage-track.ts`, `components/track/*`, settings + dashboard-view |
| Empty manual plans | `planning-service.ts` → `emptyManualTrackPlan` |

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| Wird | Today’s assigned span (pages/ayahs) |
| Page_ID | Madani face 1–604 |
| Scoped | Computed only on assigned ayah range |
| Error bank | Accumulated speech/quiz mistakes |
| Logic Bible | Named pedagogical rules (P/R/S) |
| LearningSnapshot | Local serialized engine state |
| Hardcore | Mixed exam, 80% pass, tighter timers |

---

*Last updated for: Hazza Al Balushi CDN audit · EXTERNAL_TRACKER manualWird UI · FREE_EXPLORER create-plan CTA · Gamified tests · Full event sync · Architecture A→Z.*
