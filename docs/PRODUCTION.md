# Hafiz — Production Setup & End-to-End Validation

This guide takes Phase 4D/4E code to a **real** PostgreSQL (Supabase) deployment while keeping **local-first** learning intact.

---

## 1. Architecture (do not break)

```
Browser localStorage  ← always works offline
        ↕ collect / apply ProgressSnapshot
POST/GET /api/v1/sync  (+ hafiz_session cookie when logged in)
        ↕
Prisma → PostgreSQL (Supabase)
```

Learning engine (`src/core`, PlanningService) never requires the network.

---

## 2. Supabase PostgreSQL setup

### 2.1 Create project

1. Open [supabase.com](https://supabase.com) → New project.
2. Note region, database password (store securely).

### 2.2 Connection strings

**Project Settings → Database**

| Variable | Which string |
|----------|----------------|
| `DATABASE_URL` | **Transaction** pooler URI (port **6543**, often `?pgbouncer=true`) |
| `DIRECT_URL` | **Session / direct** URI (port **5432**) for migrations |

If you use plain Postgres/Neon without a pooler, set **both** to the same connection string.

### 2.3 Apply schema

```bash
# From repo root — with env loaded
cp .env.example .env.local
# edit .env.local with real values

npx prisma generate
npx prisma db push
```

Expected: tables including `User`, `Profile`, `LearningStateSnapshot`, `SyncCursor`, mistakes, journey, ayah progress, etc.

Optional inspect:

```bash
npx prisma studio
```

### 2.4 Schema compatibility notes

- Provider: **postgresql** only (Supabase-compatible).
- `LearningStateSnapshot.payload` is **Json** — holds full application LearningSnapshot (revision memory, userState, plan cache meta).
- `User.passwordHash` — credentials auth (not Supabase Auth JS).
- `User.guestKey` — anonymous device sync before/alongside login.
- No schema change required for first production deploy unless `prisma db push` reports an error.

---

## 3. Environment variables

See **`.env.example`**.

| Variable | Required for | Notes |
|----------|----------------|-------|
| `DATABASE_URL` | Cloud sync + signup/login | App works without it (local-only) |
| `DIRECT_URL` | Migrations / `db push` on Supabase | Falls back to `DATABASE_URL` in code if missing |
| `AUTH_SECRET` | Session JWT cookies | ≥16 chars; **production rejects** `change-me` defaults |
| `REQUIRE_AUTH` | Optional hard gate | Default open (local-first). Set `true` to require login or guest cookie |
| `AUTH_SESSION_DAYS` | Optional | Default 30 |
| `AUTH_DEBUG` | Optional | Surface warnings on `/api/v1/auth/me` in production |

Generate secret:

```bash
openssl rand -base64 32
```

---

## 4. Auth cookies & security

| Cookie | Purpose | Flags |
|--------|---------|--------|
| `hafiz_session` | JWT session | httpOnly, SameSite=Lax, Secure in production, path=/ |
| `hafiz_guest` | Explicit guest mode | httpOnly, SameSite=Lax, Secure in production |

- Passwords: **bcrypt** (10 rounds), never stored plain.
- JWT: **HS256** via `jose`, subject = userId.
- Production without strong `AUTH_SECRET`: auth disabled (no insecure fallback).
- Middleware soft-protect only when `REQUIRE_AUTH=true`.

API notes:

- `/api/v1/sync` prefers session userId; falls back to guestKey.
- `/api/v1/revision/queue` & `/hafiz-score` return `local_only` without session/DB (no mock data).
- Do not log passwords or full session tokens.

---

## 5. End-to-end validation checklist

### A. Local-only (no database) — must pass

- [ ] `npm run dev` without `DATABASE_URL`
- [ ] Onboarding → plan reveal → dashboard works
- [ ] Complete a journey step / session
- [ ] Settings → sync shows **محلي فقط** / local_only message
- [ ] Signup returns clear Arabic error about missing DB (not crash)
- [ ] Guest “متابعة محلياً” reaches dashboard

### B. Auth E2E (with DATABASE_URL + AUTH_SECRET)

- [ ] `npx prisma db push` succeeds
- [ ] `/signup` creates user; Profile row exists in Prisma Studio
- [ ] Browser has `hafiz_session` cookie (httpOnly)
- [ ] `GET /api/v1/auth/me` returns `{ user: { userId, email, ... } }`
- [ ] Logout clears session; `/api/v1/auth/me` has `user: null`
- [ ] Login with wrong password fails safely (no stack trace to client)
- [ ] Guest mode still available from login page

### C. Cloud sync E2E — Device A → Device B

**Device A (browser profile 1)**

1. Signup new account (or login).
2. Complete onboarding if needed.
3. Do learning activity: revision session, log a mistake, complete journey step, add note/bookmark if possible.
4. Settings → **مزامنة الآن** (force apply).
5. Confirm badge **مزامَن** / status ok.
6. In Prisma Studio: `LearningStateSnapshot`, `Mistake`, `JourneyProgress`, `Profile` rows for that user.

**Device B (incognito / second browser)**

1. Login same email/password.
2. Settings → **سحب من السحابة**.
3. Verify locally restored:
   - [ ] Profile name / pagesPerDay / memorization selection
   - [ ] LearningSnapshot (dashboard plan / score reacts)
   - [ ] Revision memory (queue / forget-risk not empty if A had memory)
   - [ ] Mistakes list
   - [ ] Journey progress for today if same calendar day
   - [ ] Ayah progress / notes / bookmarks if created on A

### D. Conflict behavior (documented)

| Scenario | Behavior |
|----------|----------|
| LearningSnapshot | **Last-write-wins** by client `updatedAt` (`clientUpdatedAt` on server); client apply also LWW by `updatedAt` |
| Mistakes / notes / bookmarks | Server upsert by `userId + clientId`; client **merge by id** on pull (offline rows kept) |
| Ayah progress | Client merges by key (higher activity / newer timestamp) |
| Profile fields | Latest push overwrites scalars on server; client merges local+cloud on apply |
| Guest → signup | Same `guestKey`/deviceId **upgrades** guest user row (progress preserved) |
| Unauthenticated `userId` in body | **Ignored** — only session or guestKey identity |
| Simultaneous offline edits on two devices | Last successful push wins for learning snapshot; collections merge on pull |
| No network | Local continues; banner offline; sync when online |

### E. Reliability

| Failure | Expected |
|---------|----------|
| DB down / wrong URL | local_only or error message; app UI still works from localStorage |
| Sync timeout / fetch fail | Arabic error; local data intact |
| Empty new account | Empty queues/scores; onboarding flow |
| Auth secret missing in production | Signup/login fail clearly; local guest works |

---

## 6. Commands

```bash
# Install
npm install

# Code quality
npm test
npm run typecheck
npm run lint
npm run build

# Schema
npx prisma generate
npx prisma db push
npx prisma studio

# Production readiness audit (no DB required)
npm run prod:check

# Live Auth + Sync against Supabase (.env.local required)
npm run prod:validate-auth-sync
```

---

## 7. Deploy notes (Vercel / Node host)

1. Set env vars on the host: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`.
2. Build: `npm run build` → `npm start` (or platform Next adapter).
3. Run `prisma db push` or migrate from CI against DIRECT_URL once.
4. Smoke-test: `/signup` → activity → Settings sync → second session pull.
5. Optional: `REQUIRE_AUTH=true` after guest UX is confirmed.

---

## 8. Production readiness status (code)

| Area | Status |
|------|--------|
| Prisma PostgreSQL schema | Ready |
| LearningStateSnapshot + sync models | Ready |
| Auth signup/login/logout/me | Ready |
| Guest + local-only without DB | Ready |
| Sync credentials + offline UX | Ready |
| Real revision queue / hafiz-score APIs | Ready (cloud when logged in) |
| Live Supabase E2E in this workspace | **Pending** — no `DATABASE_URL` configured here |
| OAuth / rate limits / payments | Not in scope |

---

## 9. Remaining blockers before first real users

1. **Operator must** provision Supabase (or Postgres) and set env vars.
2. **Operator must** run `prisma db push` and complete checklist §5 B–C once.
3. Strong unique `AUTH_SECRET` in production.
4. Optional: enable `REQUIRE_AUTH` only after product decision.
5. No automated multi-device CI yet — use manual checklist.
6. Teacher/admin/social remain stubs (intentional).
