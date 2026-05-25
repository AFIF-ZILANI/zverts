# PRODUCT.md — ZverT

> Source-of-truth product specification for ZverT, a gamified learning platform that converts public YouTube playlists into structured, progress-tracked, certificate-bearing courses with an in-lesson AI tutor.

---

## 1. Product Overview

### Product name
**ZverT** — "your playlist, leveled up."

### Mission
Turn the world's free video content (starting with YouTube) into rigorous, finishable, accountable learning experiences — so self-taught learners actually complete what they start.

### Core problem solved
Self-directed learners drown in saved playlists they never finish. YouTube is optimized for engagement, not completion: no sequencing, no progress memory across sessions, no comprehension checks, no proof of learning, no accountability loop. Bootcamps and LMS platforms solve this but cost $20–$2000/mo and lock content inside walled gardens.

ZverT closes the gap: take any public playlist → get a sequenced course with locked modules, watch-progress sync, comprehension MCQs, smart notes, an AI tutor, streaks, XP, and a verifiable certificate — for free, on content the user already trusts.

### Why this product should exist
1. **YouTube is the world's largest unaccredited university** — but has zero pedagogical scaffolding.
2. **Existing LMS tools require authoring** — ZverT requires only a URL.
3. **Gamification + AI tutoring measurably increase completion** — and both are now cheap to deliver.
4. **Creators benefit** — learners discover playlist authors via the Explore + course-detail attribution, with no extra work from the creator.

### Target market
- **Primary geography:** English- and Bangla-speaking self-learners (i18n already shipped for `en` / `bn`).
- **Primary segments:** university CS/engineering students, career switchers, bootcamp-curious developers, exam-prep learners (GATE, IELTS, etc.), professional upskillers.
- **TAM signal:** YouTube reports >1B hours/day of learning-adjacent watch time; Coursera + Udemy together serve ~150M registered learners.

### Target users
1. **The Self-Taught Developer** — wants structure on top of free content.
2. **The Bangla-speaking student** — wants localized UI on global content.
3. **The Career Switcher** — needs a certificate to show effort even without accreditation.
4. **The Creator/Curator** — shares public ZverT courses to add structure to their playlists.
5. **The Admin/Operator** — curates system courses and moderates public content.

### Primary use cases
- UC-1: Import a YouTube playlist and turn it into a sequential course.
- UC-2: Resume yesterday's lesson at the right module and timestamp.
- UC-3: Take a per-module MCQ to unlock the next module.
- UC-4: Ask the AI tutor a question grounded in the current lesson.
- UC-5: Maintain a daily learning streak via the daily challenge.
- UC-6: Earn and download a completion certificate.
- UC-7: Publish a course to `/explore` for others to learn from.
- UC-8: Compete on the leaderboard via XP/gems.

---

## 2. User Personas

### Persona A — "Rifat, the CS undergrad" (primary)
- **Who:** 20yo CS student in Dhaka, Bangladesh. Studies in Bangla, codes in English. Patchy bandwidth.
- **Goals:** Master DSA + system design before campus placements; finish what he starts; prove it to recruiters.
- **Pain points:** Buys Udemy courses he never finishes; loses YouTube playlist position when phone restarts; no one to ask "why does this work?" at 2am.
- **Expected behavior:** Imports 1–3 playlists/month, studies 30–60min/day, abandons if a UI element is in jargon-only English. Will use AI tutor heavily. Cares about streaks.

### Persona B — "Maya, the career switcher" (primary)
- **Who:** 29yo marketer pivoting to product management.
- **Goals:** Build a credible portfolio of completed learning in 6 months.
- **Pain points:** Doesn't trust her own progress; needs external validation (cert, leaderboard).
- **Expected behavior:** Imports curated playlists from known creators. Downloads every certificate. Shares progress externally.

### Persona C — "Daniyal, the creator-curator" (secondary)
- **Who:** YouTube educator with a 30-video DSA playlist.
- **Goals:** Help his audience actually finish his content; gain attribution.
- **Pain points:** YouTube hides completion stats; no way to add quizzes.
- **Expected behavior:** Imports his own playlist, marks it public, shares the `/courses/:id` link in video descriptions.

### Persona D — "Sara, the admin/operator" (internal)
- **Who:** ZverT team member with `admin` role.
- **Goals:** Curate high-quality system courses; remove abusive content; monitor usage.
- **Pain points:** Needs visibility into user-generated public courses and email delivery health.
- **Expected behavior:** Lives in `/admin`. Promotes vetted courses to `is_system = true`.

---

## 3. Core Features

### 3.1 Essential MVP features

#### F-1 — Playlist Import
- **Purpose:** Convert a public YouTube playlist URL into a ZverT course.
- **User value:** Zero-authoring course creation.
- **Functional requirements:**
  - Accept a YouTube playlist URL on `/courses`.
  - Call `preview-youtube-playlist` edge function → return title, thumbnail, video count, author.
  - On confirm, call `import-youtube-playlist` → create `courses` row + N `modules` rows (one per video), set `position`, `youtube_video_id`, `duration_seconds`, `thumbnail_url`.
  - Resolve and store `author_name`, `author_channel_id`, `author_channel_url` via `fetch-playlist-author`.
- **Inputs:** Playlist URL (string).
- **Outputs:** `course.id`, redirect to `/courses/:id`.
- **Validation:** URL must match YouTube playlist pattern; playlist must be public; ≥1 video; ≤500 videos (rate-limit guard).
- **Errors:** Invalid URL → inline form error. Private playlist → "Playlist is private or unavailable." API quota exceeded → "Try again in a few minutes." Network → retryable toast.
- **Edge cases:** Live/upcoming videos skipped; deleted videos kept as locked stubs with title only; duplicate import → returns existing course id.

#### F-2 — Sequential Module Unlocking
- **Purpose:** Force linear progression to drive completion.
- **Functional requirements:** Module N is locked until module N-1 has `module_progress.completed = true` AND `mcq_passed = true` if MCQs exist for it. First module always unlocked.
- **Validation:** Enforced server-side via RPC; UI lock is cosmetic only.
- **Edge cases:** Owner/admin can preview any module without unlocking constraint.

#### F-3 — Embedded YouTube Player with Progress Sync
- **Purpose:** Resume + analytics + completion detection.
- **Functional requirements:**
  - Render YouTube IFrame Player in `/learn/:id`.
  - Throttled sync (every 10s and on pause) updates `module_progress.watch_time_seconds`, `percent_watched`.
  - At `percent_watched >= 90` → `completed = true`, `completed_at = now()`.
  - On completion → trigger XP grant, streak update, achievement check, next-module unlock.
- **Edge cases:** Skipping ahead beyond 90% does not award completion unless cumulative watched time ≥ 50% of duration. Network loss → queue updates in memory, flush on reconnect.

#### F-4 — Authentication
- **Purpose:** Identify users; gate progress, gamification, and certificates.
- **Functional requirements:**
  - Email magic link + Google OAuth (via Lovable Cloud).
  - On first sign-in: trigger creates `profiles` row.
  - Password reset flow at `/reset-password`.
- **Validation:** Email format (Zod), HIBP leaked-password check on password flows.
- **Errors:** Inline form errors; rate-limit messaging from provider surfaced verbatim.

#### F-5 — Personal Dashboard
- **Purpose:** Single-glance state of the learner.
- **Components:** ContinueWatching, WeeklyActivityChart, StatCard ×4 (XP, gems, streak, completed), DailyChallenge, BadgesGrid preview.
- **Empty state:** "Import your first playlist" CTA → `/courses`.

#### F-6 — Smart Notes
- **Purpose:** Capture insight against a moment in the video.
- **Functional requirements:** Notes attached to `module_id`, optional `timestamp_seconds`. Clicking a timestamped note seeks the player. Markdown rendering.
- **Validation:** content 1–5000 chars; timestamp 0..duration_seconds.

#### F-7 — Gamification (XP, Gems, Streak, Daily Challenge, Badges)
- **XP:** +10 per module completed, +5 per MCQ passed, +25 per course completed.
- **Gems:** +1 per daily challenge passed; spendable in future phases.
- **Streak:** Daily attendance row written on first qualifying activity (≥5min watch or MCQ attempt). Grace: 1 missed day allowed per 7-day window.
- **Daily challenge:** 5-question MCQ from a random in-progress module; pass = ≥60%.
- **Badges:** Achievement codes unlocked via DB rules (e.g. `first_course`, `7_day_streak`, `night_owl`).

#### F-8 — Auth Guard / Protected Routes
- Routes `/dashboard`, `/learn`, `/learn/:id`, `/quiz/:id`, `/profile`, `/settings`, `/leaderboard`, `/admin`, `/certificate/:courseId`, `/courses` require an authenticated session.
- `/admin` additionally requires `has_role(uid, 'admin')`.
- `/`, `/auth`, `/explore`, `/info/:slug`, `/reset-password` are public.

### 3.2 Secondary features

#### F-9 — MCQ Quizzes (`/quiz/:id`)
- Per-module MCQs from `mcq_questions`. Pass = ≥60% on first attempt to set `mcq_passed=true`. Attempts stored in `mcq_attempts`. Explanations shown after submit.

#### F-10 — Certificates
- Generated client-side as PDF when `(completed_modules / total_modules) = 100%` AND all required MCQs passed.
- Stored in `certificates` with `certificate_code` (verifiable), `issued_to_name` (snapshot of `profiles.certificate_name`), `course_title`.

#### F-11 — Explore (`/explore`)
- Lists `courses` where `is_public = true OR is_system = true`. Filter by language, length, author. Public preview of modules but watch requires sign-in + "enroll" (copy course reference or follow original).

#### F-12 — Course Detail (`/courses/:id`)
- Title, description, module count, total duration, author attribution (`author_name` + link to `author_channel_url`), publish toggle (owner only), import-source link.

#### F-13 — Leaderboard
- Global top 100 by `total_xp` over rolling 7d / 30d / all-time. Honors `profiles.profile_public`.

#### F-14 — AI Tutor "Vert" (`AITutorPanel`)
- Streaming chat grounded in current module title + transcript (when available) + user notes. Model selection via `ModelSelector`. Chat history persisted client-side per module (`useChatStore`). Export chat to markdown.

#### F-15 — Profile + Settings
- Profile: avatar, name, bio, public toggle, badges, streak history.
- Settings: language (en/bn), daily goal minutes, notification toggles (email, inactivity, completion), study reminders, certificate name, account deletion (calls `delete-account` edge function).

#### F-16 — i18n (en / bn)
- Toggleable; persisted in `profiles.preferred_language`. All UI strings via `react-i18next`.

### 3.3 Advanced features

- **F-17 — Public course publishing:** Owner toggles `is_public`; appears on `/explore`. Profanity/abuse reportable.
- **F-18 — Verifiable certificate page:** `/certificate/:courseId` shows public verification by code.
- **F-19 — Theme system:** Light/dark via `next-themes`, persists across sessions.
- **F-20 — Watch-history resume cards:** `ContinueWatching` queries last 3 modules with `updated_at` desc and `completed=false`.

### 3.4 Admin features (`/admin`)

- **A-1** List all courses + filter by `is_system`, `is_public`, owner.
- **A-2** Promote course to `is_system = true` (curated catalog).
- **A-3** Soft-remove abusive public courses.
- **A-4** View `email_logs` for delivery health.
- **A-5** Grant/revoke `admin` role via `user_roles` table.

### 3.5 Future expansion (out of MVP)

- Non-YouTube sources (Vimeo, MP4 uploads, podcast playlists).
- Native mobile (React Native).
- Cohort mode (group enrollment + shared leaderboard).
- Spaced-repetition flashcards generated from transcripts.
- Paid creator tier with custom branding.
- Gem-redeemable rewards marketplace.
- Live study rooms (WebRTC).

---

## 4. User Flows

### 4.1 Onboarding flow
1. Visitor lands on `/`.
2. Clicks **Get Started** → `/auth`.
3. Enters email → magic link OR clicks **Continue with Google**.
4. Returns to `/dashboard` with empty state.
5. Empty state CTA → `/courses` → paste playlist URL.
6. Preview shown → **Create course** → redirect `/courses/:id`.
7. Clicks first module → `/learn/:id` → player auto-plays. First-time tooltip introduces Notes + AI Tutor.

### 4.2 Authentication flow
- **Magic link:** email → OTP link → session set → redirect to `emailRedirectTo` (`/dashboard`).
- **Google:** `lovable.auth.signInWithOAuth("google", { redirect_uri: origin + "/dashboard" })`.
- **Password reset:** `/auth` "Forgot?" → `resetPasswordForEmail` → email link → `/reset-password` → `updateUser({ password })` → `/dashboard`.
- **Session restore:** `useAuth` subscribes to `onAuthStateChange` BEFORE calling `getSession()`.
- **Sign out:** `supabase.auth.signOut()` → redirect `/`.

### 4.3 Main product journey (the "learn loop")
1. `/dashboard` → click resume card → `/learn/:moduleId`.
2. Watch video → progress syncs every 10s.
3. At 90% complete → completion event fires → XP awarded → toast.
4. If module has MCQs → CTA "Take quiz" → `/quiz/:id`.
5. On pass → next module unlocks → auto-advance prompt.
6. After last module + all MCQs passed → certificate becomes available on `/courses/:id`.
7. Click **Download certificate** → PDF generated client-side → `certificates` row inserted.

### 4.4 Error recovery flow
- Player fails to load → "Reload player" button → reinit IFrame.
- Progress sync fails → buffered locally → retried on reconnect; user sees a small "Offline — progress queued" chip.
- Edge function 5xx → toast with retry; for import, partial-import rollback via transaction in edge fn.
- Session expired mid-session → redirect to `/auth?next=<current>` → after sign-in, restore route.

### 4.5 Exit flows
- **Sign out:** AppShell → user menu → Sign out → `/`.
- **Delete account:** `/settings` → Danger zone → confirm modal (type email) → `delete-account` edge fn → server cascades → client signs out → `/`.
- **Unpublish course:** `/courses/:id` → toggle `is_public` off → no longer on `/explore`; existing learners keep access.

---

## 5. Functional Requirements

| ID | Function | Expected behavior |
|----|----------|-------------------|
| FR-01 | Import playlist | Validate URL → preview → on confirm create `courses` + `modules` atomically; rollback on partial failure. |
| FR-02 | Resolve author | Best-effort: failure does not block import; fields nullable. |
| FR-03 | Module unlock | RPC `unlock_next_module(course_id)` runs server-side; client never writes `module_progress.completed` directly. |
| FR-04 | Watch-progress sync | Debounced 10s; on visibilitychange=hidden flush immediately. |
| FR-05 | Completion detection | `percent_watched >= 90` AND cumulative `watch_time_seconds >= 0.5 * duration_seconds`. |
| FR-06 | XP grant | Single source of truth in DB function; idempotent per `(user_id, module_id, event_type)`. |
| FR-07 | Streak | Daily attendance written at most once per UTC date; longest_streak monotonic. |
| FR-08 | Daily challenge | One per UTC date per user; cannot retry on same date. |
| FR-09 | MCQ scoring | `passed = score / total >= 0.6`; first pass sets `mcq_passed`. |
| FR-10 | Certificate | Server validates 100% completion before allowing insert into `certificates`. |
| FR-11 | Public course visibility | RLS enforces `is_public OR is_system OR owner OR admin`. |
| FR-12 | Leaderboard | Honors `profile_public=false` by anonymizing entries as "Private learner". |
| FR-13 | AI tutor | Edge fn `ai-tutor` streams via SSE; cancels on client unmount. |
| FR-14 | Account deletion | Cascades: `module_progress`, `notes`, `mcq_attempts`, `certificates`, `achievements`, `attendance`, `daily_challenges`, `user_roles`, `profiles`, then `auth.users`. |
| FR-15 | i18n | `useTranslation` namespace `nav`, `dashboard`, `course`, `learn`, `quiz`, `settings`, `auth`, `errors`. |
| FR-16 | Route guard | Unauthenticated access to protected route → redirect `/auth?next=<path>`. |

---

## 6. Non-functional Requirements

### Performance
- TTI on `/dashboard` < 2.5s on 4G mid-tier Android.
- Route chunks lazy-loaded via `lazyWithRetry` (already implemented).
- Query cache: `staleTime` 60s, `gcTime` 5min (set in `App.tsx`).
- Player init < 1.5s after route mount.

### Reliability
- Watch-progress writes survive client crash via in-memory queue + flush on visibility/online.
- Edge functions return idempotent results for retried imports (keyed by playlist id + user id).
- 99.5% monthly availability target (inherits Lovable Cloud SLA).

### Security
- All tables RLS-enabled; user-owned data scoped by `auth.uid()`.
- Roles in dedicated `user_roles` table (NEVER on `profiles`) — already implemented.
- `has_role()` is `SECURITY DEFINER` to avoid RLS recursion.
- Edge functions validate JWT via `getClaims()`; CORS strictly configured.
- HIBP leaked-password check enabled.
- No private keys in client; only `VITE_SUPABASE_PUBLISHABLE_KEY` shipped.
- Account-deletion confirms identity by re-typing email.

### Scalability
- Stateless edge functions; horizontal by provider.
- Postgres indexed on hot paths: `module_progress(user_id, module_id)`, `courses(user_id, is_public, is_system)`, `modules(course_id, position)`, `attendance(user_id, date)`.
- Leaderboard query backed by materialized view (future) once `profiles` > 100k.

### Accessibility (WCAG 2.1 AA)
- Color contrast ≥ 4.5:1 in both themes (semantic tokens enforce).
- Keyboard navigable: AppShell mobile menu, player controls, MCQ.
- Focus rings preserved on shadcn primitives.
- `prefers-reduced-motion` respected by Framer Motion variants.
- Alt text on all images including the logo and badge art.
- Live regions for toast notifications and AI streaming.

### Responsiveness
- Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Mobile-first: dashboard reflows to single column < 768; AppShell collapses nav to drawer.
- Player maintains 16:9; AI tutor becomes bottom-sheet on mobile.

---

## 7. Business Logic Rules

- **BR-1** A module is "complete" only when DB conditions in FR-05 hold; client cannot force completion.
- **BR-2** A course is "complete" when every non-deleted module is complete AND every existing MCQ set is passed.
- **BR-3** Certificate issuance is one-per-(user, course); reissue overwrites prior `issued_at`.
- **BR-4** A public course remains visible to existing enrollees even if owner unpublishes; new enrollments blocked.
- **BR-5** System courses (`is_system=true`) cannot be deleted by their original owner.
- **BR-6** A user cannot grant themselves `admin`; only existing admins can.
- **BR-7** A user with `profile_public=false` is excluded from public leaderboard rendering AND from `achievements_select_public`.
- **BR-8** Daily challenge counts toward streak only if passed.
- **BR-9** XP and gems cannot go negative; deletions do not refund.
- **BR-10** Importing the same playlist URL twice as the same user returns the existing course (no duplicates).
- **BR-11** Notes are private to their author regardless of course visibility.
- **BR-12** AI tutor responses are not stored server-side; chat history is client-only (privacy-by-default).
- **BR-13** Email notifications respect per-user toggles (`notify_email`, `notify_inactivity`, `notify_completion`).
- **BR-14** Language preference syncs both ways: change in Settings updates `profiles.preferred_language` AND `i18n.changeLanguage`.

---

## 8. Success Metrics

### Activation
- **AC-1** % of signups that import a playlist within 24h. Target ≥ 45%.
- **AC-2** % of first-imports that complete ≥1 module. Target ≥ 70%.

### Engagement
- **EN-1** D7 retention. Target ≥ 25%.
- **EN-2** D30 retention. Target ≥ 12%.
- **EN-3** Median streak length among returning users. Target ≥ 4 days.
- **EN-4** Daily challenge participation rate among DAU. Target ≥ 35%.

### Completion (north star)
- **CO-1** Course completion rate (started → 100%). Target ≥ 22% (vs ~3–6% MOOC baseline).
- **CO-2** Median time-to-complete for ≤10h courses. Target ≤ 21 days.

### Quality
- **QU-1** AI tutor thumbs-up rate. Target ≥ 80%.
- **QU-2** Crash-free sessions. Target ≥ 99.5%.
- **QU-3** Median p75 LCP on `/dashboard`. Target ≤ 2.5s.

### Growth
- **GR-1** % of courses set public. Target ≥ 15%.
- **GR-2** Explore → signup conversion. Target ≥ 8%.
- **GR-3** Organic K-factor via shared certificates. Target ≥ 0.3.

### Monetization readiness (post-MVP)
- **MO-1** % of MAU completing ≥1 cert/month (proxy for willingness-to-pay). Target ≥ 5%.

---

## 9. MVP Scope

### Included
- Auth: email magic link + Google OAuth + password reset.
- Playlist import (preview + create), author resolution.
- Course detail, module list, sequential unlock.
- YouTube player + watch-progress sync + completion detection.
- Notes (with timestamp).
- Smart dashboard (resume, weekly activity, stats, daily challenge).
- Gamification: XP, gems, streak, daily challenge, badges.
- MCQs + quiz route + scoring.
- Certificates with PDF download + verifiable code.
- Explore (public + system courses).
- Leaderboard (global, XP-based).
- Profile + Settings (language, goal, notifications, certificate name, delete account).
- AI tutor (streaming, model selectable, exportable).
- i18n en/bn.
- Admin panel: course curation, role management, email log visibility.
- Responsive + dark mode + a11y baseline.

### Explicitly excluded from MVP
- Native mobile apps.
- Non-YouTube content sources.
- Payments / subscriptions / gem marketplace.
- Cohort / classroom mode.
- Realtime study rooms.
- Auth0, Clerk, or other third-party auth (Lovable Cloud auth only).
- Server-side AI chat history persistence.
- Auto-generated flashcards / SRS.
- Course discussion forums / comments.
- Creator analytics dashboard.

---

## 10. Product Roadmap

### Phase 0 — Current (shipped / in-repo)
Auth, import, player, progress, notes, gamification core, certificates, explore, leaderboard, AI tutor, admin, i18n, settings.

### Phase 1 — Completion polish (next 4–6 weeks)
- Replace `/quiz/:id` placeholder with full MCQ runner (infra exists).
- Email notifications for streak-at-risk + course-completion (already toggled in settings; wire `email_logs`).
- Onboarding tour overlay on first dashboard visit.
- "Course difficulty" auto-tag from duration + module count.
- Search on `/explore`.

### Phase 2 — Social & creator (8–12 weeks)
- Public profile pages (`/u/:username`) with badge wall.
- Course ratings + completion testimonials.
- Creator attribution surface: claimed channels, "official ZverT course" badge.
- Sharable progress cards (OG-image edge fn).

### Phase 3 — Depth (Q+1)
- AI-generated MCQs from transcripts.
- AI-generated chapter summaries + flashcards.
- Spaced-repetition review queue.
- Transcript search within a course.

### Phase 4 — Reach (Q+2)
- React Native client (read-only first, then full).
- Additional sources: Vimeo, MP4, podcasts.
- More locales (hi, es, ar, id).

### Phase 5 — Monetization (Q+3)
- Free tier (current) + Pro tier (unlimited imports, advanced AI models, ad-free, custom certificate branding).
- Creator tier (vanity URL, branded courses, learner analytics).
- Gem marketplace (cosmetics, streak freezes, certificate frames).

### Phase 6 — Network (Q+4)
- Cohorts and live study rooms.
- Org/team plans with assigned learning paths and admin dashboards.
- Verifiable credentials (OpenBadges / W3C VC) for certificates.
