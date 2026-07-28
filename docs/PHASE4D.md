# Phase 4D — Production Foundation

## Goals

- Real user accounts (signup / login / logout / session)
- PostgreSQL via Prisma (Supabase-compatible)
- Cloud sync of local progress + learning brain snapshot
- **Local-first preserved** when env is missing

## Architecture

```
Browser localStorage (always)
        ↕  collect / apply snapshot
POST/GET /api/v1/sync  (+ session cookie when logged in)
        ↕
Prisma → PostgreSQL (Supabase recommended)
```

Auth:

```
signup/login server actions
  → bcrypt password hash on User.passwordHash
  → JWT session cookie (jose) hafiz_session
  → optional guest cookie hafiz_guest

middleware: only enforces when REQUIRE_AUTH=true
```

## Environment

See `.env.example`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (Supabase pooler or direct) |
| `DIRECT_URL` | Migrations (Supabase) |
| `AUTH_SECRET` | JWT signing (≥16 chars) |
| `REQUIRE_AUTH` | Soft-protect app routes (optional) |

## Database models (new / used)

- `User` + `passwordHash` — credentials
- `Profile` — HafizProfile mirror (JSON fields)
- `LearningStateSnapshot` — full application LearningSnapshot JSON
- Existing: mistakes, bookmarks, notes, ayahProgress, journey, SyncCursor, …

## Setup (Supabase)

Full production guide: **[PRODUCTION.md](./PRODUCTION.md)**

1. Create Supabase project  
2. Copy pooler → `DATABASE_URL`, direct → `DIRECT_URL` into `.env.local`  
3. Set strong `AUTH_SECRET` (`openssl rand -base64 32`)  
4. Run:

```bash
npx prisma generate
npx prisma db push
npm run prod:check
npm run dev
```

5. Open `/signup` → create account → Settings → مزامنة الآن  

## Local-only mode

Without `DATABASE_URL`, the app:

- Runs all learning offline
- Sync API returns `mode: "local_only"`
- Signup/login return a clear Arabic error

## Security notes

- Session cookies are httpOnly + SameSite=Lax (+ Secure in production)
- Passwords hashed with bcrypt (10 rounds)
- Never commit real `.env` / `.env.local` (`.env.example` is OK)
- Production rejects insecure AUTH_SECRET defaults
