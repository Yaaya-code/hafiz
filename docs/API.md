# Hafiz API Design

See also `src/lib/api/routes.ts` for the full catalog.

## Conventions

- Base path: `/api/v1`
- JSON body, camelCase
- Errors: `{ error: { code, message } }`
- Success: `{ data: ... }`
- Auth: `Authorization: Bearer <token>` (when wired)

## Implemented

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/revision/queue` | SRS queue from cloud `LearningStateSnapshot` (session); else `local_only` |
| GET | `/api/v1/analytics/hafiz-score` | Hafiz score from cloud snapshot + profile; else `local_only` |
| GET/POST | `/api/v1/sync` | Local-first progress push/pull (session + guest; cloud when DB configured) |
| POST | `/api/v1/auth/signup` | Create account (requires DATABASE_URL + AUTH_SECRET) |
| POST | `/api/v1/auth/login` | Login → session cookie |
| POST | `/api/v1/auth/logout` | Clear session |
| GET | `/api/v1/auth/me` | Current session + config flags |
| POST | `/api/v1/ai/chat` | Quran teacher chat via local RAG (+ optional Ollama) |

## Server Actions (implemented)

Learning sessions and mistakes go through the **application layer**
(`completeSession`, `recordMistake` from `@/application`), not server actions.

| Action | File |
|--------|------|
| `saveOnboardingAction` | `lib/actions/onboarding.ts` |
| `syncProgressAction` | `lib/actions/sync-progress.ts` |

## Planned endpoints

Auth, profile, progress, mutashabihat search, quiz lifecycle, teacher assignments, admin content, voice analyze — see `routes.ts`.

## Example

```http
GET /api/v1/revision/queue
```

```json
{
  "data": {
    "queue": [{ "pageNumber": 12, "priority": 1, "reason": "..." }],
    "predictive": [],
    "generatedAt": "2026-07-22T00:00:00.000Z",
    "source": "mock"
  }
}
```
