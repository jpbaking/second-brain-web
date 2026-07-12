# STATUS — single source of truth

Updated: 2026-07-12 (no active milestone; milestone 50 complete)

## Where we are

- **Everything planned so far is DONE** — milestones 0–49: auth, vault
  clone/health/commit/push, declarative providers, Cline SDK chat (approvals,
  write lock, streaming, markdown/mermaid, compaction, workflows), capture and
  inbox uploads, reports (+ provenance/regenerate), follow-ups, FTS search,
  link explorer, schedules, backups, profile, chat-first UI, production
  hardening, web search tools (SearXNG MCP), chat-scoped file attachments.
  Evidence: checklists in `docs/progress/milestones/archive/`; narrative in
  `journal.md` (older entries: `journal-archive-2026-07.md`).
- **The app is production-runnable.** From the repo root: `./configure` then
  `./compose-helper.sh up`; owner setup via `./compose-helper.sh exec
  second-brain-web node server/dist/cli/reset-auth.js /data`. Bare metal:
  `cd app && npm install && npm run build && npm start` with
  `SECOND_BRAIN_WEB_DATA_DIR` at a private `0700` dir.
- Key facts: all app source under `app/` (npm workspace root — run every npm
  command from there). Core DB schema v15; sidecar v3. Server suite: 366
  tests green. UI routes: `/` = chat, `/command-centre`, `/capture`,
  `/follow-ups`, `/reports`, `/search`, `/explorer`, `/vault`, `/providers`,
  `/login`, `/setup`.

## Active milestone

Milestone 50 (composer model menu) is complete. Archived checklist:
`docs/progress/milestones/archive/milestone-50-composer-model-menu.md`. The
composer names the real active model (no placeholder) with a popup menu:
model submenu, Thinking toggle, Effort slider (catalog-gated); persisted
per session (schema v15) and passed to the SDK at start. Milestones 48–50
need `./compose-helper.sh up` (rebuild) to go live.

Previous: milestone 49 (chat-scoped file upload) — composer paperclip,
files under `dataDir/chat-uploads/<sessionId>/`, images → SDK `userImages`
data URIs, other files → `userFiles` paths, cleanup on session delete/clear.
m49-02 also fixed the Cline `send` envelope (single `{sessionId, prompt}`
object). Milestones 48–49 need `./compose-helper.sh up` (rebuild) to go live.

## Next step

Await direction.

## Read before working

- `AGENTS-PLAYBOOK.md` — always, top to bottom.
- `docs/progress/BACKLOG.md` — the work queue.

## Questions for the principal

- None currently.

## Known issues / parked TODOs

- Tracked in `docs/progress/BACKLOG.md` (Improvements section) — do not list
  them here twice.
- Live Claude Code routing is verified, but the Pro allowance can hit
  session limits; retry after the reset time it reports.
