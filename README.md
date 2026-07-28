# حافظ (Hafiz)

Intelligent Quran memorization platform — spaced repetition, mutashabihat engine, analytics, teacher tools.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + custom UI (shadcn-style)
- **Framer Motion** / **Recharts**
- **Prisma** + PostgreSQL (Supabase-ready)
- Full **Arabic RTL** (Cairo, Tajawal, Amiri Quran)

## Quick start

```bash
cd C:\Users\YAHYA\Projects\hafiz
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo path (no auth/DB required)

1. Landing → **تجربة لوحة التحكم** or go to `/dashboard`
2. Or: `/signup` → `/onboarding` → `/dashboard`
3. Try: Map, Revision, Mutashabihat, Quiz, Stats, Teacher, Admin

## Main routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login`, `/signup` | Auth UI (demo) |
| `/onboarding` | Personalized plan wizard |
| `/dashboard` | Main student dashboard |
| `/map` | 604-page mushaf heatmap |
| `/revision` | SRS revision engine |
| `/mutashabihat` | Similar verses explorer |
| `/quiz` | Multi-type quizzes |
| `/stats` | Analytics charts |
| `/goals` | Goals & achievements |
| `/planner` | Hifz revision planner |
| `/focus` | Distraction-free mode |
| `/teacher` | Teacher dashboard |
| `/admin` | Admin panel |

## Database (optional)

1. Copy `.env.example` → `.env`
2. Set Supabase/PostgreSQL `DATABASE_URL` and `DIRECT_URL`
3. Run:

```bash
npx prisma generate
npx prisma db push
```

UI currently uses **mock data** in `src/lib/mock-data.ts` so you can demo without a DB.

## Project structure

```
src/
  app/                 # Routes (landing, auth, app shell pages)
  components/ui/       # Design system
  components/layout/   # Sidebar, header, shell
  lib/
    types.ts           # Domain types
    srs.ts             # Spaced repetition engine
    hafiz-score.ts     # 0–1000 score
    mock-data.ts       # Demo data
    prisma.ts          # DB client
prisma/schema.prisma   # Full production schema
```

## Scripts

```bash
npm run dev      # Development
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

## Docs

- [Architecture](./docs/ARCHITECTURE.md)
- [API](./docs/API.md)
- Prisma schema: `prisma/schema.prisma`
- API route map: `src/lib/api/routes.ts`

## Notes

- Auth is **UI-only** (demo). Wire NextAuth or Clerk when ready.
- Voice mode: full UI at `/voice` — ASR wiring is the next step.
- Social: `/social` (friends, challenges, leaderboard, privacy).
- Design: calm Islamic aesthetic, light/dark, mobile-first RTL.
- PWA: `public/manifest.json` + `public/sw.js` (registers in production).
