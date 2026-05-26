## Phase 1: NotebookLM-style AI Workspace

You picked the **UI overhaul first** — so this phase rebuilds the AI surface as a real workspace, gates it with free-preview limits, and lays the rails (transcript table + edge function stub, source-injection prompt) that phases 2–5 (RAG, embeddings, weak-topic detection, planner) will plug into. Existing in-module `AITutorPanel` keeps working unchanged.

### What you get

1. **New route `/ai`** — full-screen workspace, NotebookLM layout
2. **Free preview gate** — non-paid users get N messages/day, counter visible, paid users unlimited
3. **Transcript viewer panel** — shows transcript when available, "Generate transcript" button when not
4. **Edge function stub** — `transcribe-module` (writes job row, returns "queued"); real Gemini-audio transcription wired in phase 2

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: ZverT AI · model picker · usage chip · close (→/dashboard)│
├────────────┬─────────────────────────────────┬───────────────┤
│ SOURCES    │ CHAT                            │ NOTES /       │
│            │                                 │ TRANSCRIPT    │
│ My courses │  ⌬ Vert                         │               │
│ ▸ Course A │  Hi! Pick a module on the left  │ [Tab] Notes   │
│   · Mod 01 │  to ground my answers in it.    │ [Tab] Script  │
│   · Mod 02 │                                 │               │
│   · Mod 03 │  ▣ You: Explain integrals       │ (transcript   │
│ ▸ Course B │  ▣ Vert: ...streaming...        │  with click-  │
│            │                                 │  to-ask)      │
│ + Upload   │  ─────────────────              │               │
│   (phase 4)│  [textarea ........ ] [send]    │               │
│            │  Mode: Study Buddy ▾  Model ▾   │               │
└────────────┴─────────────────────────────────┴───────────────┘
```

Mobile: panels collapse to bottom tabs (Sources · Chat · Notes).

### Behavior

- **Selecting a module** sets it as the active *source*. The system prompt is built server-side from: course title, module title/position, and transcript (when present). No transcript yet → prompt notes that and offers the user the "Generate transcript" CTA in the panel.
- **Modes** (Study Buddy / Strict Teacher / Exam / Simple Bangla / Deep Explanation / Fast Revision / Coding Mentor) are just system-prompt presets — picked client-side, sent with each turn.
- **Models**: Fast (`gemini-2.5-flash-lite`), Smart (`gemini-2.5-flash`), Deep (`gpt-5`), Coding (`gpt-5-mini`).
- **Free preview**: 10 messages / UTC day for users where `profiles.ai_enabled = false`. On exceed: inline upsell pointing at `/buy`. Counter chip "3 / 10 today" in header.
- **Streaming** via existing `ai-tutor` edge function (already SSE-based); extend it to accept `transcript`, `mode`, `modelId`, and a `usage_token` so the server can decrement the daily allowance atomically.
- **History**: per-source chat threads, stored in localStorage (matches current `useChatStore` pattern). Cross-session DB persistence is phase 5.
- **Transcript panel**: when no transcript row exists, button calls `transcribe-module` edge function → inserts a `transcripts` row with `status='queued'`. Phase 2 turns the stub into a real Gemini transcription worker.

### Database additions

- `transcripts` (module_id PK, status, text, segments jsonb, model, created_at, updated_at)
- `ai_usage` (user_id, day date, count int, PK (user_id, day)) + RPC `consume_ai_message(_limit)` returning remaining; uses `FOR UPDATE` to be race-safe
- RLS: transcripts readable by anyone who can read the module (mirrors `modules_select_scoped`); writable by module owner + admin. `ai_usage` readable/insertable by owner only.

### Files

**New**
- `src/pages/AIWorkspace.tsx` — route shell
- `src/components/ai/SourcesPanel.tsx` — course/module tree, "+ Upload" disabled chip
- `src/components/ai/ChatPanel.tsx` — streaming chat (reuses `MessageContent`, `ModelSelector`)
- `src/components/ai/TranscriptPanel.tsx` — tabs Notes/Transcript, click-to-ask on timestamps
- `src/components/ai/ModeSelector.tsx`
- `src/components/ai/UsageChip.tsx`
- `src/hooks/useAIUsage.tsx` — fetch + decrement helper
- `src/hooks/useTranscript.tsx`
- `supabase/functions/transcribe-module/index.ts` — stub that queues a job
- `supabase/migrations/...` — schema above

**Edited**
- `src/App.tsx` — add `/ai` route (lazy)
- `src/components/app/AppShell.tsx` — add "Vert" nav item
- `supabase/functions/ai-tutor/index.ts` — accept `transcript`, `mode`, `modelId`; check `consume_ai_message` before streaming

### Out of scope for phase 1 (explicit)

- Real audio transcription (stub only — phase 2)
- pgvector + embeddings + retrieval (phase 2)
- Document upload / PDF parsing (phase 4)
- Quiz generator, weak-topic detection, daily planner (phases 3 + 5)
- Threaded DB-backed chat history (phase 5)

This keeps phase 1 to ~1 migration + 1 edge function tweak + 1 edge function stub + ~6 new components. Approve and I'll build it.