# Milestone 69 — copyright footer

Principal-directed 2026-07-12: show a "© 2026 Joseph Baking" footer on all
pages — including /login and /setup — but not on chat surfaces.

- [x] **m69-01** Shared `AppFooter` component; rendered in AppShell content
  for non-chat paths, and on /login and /setup (outside the shell). Chat
  paths (`/`, `/chat*`) show no footer. Extend `explorer.spec.ts` (footer
  visible) and `login.spec.ts` (footer on login, absent after landing on
  chat); screenshot.
  Verify: `cd app && npm run lint && npm run build && npx playwright test`
