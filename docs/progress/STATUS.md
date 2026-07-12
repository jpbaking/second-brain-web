# STATUS — single source of truth

Updated: 2026-07-13 (milestone 73 active; milestone 72 paused at m72-03)

## Where we are

- **Everything planned so far is DONE** — milestones 0–71. Foundation
  (0–49): auth, vault clone/health/commit/push, declarative providers,
  Cline SDK chat (approvals, write lock, streaming, markdown/mermaid,
  compaction, workflows), capture + inbox uploads, reports, follow-ups,
  FTS search, schedules, backups, profile, chat-first UI, production
  hardening, web search tools, chat-scoped file attachments. Recent
  (50–71): composer model menu, new-chat defaults, approval modes +
  detail, table/raw-markdown copy, deploy-key agent Git, workflow
  autocomplete, page heroes, collapsible sidebar + chat search + row
  menus, new-chat landing, brain brand mark, explorer file browser with
  download, amber Secretary label, copyright footer, traceable exceptions,
  and configurable structured logging. Evidence:
  checklists in `docs/progress/milestones/archive/`; narrative in
  `journal.md` + `journal-archive-2026-07.md`.
- **The app is production-runnable.** From the repo root: `./configure`
  then `./compose-helper.sh up`; owner setup via `./compose-helper.sh
  exec second-brain-web node server/dist/cli/reset-auth.js /data`. Bare
  metal: `cd app && npm install && npm run build && npm start` with
  `SECOND_BRAIN_WEB_DATA_DIR` at a private `0700` dir.
- Key facts: all app source under `app/` (npm workspace root — run every
  npm command from there). Core DB schema v16; sidecar v3. Server suite:
  390 tests green; 3 Playwright e2e specs in `app/test/e2e/`. UI routes:
  `/` = chat, `/command-centre`, `/capture`, `/follow-ups`, `/reports`,
  `/search`, `/explorer`, `/vault`, `/providers`, `/login`, `/setup`.

## Active milestone

**Milestone 73 — ChatGPT (subscription) provider** (principal-directed
2026-07-13). Auth via `./configure` using the Cline SDK's built-in ChatGPT
OAuth (`openai-codex`); credentials stored encrypted like API keys. Design
notes in the checklist. **Milestone 72 is paused at m72-03** — resume it
after 73 ships. **Milestones 62–71 need `./compose-helper.sh up` (rebuild)
to go live.**

## Next step

Implement **m73-05**: web /providers display for chatgpt profiles.

## Read before working

- `AGENTS-PLAYBOOK.md` — always, top to bottom.
- `docs/progress/milestones/milestone-73-chatgpt-provider.md`.
- `docs/progress/BACKLOG.md` — the work queue.

## Questions for the principal

- None currently.

## Known issues / parked TODOs

- Tracked in `docs/progress/BACKLOG.md` (Improvements section) — do not
  list them here twice.
- Live Claude Code routing is verified, but the Pro allowance can hit
  session limits; retry after the reset time it reports.
