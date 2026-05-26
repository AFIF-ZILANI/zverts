# BACKEND.md — ZverTs

> Implementation-ready backend engineering specification for ZverTs, derived from `PRODUCT.md` and the production schema currently running on Postgres (Supabase).
> Target stack: **Go 1.22 · PostgreSQL 15 · Redis 7 · REST (HTTP/1.1 + HTTP/2) · JWT (RS256) · `chi` router · `pgx/v5` · `sqlc` · `golang-migrate` · `riverqueue` · OpenTelemetry**.

---

## 1. Backend Architecture Overview

### 1.1 Service boundaries
A single deployable **modular monolith** in Go, organized internally as bounded modules. This matches the product's scale today (one DB, single tenant) and leaves a clear seam for future extraction. Two long-running processes share one binary:

- **`zverts-api`** — public HTTP server (chi).
- **`zverts-worker`** — background workers + cron (riverqueue + robfig/cron).

Both processes share `internal/*` packages but expose different `cmd/` entry points. They scale independently behind the same image.

A third lightweight process exists:
- **`zverts-migrate`** — one-shot job to run `golang-migrate` on deploy.

### 1.2 Modules (bounded contexts)
Each module owns its tables, queries, services, and HTTP/job handlers. Cross-module calls go through the owning module's **service interface** — never raw SQL.

| Module | Owns tables | Responsibility |
|---|---|---|
| `auth` | `user_roles` (read), JWT verification | Session, JWT, role checks. |
| `users` | `profiles` | Profile CRUD, settings, account deletion orchestration. |
| `courses` | `courses`, `modules` | Course + module CRUD, publish, ownership. |
| `import` | — (writes `courses`, `modules`) | YouTube playlist preview + import. |
| `learn` | `module_progress`, `notes` | Watch progress, completion, notes. |
| `quiz` | `mcq_questions`, `mcq_attempts`, `daily_challenges` | MCQ delivery + grading + daily challenge. |
| `gamification` | `attendance`, `achievements` (writes XP/gems/streak on `profiles`) | XP/gems/streak/badges/leaderboard. |
| `certificates` | `certificates` | Issue + verify + PDF generation. |
| `tutor` | — (stateless) | Streaming AI chat proxy. |
| `notifications` | `email_logs` | Transactional + lifecycle email. |
| `admin` | cross-cutting reads | Curation, role mgmt, ops dashboards. |
| `storage` | object storage buckets (`avatars`) | Signed upload URLs, avatar moderation. |
| `platform` | — | Cross-cutting: config, logging, telemetry, ratelimit, db pool, redis client, queue. |

### 1.3 Internal communication
- **In-process:** modules expose Go interfaces from `internal/<module>/service`. Wiring done in `cmd/api/main.go` via constructor injection.
- **Across processes:** `api` → `worker` strictly via the **queue** (River, Postgres-backed). No worker-only HTTP endpoints.
- **DB transactions:** owned by the originating module; cross-module writes use the **Outbox pattern** (write own tables + outbox row in same tx; worker fans out).
- **Realtime fan-out:** Postgres `LISTEN/NOTIFY` channel `zverts_events` published to from `award_progress`/`update_module_progress`; an SSE hub in `api` forwards filtered events to clients (for live XP toasts, leaderboard updates).
- **External calls** (YouTube Data API, Lovable AI Gateway, SMTP/Resend): wrapped behind interface adapters under `internal/platform/clients`, guarded by per-host circuit breakers (sony/gobreaker) and bounded HTTP clients (`net/http` with `Transport.MaxIdleConnsPerHost`, timeouts).

```
                    +----------------------+
   Browser  --->    |  zverts-api (chi)     |  ---> Postgres (pgx pool, primary + read-replica)
                    |  - REST + SSE        |  ---> Redis (cache, ratelimit, locks)
                    |  - JWT verify        |  ---> Queue.Enqueue (River → Postgres)
                    +----------+-----------+
                               |
                               | enqueues jobs / outbox dispatch
                               v
                    +----------------------+
                    |  zverts-worker        |  ---> YouTube API
                    |  - River workers     |  ---> Lovable AI Gateway
                    |  - Cron              |  ---> Email provider
                    +----------------------+
```

---

## 2. Database Design

> All identifiers are `uuid` with `gen_random_uuid()` defaults unless noted. All tables include `created_at timestamptz NOT NULL DEFAULT now()` and (where mutable) `updated_at timestamptz NOT NULL DEFAULT now()` maintained by an `update_updated_at` trigger. Schema is `public`. Money/time integer columns use UTC seconds. Enums declared once:
> `CREATE TYPE app_role AS ENUM ('student','instructor','admin');`

### 2.1 `profiles`
**Reason:** Mirror of `auth.users` enriched with product fields. One row per user, created on signup via `handle_new_user()` trigger.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | — | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | text | yes | — | length 1..80 |
| `email` | text | yes | — | citext-compatible, length ≤ 255 |
| `avatar_url` | text | yes | — | https URL ≤ 2048 |
| `certificate_name` | text | yes | — | length 1..80 |
| `preferred_language` | text | no | `'en'` | enum-checked at app layer: `en`,`bn` |
| `daily_goal_minutes` | int | no | `30` | CHECK 5..240 |
| `study_reminders_enabled` | bool | no | `true` | |
| `profile_public` | bool | no | `true` | |
| `notify_email` | bool | no | `true` | |
| `notify_completion` | bool | no | `true` | |
| `notify_inactivity` | bool | no | `true` | |
| `total_xp` | int | no | `0` | CHECK ≥ 0 |
| `total_gems` | int | no | `0` | CHECK ≥ 0 |
| `current_streak` | int | no | `0` | CHECK ≥ 0 |
| `longest_streak` | int | no | `0` | CHECK ≥ 0 |
| `last_attendance_date` | date | yes | — | |
| `last_active` | timestamptz | no | `now()` | |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** PK on `id`. `CREATE INDEX profiles_total_xp_idx ON profiles (total_xp DESC) WHERE profile_public;` (leaderboard). `CREATE INDEX profiles_last_active_idx ON profiles (last_active DESC);` (admin).
**Query patterns:** by `id` (point), top-N by `total_xp`, scan inactive users.

### 2.2 `user_roles`
**Reason:** Roles MUST live in a separate table for security (prevents privilege escalation via profile updates).

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | app_role | no | — | |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (user_id, role)`; `CREATE INDEX user_roles_role_idx ON user_roles(role);`
**Query patterns:** `has_role(uid, role)` (called per request).

### 2.3 `courses`
**Reason:** Top-level container for a learning unit; owned by a user, may be system-curated, may be public.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | yes | — | FK → `auth.users(id)` ON DELETE SET NULL |
| `title` | text | no | — | length 1..200 |
| `description` | text | yes | — | length ≤ 4000 |
| `thumbnail_url` | text | yes | — | URL ≤ 2048 |
| `source_playlist_id` | text | yes | — | length ≤ 64 |
| `source_playlist_url` | text | yes | — | URL ≤ 2048 |
| `author_name` | text | yes | — | length ≤ 200 |
| `author_channel_id` | text | yes | — | length ≤ 64 |
| `author_channel_url` | text | yes | — | URL ≤ 2048 |
| `is_public` | bool | no | `false` | |
| `is_system` | bool | no | `false` | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Constraints:** `UNIQUE (user_id, source_playlist_id)` to make re-imports idempotent (NULLs allowed for non-YouTube origins).
**Indexes:** `(user_id)`, `(is_public) WHERE is_public`, `(is_system) WHERE is_system`, GIN on `to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))` for explore search.

### 2.4 `modules`
**Reason:** Ordered video lessons inside a course.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `course_id` | uuid | no | — | FK → `courses(id)` ON DELETE CASCADE |
| `position` | int | no | — | CHECK ≥ 1 |
| `title` | text | no | — | length 1..300 |
| `youtube_video_id` | text | no | — | length 5..32 |
| `duration_seconds` | int | no | `0` | CHECK ≥ 0 |
| `thumbnail_url` | text | yes | — | URL ≤ 2048 |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (course_id, position)`, `(course_id)`, `(youtube_video_id)`.

### 2.5 `module_progress`
**Reason:** Per-user per-module watch state. Single source of truth for unlocking and completion.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `module_id` | uuid | no | — | FK → `modules(id)` ON DELETE CASCADE |
| `watch_time_seconds` | int | no | `0` | CHECK ≥ 0 |
| `percent_watched` | numeric(5,2) | no | `0` | CHECK 0..100 |
| `completed` | bool | no | `false` | |
| `completed_at` | timestamptz | yes | — | |
| `mcq_passed` | bool | no | `false` | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (user_id, module_id)`, `(user_id, completed)`, `(user_id, updated_at DESC)` (resume list).
**Writes go only through `update_module_progress()` RPC.**

### 2.6 `notes`
**Reason:** Personal notes against a module, optionally pinned to a timestamp.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `module_id` | uuid | no | — | FK → `modules(id)` ON DELETE CASCADE |
| `content` | text | no | — | length 1..5000 |
| `timestamp_seconds` | int | yes | — | CHECK ≥ 0 |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes:** `(user_id, module_id, created_at DESC)`.

### 2.7 `mcq_questions`
**Reason:** Question bank per module.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `module_id` | uuid | no | — | FK → `modules(id)` ON DELETE CASCADE |
| `position` | int | no | — | CHECK ≥ 1 |
| `question` | text | no | — | length 1..2000 |
| `options` | jsonb | no | — | array of 2..6 strings |
| `correct_index` | int | no | — | CHECK ≥ 0 AND < jsonb_array_length(options) |
| `explanation` | text | yes | — | length ≤ 2000 |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (module_id, position)`, `(module_id)`.

### 2.8 `mcq_attempts`
**Reason:** Audit log of MCQ submissions; used by analytics + retry rules.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `module_id` | uuid | no | — | FK → `modules(id)` ON DELETE CASCADE |
| `score` | int | no | — | CHECK ≥ 0 |
| `total` | int | no | — | CHECK ≥ 1 |
| `passed` | bool | no | — | |
| `answers` | jsonb | no | — | object: `{ "<question_id>": <option_index> }` |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** `(user_id, module_id, created_at DESC)`.

### 2.9 `daily_challenges`
**Reason:** One MCQ challenge per user per UTC date.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `module_id` | uuid | yes | — | FK → `modules(id)` ON DELETE SET NULL |
| `date` | date | no | `(now() AT TIME ZONE 'UTC')::date` | |
| `score` | int | no | `0` | |
| `total` | int | no | `0` | |
| `passed` | bool | no | `false` | |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (user_id, date)`, `(date DESC)`.

### 2.10 `attendance`
**Reason:** Streak ledger; one row per (user, UTC date) on any qualifying activity.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `date` | date | no | — | |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (user_id, date)`, `(user_id, date DESC)`.

### 2.11 `achievements`
**Reason:** Earned badges; idempotent grants keyed by `code`.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `code` | text | no | — | length 1..64 |
| `metadata` | jsonb | yes | — | |
| `unlocked_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (user_id, code)`, `(user_id, unlocked_at DESC)`.

### 2.12 `certificates`
**Reason:** Verifiable proof of course completion.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `course_id` | uuid | no | — | FK → `courses(id)` ON DELETE CASCADE |
| `certificate_code` | text | no | — | format `ZD-XXXXXXXXXX` |
| `issued_to_name` | text | no | — | length 1..80 |
| `course_title` | text | no | — | length 1..200 |
| `issued_at` | timestamptz | no | `now()` | |

**Indexes:** `UNIQUE (user_id, course_id)`, `UNIQUE (certificate_code)`.

### 2.13 `email_logs`
**Reason:** Delivery audit + retry visibility.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `recipient_email` | text | no | — | |
| `email_type` | text | no | — | length 1..64 |
| `status` | text | no | — | enum-checked at app: `queued`,`sent`,`failed`,`bounced` |
| `error` | text | yes | — | |
| `metadata` | jsonb | yes | — | |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:** `(created_at DESC)`, `(status, created_at DESC)`, `(recipient_email)`.

### 2.14 `outbox_events` *(new)*
**Reason:** Reliable cross-module event delivery (XP awarded, course published, certificate issued).

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | bigserial | no | — | PK |
| `aggregate` | text | no | — | e.g. `course`, `module_progress` |
| `aggregate_id` | uuid | no | — | |
| `type` | text | no | — | e.g. `course.published` |
| `payload` | jsonb | no | — | |
| `created_at` | timestamptz | no | `now()` | |
| `published_at` | timestamptz | yes | — | |

**Indexes:** `(published_at NULLS FIRST, id)` partial `WHERE published_at IS NULL`.

### 2.15 `idempotency_keys` *(new)*
**Reason:** Safe retries for mutating endpoints.

| Field | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `key` | text | no | — | PK; format `<uid>:<route>:<client-key>` |
| `request_hash` | bytea | no | — | sha256 of body |
| `response_status` | int | no | — | |
| `response_body` | jsonb | no | — | |
| `created_at` | timestamptz | no | `now()` | |

**Retention:** rows older than 24 h purged nightly.

### 2.16 `rate_limit_buckets` *(Redis-only, listed for completeness)*
Token-bucket state lives in Redis (`rl:<scope>:<id>`). Not a SQL table.

---

## 3. Database Relationships

### One-to-one
- `auth.users` 1—1 `profiles` (`profiles.id = auth.users.id`).
- `(user_id, course_id)` 1—1 `certificates`.

### One-to-many
- `auth.users` 1—∞ `courses` (`courses.user_id`).
- `courses` 1—∞ `modules` (`modules.course_id`).
- `modules` 1—∞ `mcq_questions`, `notes`, `module_progress`, `mcq_attempts`.
- `auth.users` 1—∞ `module_progress`, `notes`, `mcq_attempts`, `attendance`, `daily_challenges`, `achievements`, `certificates`, `user_roles`.

### Many-to-many
- Users ↔ Modules — via `module_progress`. Composite `UNIQUE(user_id, module_id)` makes it a strict m:n with attributes.
- Users ↔ Courses (enrollment) — implicit: a user is "enrolled" in a course iff they own ≥1 `module_progress` for any of its modules.

### Foreign key strategy
- All user-scoped tables `ON DELETE CASCADE` on `user_id` so `delete-account` cascades cleanly.
- `courses.user_id ON DELETE SET NULL` so system courses survive original author deletion (mark `is_system=true` and null the owner).
- `modules.course_id ON DELETE CASCADE` so module rows die with the course.

---

## 4. API Routes

> Base URL: `https://api.zverts.app/v1`. Content type: `application/json; charset=utf-8` unless noted (SSE: `text/event-stream`). Errors follow §9.2. Pagination is cursor-based: `?cursor=<opaque>&limit=<1..100>` returning `{ items, next_cursor }`. Mutating endpoints accept optional `Idempotency-Key` header (UUID).

### 4.1 Public
| Method | Route | Purpose | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/health` | Liveness | no | 60/m per IP |
| GET | `/ready` | Readiness (DB + Redis ping) | no | 60/m per IP |
| GET | `/version` | Build info | no | 60/m per IP |
| GET | `/explore/courses` | Public + system catalog | no | 120/m per IP |
| GET | `/explore/courses/{id}` | Public course detail | no | 120/m per IP |
| GET | `/explore/courses/{id}/modules` | Public module list (titles, durations only) | no | 120/m per IP |
| GET | `/certificates/verify/{code}` | Verify by code | no | 60/m per IP |

**`GET /explore/courses`** request: `?q=&lang=&min_minutes=&max_minutes=&sort=popular|new|short&cursor=&limit=24`.
Validation: `q` ≤ 80 chars, `limit` 1..50. Response: `{ items: PublicCourse[], next_cursor }`.

### 4.2 Auth
| Method | Route | Purpose | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/auth/magic-link` | Send OTP email | no | 5/m per email, 30/h per IP |
| POST | `/auth/oauth/google/start` | Begin OAuth, returns redirect URL | no | 30/m per IP |
| GET  | `/auth/oauth/google/callback` | Exchange code, set session cookie | no | 30/m per IP |
| POST | `/auth/refresh` | Rotate access + refresh token | refresh | 30/m per user |
| POST | `/auth/logout` | Revoke refresh token | access | 30/m per user |
| POST | `/auth/password/reset/request` | Email recovery link | no | 3/m per email |
| POST | `/auth/password/reset/complete` | Set new password from recovery token | recovery JWT | 5/m per IP |

Request schemas (Zod-equivalent Go validators, JSON):
- `POST /auth/magic-link` → `{ email: string<email,255> }`. 202 Accepted.
- `POST /auth/password/reset/complete` → `{ token: string, password: string<8,72> }`. HIBP-checked.

Errors: `400 invalid_request`, `401 invalid_token`, `429 rate_limited`.

### 4.3 User (auth required, scoped to `auth.uid()`)
**Profile & settings**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/me` | Current user + profile + roles | 120/m |
| PATCH | `/me/profile` | Update profile fields | 30/m |
| PATCH | `/me/settings` | Update settings/notifications/language | 30/m |
| POST | `/me/avatar` | Get signed upload URL | 10/m |
| DELETE | `/me` | Delete account (async) | 1/h |

`PATCH /me/profile` body: `{ name?, certificate_name?, avatar_url? }`. `PATCH /me/settings` body: `{ preferred_language?, daily_goal_minutes?, study_reminders_enabled?, notify_email?, notify_completion?, notify_inactivity?, profile_public? }`. Protected fields (`total_xp`, `total_gems`, streaks) rejected with 400 if present.

**Courses (owner)**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/courses` | My courses | 120/m |
| GET | `/courses/{id}` | Course detail (any visible) | 240/m |
| PATCH | `/courses/{id}` | Title/description/thumbnail | 30/m |
| PATCH | `/courses/{id}/visibility` | `{ is_public: bool }` | 10/m |
| DELETE | `/courses/{id}` | Delete (owner, non-system) | 10/m |
| GET | `/courses/{id}/modules` | Modules + my progress | 240/m |

**Import**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| POST | `/import/youtube/preview` | Preview a playlist URL | 20/m per user, 200/h per IP |
| POST | `/import/youtube` | Create course from playlist | 10/h per user |

`POST /import/youtube/preview` body: `{ url: string }`. Validation: must match YouTube playlist regex; resolves playlist ID; calls YouTube API; returns `{ playlist_id, title, channel_title, video_count, sample_videos[8], thumbnail_url }`. Caches result 15 min in Redis.
`POST /import/youtube` body: `{ url: string, title_override?: string }`. Returns `202 { job_id }`; worker creates course. Status via `GET /jobs/{id}` (auth, owner only).

**Learn / progress / notes**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/learn/resume` | Last 10 in-progress modules | 60/m |
| GET | `/modules/{id}` | Module + my progress (RLS-equivalent) | 240/m |
| POST | `/modules/{id}/progress` | Sync watch progress | 60/m per user (burst 120) |
| POST | `/modules/{id}/complete` | Force complete (admin/owner debug; normally derived) | 10/m |
| GET | `/modules/{id}/notes` | My notes | 120/m |
| POST | `/modules/{id}/notes` | Create note | 60/m |
| PATCH | `/notes/{id}` | Update note | 60/m |
| DELETE | `/notes/{id}` | Delete note | 60/m |

`POST /modules/{id}/progress` body: `{ watch_time_seconds: int }`. Implements `update_module_progress()`.
Headers: `Idempotency-Key` honored.

**Quiz / daily challenge**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/modules/{id}/quiz` | Questions (no `correct_index`) | 120/m |
| POST | `/modules/{id}/quiz` | Submit answers, grade, unlock | 30/m |
| GET | `/me/daily-challenge` | Today's challenge (cached) | 60/m |
| POST | `/me/daily-challenge` | Submit | 30/m |

`POST /modules/{id}/quiz` body: `{ answers: { [questionId]: optionIndex } }`. Server-side grading (`submit_mcq`); response `{ score, total, passed, mcq_passed_now }`.

**Gamification**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/me/stats` | XP, gems, streak, badges | 120/m |
| GET | `/me/activity?days=14` | Weekly heatmap | 30/m |
| GET | `/me/achievements` | My badges | 60/m |
| GET | `/leaderboard?range=7d\|30d\|all&limit=100` | Public top-N | 60/m |
| POST | `/me/check-achievements` | Fire achievement evaluation | 10/m |

**Certificates**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/me/certificates` | My certs | 60/m |
| POST | `/courses/{id}/certificate` | Issue (idempotent) | 5/m |
| GET | `/certificates/{id}.pdf` | Download PDF | 10/m |

**Tutor**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| POST | `/tutor/chat` | Streaming chat (SSE) | 30/m per user, 2 concurrent |

`POST /tutor/chat` body: `{ module_id: uuid, model: string, messages: { role, content }[] }`. Validates module access, enforces model allowlist, proxies to Lovable AI Gateway with SSE; cancels on client disconnect.

**Jobs**
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/jobs/{id}` | Job status | 120/m |

### 4.4 Admin (`role admin`)
| Method | Route | Purpose | Rate |
|---|---|---|---|
| GET | `/admin/courses` | Paginated all courses + filters | 120/m |
| PATCH | `/admin/courses/{id}` | Force-edit (is_system, is_public, hide) | 30/m |
| DELETE | `/admin/courses/{id}` | Hard delete | 10/m |
| GET | `/admin/users` | Paginated users + filters | 120/m |
| POST | `/admin/users/{id}/roles` | Grant role | 30/m |
| DELETE | `/admin/users/{id}/roles/{role}` | Revoke role | 30/m |
| GET | `/admin/email-logs` | Email delivery audit | 60/m |
| POST | `/admin/email-logs/{id}/retry` | Re-enqueue failed email | 10/m |
| GET | `/admin/metrics` | KPI dashboards (cached) | 60/m |

### 4.5 Internal (worker → api, or cron → api, mTLS only)
| Method | Route | Purpose |
|---|---|---|
| POST | `/internal/outbox/dispatch` | Manual outbox kick |
| POST | `/internal/streaks/recompute` | Nightly streak job hook |
| POST | `/internal/inactivity/notify` | Lifecycle email batch |
| POST | `/internal/cache/invalidate` | Targeted cache bust |

All `/internal/*` require client certificate AND a per-call HMAC signature header (`X-ZverTs-Signature`).

### 4.6 Cross-cutting response shape
Success: `{ "data": ..., "meta": { "request_id": "..." } }`.
Error: see §9.2.

---

## 5. Authentication System

### 5.1 Session model
- **Stateless access JWT** (RS256, 15 min TTL) signed by an internal KMS-backed key; `kid` rotated quarterly. Verified via JWKS endpoint, cached in Redis 10 min.
- **Opaque refresh token** (256-bit) stored as **hash** (SHA-256) in Redis: `sess:rt:<hash>` → `{ user_id, jti, family, created_at, ua, ip }`, TTL 30 days. Refresh rotation with reuse detection: any reuse of a rotated token invalidates the entire family.
- Cookies on web (HTTPS, `__Host-zverts_at` access, `__Host-zverts_rt` refresh; `Secure; HttpOnly; SameSite=Lax`). Mobile uses `Authorization: Bearer`.
- `at` claims: `sub`, `email`, `role` (highest), `roles` (all), `iat`, `exp`, `jti`, `aud`, `iss`.
- Logout: delete `sess:rt:<hash>` and append `jti` to `sess:revoked:<jti>` (TTL = access remaining).

### 5.2 Token lifecycle
```
sign-in → issue at+rt → 15min later → /auth/refresh (rt) → new at+rt (rotate)
                                       │
                                       └─ reuse of old rt → revoke entire family + force re-login
logout → delete rt + denylist current at jti
```
Recovery JWTs (password reset) are single-use, 30 min, `aud=password-reset`, consumed by `password/reset/complete`.

### 5.3 Role permissions
Roles: `student` (default), `instructor`, `admin`. Stored in `user_roles`; users may have multiple. Authorization is **capability-based** at the service layer:

| Capability | student | instructor | admin |
|---|---|---|---|
| Read own data | ✅ | ✅ | ✅ |
| Import playlist | ✅ | ✅ | ✅ |
| Publish own course | ✅ | ✅ | ✅ |
| Edit any course | — | — | ✅ |
| Promote course to system | — | — | ✅ |
| Grant/revoke roles | — | — | ✅ |
| Read other users' progress | — | own students only (future cohorts) | ✅ |
| Read email logs | — | — | ✅ |

### 5.4 Access rules (request path)
1. **Edge middleware** verifies cookie/bearer → parses claims → loads `auth_context` (user_id, roles).
2. **AuthZ middleware** maps route → required capability; rejects with 403.
3. **Ownership check** done in service layer for `/courses/{id}`, `/notes/{id}`, etc., via a single `assertCanAccess(ctx, resource)` helper. Postgres queries also filter by `user_id` so a code bug can't leak rows.
4. **CSRF**: double-submit cookie on cookie-auth state-changing requests; bearer-only API exempt.

---

## 6. Service Layer

> Each service is a Go interface implemented by a struct with `(db *pgxpool.Pool, rdb *redis.Client, q queue.Enqueuer, log *slog.Logger)`. Handlers are thin: parse → validate → call service → render.

| Service | Responsibilities |
|---|---|
| **AuthService** | Magic-link issue, OAuth exchange, refresh rotation, password reset, JWT signing/verifying. |
| **UserService** | Profile read/update, settings, avatar URL signing, account deletion orchestration (enqueues `account.delete`). |
| **CourseService** | CRUD, visibility toggle, ownership/admin checks, `Explore` queries (delegated to `ExploreReadModel`). |
| **ImportService** | YouTube URL parse → Preview (cached) → Enqueue `playlist.import`; deduplicate by `(user_id, source_playlist_id)`. |
| **ModuleService** | Read module with access check, list modules with progress join. |
| **ProgressService** | Wraps `update_module_progress` RPC, emits `module.completed` outbox event, updates streak via `mark_attendance`. |
| **NotesService** | CRUD notes, validates ownership. |
| **QuizService** | Reads questions (strips `correct_index`), submits via `submit_mcq`, throttles per (user, module). |
| **DailyChallengeService** | Picks today's set of MCQs (5 random from user's in-progress modules), submits via `grade_and_submit_daily_challenge`. |
| **GamificationService** | XP/gems/streak reads, achievement evaluation (`check_achievements`), leaderboard from `list_public_profiles`. |
| **CertificateService** | Issues via `issue_certificate`, renders PDF (worker), verify endpoint via `verify_certificate`. |
| **TutorService** | Validates module access, model allowlist, opens SSE to AI gateway, mirrors stream to client, enforces concurrency limit (Redis semaphore). |
| **NotificationService** | Enqueues emails (`email.send`), wraps provider client, writes `email_logs`. |
| **AdminService** | Cross-cutting reads, role management, course curation, metrics aggregation. |
| **StorageService** | Signed upload URLs for `avatars` bucket; content-type + size constraints. |
| **OutboxDispatcher** | Polls `outbox_events WHERE published_at IS NULL`, enqueues handlers, marks published. |
| **IdempotencyService** | Lookup/insert for `idempotency_keys`. |
| **RateLimitService** | Redis token-bucket; exposes `Allow(scope, id, cost, rate, burst)`. |

---

## 7. Background Jobs

### 7.1 Queue
- **River (`riverqueue/river`)** on top of Postgres — no extra infra, transactional enqueue, exactly-once with `unique_args`. Separate `priority` lanes: `realtime`, `default`, `bulk`.

### 7.2 Workers (idempotent, with backoff `1s, 5s, 30s, 5m, 1h`, max 10 retries unless noted)
| Job | Trigger | Lane | Purpose |
|---|---|---|---|
| `playlist.preview` | POST `/import/youtube/preview` (sync fallback when cache miss) | realtime | Call YouTube API, cache result. |
| `playlist.import` | POST `/import/youtube` | default | Create course + modules transactionally; resolve author. |
| `playlist.author_resolve` | After `playlist.import` | bulk | Fill `author_name`/`author_channel_*` best-effort (max retries 3). |
| `module.completed` | Outbox `module.completed` | default | Achievement check, lifecycle email if course completed. |
| `certificate.issue` | POST `/courses/{id}/certificate` | default | Render PDF, store in `certificates-pdf` bucket. |
| `email.send` | NotificationService | default | Send via Resend/SES; write `email_logs`; on failure flag bounce. |
| `account.delete` | DELETE `/me` | default | Cascade purge (already FK-cascaded), revoke sessions, anonymize email_logs, sign user out everywhere. |
| `analytics.kpi_snapshot` | Cron 03:10 UTC | bulk | Materialize daily KPI rows for admin. |
| `streak.repair` | Cron 00:05 UTC | bulk | Decay `current_streak` to 0 for users with no attendance yesterday. |
| `inactivity.nudge` | Cron 16:00 UTC | bulk | Email opted-in users inactive ≥3 days. |
| `cache.invalidate` | Outbox | realtime | Bust Redis keys post-mutation. |
| `idempotency.gc` | Cron 02:00 UTC | bulk | Delete `idempotency_keys` older than 24h. |
| `outbox.gc` | Cron 02:15 UTC | bulk | Delete `outbox_events` with `published_at < now()-7d`. |

### 7.3 Scheduled jobs (cron)
Run on `zverts-worker` via `robfig/cron/v3`:
- `*/1 * * * *` — outbox dispatcher tick (in addition to LISTEN/NOTIFY).
- `0 0 * * *` — streak.repair, daily_challenge.preassign (precompute today's challenge set per active user).
- `10 3 * * *` — analytics.kpi_snapshot.
- `0 16 * * *` — inactivity.nudge.
- `0 4 * * 0` — leaderboard materialized view refresh.

### 7.4 Job observability
Every job emits OTel spans (`job.<name>`), structured logs, and Prometheus `job_runs_total{name,status}`, `job_duration_seconds{name}` histograms.

---

## 8. Redis Strategy

### 8.1 Topology
Single Redis cluster (6 shards, 2 replicas) for cache + ratelimit + sessions + pub/sub. Separate logical DBs **disallowed** (Cluster), instead use **key prefixes**:
- `cache:*` — read-through caches.
- `sess:*` — sessions/JWKS.
- `rl:*` — rate limit buckets.
- `lock:*` — distributed locks (`SET NX PX`).
- `sem:*` — semaphores (tutor concurrency).
- `ch:*` — pub/sub channels.
- `idem:*` — short-window idempotency replies (hot cache before DB).

### 8.2 Cache keys & TTL
| Key | Value | TTL | Reason |
|---|---|---|---|
| `cache:explore:list:v1:{hash(filters)}` | JSON page | 60s | High-volume public list. |
| `cache:course:public:{id}` | Course DTO | 300s | Public course detail. |
| `cache:course:modules:{id}` | Module list | 300s | Same. |
| `cache:leaderboard:{range}` | top-100 | 60s (7d), 300s (30d), 900s (all) | Hot path. |
| `cache:profile:public:{id}` | Public profile | 120s | Profile page. |
| `cache:youtube:playlist:{playlistId}` | YouTube API response | 900s | Cut quota. |
| `cache:youtube:channel:{channelId}` | Channel meta | 86400s | Author attribution. |
| `cache:jwks` | JWK set | 600s | Token verify. |
| `cache:user_stats:{uid}` | Stats DTO | 30s | Frequent dashboard. |
| `cache:daily_challenge:{uid}:{date}` | Today's set | until next UTC midnight | Stable per day. |
| `cache:i18n:{lang}:{ver}` | Translations bundle | until next deploy | Edge cache. |

### 8.3 Rate limit & locks
- `rl:{scope}:{id}` — token-bucket struct (count, last_ts) using a Lua script for atomic refill+consume.
- `lock:import:{user_id}:{playlistId}` — `SET NX PX 60000`, prevents concurrent imports of the same playlist.
- `sem:tutor:{user_id}` — INCR with `EXPIRE`; reject if > 2 concurrent streams.
- `idem:{key}` — full response stored 5 min for fast replay; promoted to `idempotency_keys` table for 24h.

### 8.4 Invalidation
- **Tag-based invalidation** via Redis sets:
  - On course publish: `DEL cache:explore:list:* (SCAN match)`, `DEL cache:course:public:{id}`, `DEL cache:course:modules:{id}`.
  - On profile update: `DEL cache:user_stats:{uid}`, `DEL cache:profile:public:{uid}`.
  - On `module.completed`: `DEL cache:user_stats:{uid}`, `DEL cache:leaderboard:*`.
- Invalidation is fired from `cache.invalidate` job (idempotent) — never from inside a DB transaction.
- A `cache-version` env var participates in keys to allow blanket flush via deploy bump (`...:v1` → `:v2`).

### 8.5 Pub/Sub
- Channel `ch:user:{uid}` — server-pushed events for SSE (XP gained, achievement unlocked).
- Channel `ch:leaderboard` — broadcast on top-100 change.

---

## 9. Error Handling

### 9.1 Error taxonomy
Internal `error` interface: `type AppError struct { Code string; HTTPStatus int; Message string; Details map[string]any; Cause error; Retryable bool }`. Always wrapped with `errors.Is/As` support.

Code families:
- `invalid_request` (400) — payload/Zod-style validation.
- `unauthorized` (401) — missing/invalid token.
- `forbidden` (403) — authz/ownership failure.
- `not_found` (404).
- `conflict` (409) — unique/state conflict (e.g., already enrolled, duplicate cert).
- `unprocessable` (422) — semantic (e.g., course not yet complete).
- `rate_limited` (429) — include `Retry-After`.
- `dependency_unavailable` (502) — upstream (YouTube, AI gateway).
- `internal` (500) — bug, paged.
- `timeout` (504).

Per-feature codes (subset): `course.not_owner`, `course.cannot_publish_empty`, `module.locked`, `quiz.no_questions`, `quiz.already_submitted_today`, `import.invalid_url`, `import.playlist_private`, `import.quota_exceeded`, `auth.invalid_otp`, `auth.refresh_reused`, `cert.course_incomplete`, `tutor.concurrency_limit`.

### 9.2 API error format
```json
{
  "error": {
    "code": "course.not_owner",
    "message": "You do not own this course.",
    "details": { "course_id": "..." },
    "request_id": "req_01HABCXYZ",
    "trace_id": "0af7651916cd43dd8448eb211c80319c"
  }
}
```
Headers always include `X-Request-Id`. 4xx with `details.fields` for validation.

### 9.3 Logging
- **`slog` JSON** to stdout; collected by platform.
- Mandatory fields: `ts, level, service, env, request_id, trace_id, span_id, user_id?, route, status, duration_ms, error_code?, msg`.
- **Never** log: passwords, tokens, JWTs, OAuth state, raw email bodies, AI message content (logs `len` + `hash` only).
- Sample policy: 100% errors, 10% successes for hot routes (`/modules/{id}/progress`, SSE).
- Sentry/Bugsnag for `internal` family; alert on rate > 1% for any 1-minute window.

---

## 10. Security

### 10.1 Input sanitization & validation
- Every handler decodes JSON with `DisallowUnknownFields` + size cap (1 MB default, 64 KB for chat messages each).
- Schema validation via `go-playground/validator/v10` with custom rules: `email`, `url_http`, `uuid`, `yt_playlist_url`, `safe_filename`, `slug`.
- Output encoding: JSON via stdlib (no template HTML rendering on API).
- File uploads: only via signed S3-compatible PUT URLs (`avatars` bucket), enforce `Content-Type` allowlist (`image/png`, `image/jpeg`, `image/webp`), max 2 MB. ClamAV scan job before public URL is enabled.
- Markdown in notes is rendered client-side; server stores raw and never executes.
- All DB access through `pgx` parameterized queries; **no string concatenation in SQL**, ever. `sqlc`-generated queries are the default.

### 10.2 Rate limiting
- Per IP, per user, per endpoint as documented in §4. Combined via `min(ip_bucket, user_bucket, route_bucket)`.
- Auth endpoints: stricter buckets + exponential lockout (`auth.lockout:<email>` 5/10/30/60 min after 5/10/15/20 failures).
- Tutor SSE: max 2 concurrent per user, hard cap 30 req/min.
- `429` always includes `Retry-After` and `X-RateLimit-*` headers.

### 10.3 Abuse prevention
- Bot mitigation at edge (Turnstile/hCaptcha) on `auth/magic-link` and `import/youtube` for unauth-like patterns.
- YouTube quota guard: per-user 10 imports/h and global circuit breaker on `dependency_unavailable`.
- AI cost guard: per-user daily message cap (default 200), monthly cap; rejected with `tutor.quota_exceeded`.
- Heuristic spam detection on notes (length spikes, link density) → flag for admin review (`flagged_notes` table — future).

### 10.4 Audit logs
- `audit_events` table (future, not in current schema): `id, actor_user_id, actor_role, action, target_type, target_id, before, after, ip, ua, created_at`.
- Mandatory audit events: role grant/revoke, course delete, course `is_system` toggle, account deletion, admin login.
- Write inside the same DB tx as the change; immutable (`REVOKE UPDATE, DELETE`).
- 365-day retention; export to cold storage monthly.

### 10.5 Transport & secrets
- TLS 1.2+ only; HSTS preload.
- Secrets via env, sourced from cloud secrets manager; no secret in image.
- DB connections require TLS; service uses limited-privilege role (no `SUPERUSER`, no DDL).
- Backups: PITR 7 days, daily encrypted snapshots 30 days, monthly 12 months.

---

## 11. Folder Structure

```text
zverts-backend/
├── cmd/
│   ├── api/main.go                 # HTTP server entrypoint
│   ├── worker/main.go              # River workers + cron
│   └── migrate/main.go             # golang-migrate runner
├── internal/
│   ├── auth/
│   │   ├── service.go              # AuthService interface + impl
│   │   ├── jwt.go                  # sign/verify, JWKS
│   │   ├── oauth_google.go
│   │   ├── magic_link.go
│   │   ├── password_reset.go
│   │   ├── http.go                 # chi handlers
│   │   ├── middleware.go           # require_auth, require_role
│   │   └── service_test.go
│   ├── users/
│   │   ├── service.go
│   │   ├── repo.sql.go             # sqlc-generated
│   │   ├── queries.sql             # sqlc source
│   │   ├── http.go
│   │   └── delete_account.go
│   ├── courses/
│   │   ├── service.go
│   │   ├── repo.sql.go
│   │   ├── queries.sql
│   │   ├── http.go
│   │   ├── explore.go              # read model
│   │   └── visibility.go
│   ├── importing/
│   │   ├── service.go
│   │   ├── youtube_client.go
│   │   ├── parser.go
│   │   ├── job.go                  # river worker
│   │   └── http.go
│   ├── learn/
│   │   ├── progress_service.go
│   │   ├── notes_service.go
│   │   ├── repo.sql.go
│   │   ├── queries.sql
│   │   └── http.go
│   ├── quiz/
│   │   ├── service.go
│   │   ├── daily_challenge.go
│   │   ├── repo.sql.go
│   │   ├── queries.sql
│   │   └── http.go
│   ├── gamification/
│   │   ├── service.go
│   │   ├── achievements.go
│   │   ├── leaderboard.go
│   │   ├── repo.sql.go
│   │   ├── queries.sql
│   │   └── http.go
│   ├── certificates/
│   │   ├── service.go
│   │   ├── pdf_renderer.go         # gofpdf/maroto
│   │   ├── repo.sql.go
│   │   ├── queries.sql
│   │   └── http.go
│   ├── tutor/
│   │   ├── service.go              # SSE proxy
│   │   ├── ai_gateway_client.go
│   │   └── http.go
│   ├── notifications/
│   │   ├── service.go
│   │   ├── email_provider.go
│   │   ├── templates/              # MJML→HTML build artifacts
│   │   └── job.go
│   ├── admin/
│   │   ├── service.go
│   │   ├── http.go
│   │   └── audit.go
│   ├── storage/
│   │   ├── signer.go               # S3-compatible presign
│   │   └── http.go
│   └── platform/
│       ├── config/                 # envconfig
│       ├── httpx/                  # router, mw (req_id, log, recover, cors, ratelimit, timeout)
│       ├── log/
│       ├── otel/
│       ├── db/                     # pgxpool factory + healthcheck
│       ├── redis/
│       ├── queue/                  # river bootstrap + lanes
│       ├── ratelimit/              # token-bucket lua + Allow()
│       ├── idempotency/
│       ├── outbox/                 # dispatcher + listener
│       ├── validate/               # validator instance + custom rules
│       ├── errors/                 # AppError, HTTP render
│       ├── pagination/             # cursor helpers
│       └── clients/                # youtube, ai_gateway, email
├── migrations/                     # golang-migrate SQL files (numbered)
├── api/                            # OpenAPI 3.1 spec + generated docs
│   └── openapi.yaml
├── deploy/
│   ├── Dockerfile
│   ├── k8s/                        # api, worker, migrate jobs
│   └── grafana/                    # dashboards as code
├── scripts/
│   ├── sqlc.yaml
│   ├── lint.sh
│   └── seed.go
├── test/
│   ├── e2e/                        # http-driven, against ephemeral pg+redis
│   ├── fixtures/
│   └── testcontainers/
├── go.mod
├── go.sum
└── Makefile
```

---

## 12. Scaling Strategy

### 12.1 Known/expected bottlenecks
1. **Watch-progress writes** (`update_module_progress`): most frequent mutation, every 10 s per active learner.
2. **Leaderboard reads**: O(N log N) on `profiles.total_xp` if uncached.
3. **YouTube API quota** (10k units/day default).
4. **AI gateway streams** (cost + concurrency).
5. **SSE/long-lived connections** holding file descriptors on API replicas.
6. **`courses` `is_public` scans on explore** as catalog grows.

### 12.2 Horizontal scaling
- **`zverts-api`**: stateless except for SSE connections. Scale via HPA on CPU + p99 latency + RPS. Sticky routing not required (JWT). For SSE, use connection-aware autoscaler (active connections / max).
- **`zverts-worker`**: scale on queue depth + per-lane backlog (River exposes metrics). Separate deployments for `bulk` vs `realtime` lanes so bulk can't starve realtime.
- **PgBouncer** in `transaction` mode between API and Postgres; pool sizing `4 * vCPU` per replica.
- **Read replica** for: explore search, leaderboard, admin metrics, public profile reads. Routed via a `db.ReadOnly()` helper; writes always primary. Replica lag budget 5 s; degrade gracefully (fall back to primary) if exceeded.
- **Redis cluster** scales by shards; clients use cluster-aware driver, hash-tags only where multi-key ops needed (rate-limit Lua).

### 12.3 DB optimization
- **Hot-path query review** every release; `pg_stat_statements` top-20 must justify each entry.
- **Partial indexes** for filters (`WHERE is_public`, `WHERE published_at IS NULL`).
- **Composite indexes** matching access patterns (e.g., `module_progress(user_id, updated_at DESC)`).
- **`UPSERT` everywhere** for progress writes; no read-modify-write race.
- **Batch writes**: progress sync buffers on client (already implemented) + server coalesces multiple updates within a 1 s window per `(user, module)` via a Redis debounce lock.
- **VACUUM/ANALYZE** tuned per-table; `module_progress` autovacuum scale factor 0.02.
- **Materialized view** for leaderboard (`mv_leaderboard_30d`) refreshed by cron + on outbox event; concurrent refresh.
- **Partitioning** (future, when rows > 50M): `mcq_attempts` and `attendance` partitioned monthly by `created_at` / `date`.
- **Connection limits**: API/worker total ≤ 60% of Postgres `max_connections`; long transactions banned (>500 ms warning, >5 s killed).

### 12.4 Edge & CDN
- Public GETs (`/explore/*`, `/explore/courses/{id}`, `/certificates/verify/{code}`) cached at CDN with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- Cert PDF objects served from object storage with signed URLs and CDN in front.
- Static assets (PDF templates, fonts) baked into image; served directly from worker for cert rendering.

### 12.5 Cost & resilience
- Budgets per service published as SLOs (`api_p99 < 250ms`, `worker_lag_p95 < 30s`, `progress_write_success > 99.95%`).
- Circuit breakers on every external client; fallback responses (e.g., leaderboard from cache when DB unhealthy).
- Chaos drills monthly: kill API pod, partition Redis, force replica failover; runbooks reviewed.
- Disaster recovery: PITR + cross-region snapshot, RPO 5 min / RTO 30 min.

---

*End of BACKEND.md.*
