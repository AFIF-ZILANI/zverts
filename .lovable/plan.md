## Vert AI Chat — Premium Upgrade

Transform the existing `AITutorPanel` into a full-featured AI assistant with proper formatting, chat history, model selection, and export.

### Scope

**1. Rendering upgrades (`AITutorPanel.tsx` + new `MessageContent.tsx`)**
- Add KaTeX math rendering via `remark-math` + `rehype-katex` (inline `$...$` and block `$$...$$`, plus `\[...\]`)
- Syntax-highlighted code blocks via `react-syntax-highlighter` (Prism, oneDark/oneLight themes), with language label + copy button, rounded, scrollable
- Detect MCQ pattern (`**Q1.** ... **Answer:** X — ...`) and render as styled cards with question, lettered options, highlighted correct answer, explanation block
- Streaming typing indicator (animated dots), smoother bubble transitions

**2. Header upgrade**
- Vert avatar with online dot, model name, status text
- Buttons: minimize (collapse to floating bubble), maximize (full-screen overlay on desktop), close
- Language toggle moved into a small menu

**3. Model selector**
- Dropdown with: ZverT Fast (gemini-2.5-flash-lite), ZverT Smart (gemini-2.5-flash, default), ZverT Pro (gemini-2.5-pro), ZverT Reasoning (gpt-5-mini)
- Active indicator, persisted per-chat in localStorage
- Edge function accepts `model` param and maps the friendly name → real gateway model id (whitelist server-side)

**4. Message action buttons**
- Below each assistant message: Copy, 👍 Like, 👎 Unlike (local state only — no DB), Export this chat
- Toasts on success

**5. Chat history (localStorage, per-user, per-module)**
- Sidebar drawer (sheet) inside the panel: list previous chats for current module
- Search bar (filter by title/content), pin/unpin (pinned section on top), rename, delete
- Sorted by recent within each section
- Auto-title chat from first user message
- "New chat" button

**6. Export system**
- TXT, Markdown, PDF (jsPDF) of full conversation
- Clean format with timestamps + role headers

**7. Mobile + theming**
- Full-screen drawer on mobile, side panel on desktop
- KaTeX/Prism themes adapt to dark/light via existing ThemeProvider
- Use semantic tokens throughout

### Technical details

- New deps: `katex`, `rehype-katex`, `remark-math`, `react-syntax-highlighter`, `@types/react-syntax-highlighter`, `jspdf`
- Import `katex/dist/katex.min.css` once in `AITutorPanel.tsx`
- New files:
  - `src/components/zerod/ai/MessageContent.tsx` — markdown + math + code + MCQ renderer
  - `src/components/zerod/ai/ChatHistorySidebar.tsx` — history UI
  - `src/components/zerod/ai/ModelSelector.tsx` — dropdown
  - `src/components/zerod/ai/exportChat.ts` — TXT/MD/PDF helpers
  - `src/components/zerod/ai/useChatStore.ts` — localStorage CRUD (`zvert.chats.<userId>.<moduleId>`)
- Edit `AITutorPanel.tsx` to compose the above
- Edit `supabase/functions/ai-tutor/index.ts` to accept `model` and map friendly id → gateway model (default Smart). Strengthen system prompt to always use `$$...$$` for block math, `$...$` inline, fenced code with language tags, and the strict MCQ format.

### Out of scope
- Server-side chat persistence (history stays in browser; clean and fast)
- Account-wide sync across devices
