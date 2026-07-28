# Hafiz Architecture

> **Full A→Z collaborator guide:** see [`FULL_ARCHITECTURE_SUMMARY.md`](./FULL_ARCHITECTURE_SUMMARY.md)  
> (local-first, Madani pages, plan engine, scoped recitation, gamified tests, event sync).

## Vision

Prevent forgetting through SRS, adaptive queues, mutashabihat mastery, analytics, and teacher tooling — calm Islamic UX.

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js 15 App Router, React 19, TypeScript |
| UI | Tailwind v4, custom shadcn-style components, Framer Motion |
| Charts | Recharts |
| Data | Prisma → PostgreSQL (Supabase) |
| Auth | Clerk or NextAuth (UI ready; wire providers) |
| API | Route Handlers `/api/v1/*` + Server Actions `src/lib/actions` |

## Folder structure

```
src/
  app/
    (app)/           # Authenticated shell routes
    api/v1/          # REST handlers
    login|signup|…   # Public auth
  components/
    ui/              # Design system
    layout/          # Shell, sidebar, header
    motion/          # Animation primitives
  lib/
    actions/         # Server Actions (mutations)
    api/routes.ts    # API catalog
    srs.ts           # Spaced repetition engine
    hafiz-score.ts   # 0–1000 score
    mock-data.ts     # Demo dataset
    types.ts
prisma/schema.prisma # Full production models
```

## Domain engines

### SRS (`lib/srs.ts`)

- Classify: MASTERED | GOOD | NEEDS_REVIEW | WEAK | FORGOTTEN | NOT_MEMORIZED
- SM-2 style intervals + mistake/confidence signals
- `prioritizeRevisionQueue` — weak/forgotten/mistakes first
- `predictForgetting` — pages due soon with low confidence

### Hafiz Score (`lib/hafiz-score.ts`)

Weighted 0–1000 from consistency, mistakes, review frequency, quiz accuracy, revision completion, mutashabihat, streak.

### Mutashabihat

Groups with highlight words, context notes, side-by-side compare, tips.

## Data flow (production)

```
UI → Server Action / API → Prisma → Postgres (Supabase)
                ↓
         DailyAnalytics, RevisionQueue, Notifications
```

Demo mode: UI + mock-data + actions return computed results without DB.

## Auth plan

1. Clerk (fastest) or NextAuth + Google + email
2. Middleware protect `/(app)/*`
3. Role: STUDENT | TEACHER | ADMIN

## Performance

- Static pages where possible
- Lazy client charts (`stats`)
- PWA manifest
- Image optimization via next/image when assets added
- RTL + `prefers-reduced-motion`

## Security

- Never expose service keys client-side
- Rate-limit quiz/voice endpoints
- Privacy defaults for social

## Roadmap hooks

- Voice: Web Speech / Whisper → `POST /api/v1/voice/analyze`
- Real Quran corpus seed (Tanzil Uthmani)
- Push notifications for smart reminders
