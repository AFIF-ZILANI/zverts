In `src/components/app/AITutorPanel.tsx` (chat header, lines ~248-259):

- Remove the green status dot on the avatar (the `<span>` ring at line 252).
- Remove the "online · {currentModelLabel}" subtitle row entirely (the model is already shown by the ModelSelector dropdown to the right).
- Keep only the avatar + "Vert" name as the header identity.

Result: a cleaner header on mobile (and desktop) — just avatar + "Vert", with controls (model selector, language, maximize, minimize) on the right. No redundant model label, no fake online indicator.