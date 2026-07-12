# STATUS — single source of truth

Updated: 2026-07-12 (no active milestone; milestone 58 complete)

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
  command from there). Core DB schema v16; sidecar v3. Server suite: 376
  tests green. UI routes: `/` = chat, `/command-centre`, `/capture`,
  `/follow-ups`, `/reports`, `/search`, `/explorer`, `/vault`, `/providers`,
  `/login`, `/setup`.

## Active milestone

Milestone 58 (agent deploy-key Git access) is complete. Agent-launched Git
inherits the same canonical hardened deploy-key SSH command as Save & Sync.

Previous: milestone 57 (table copy spacing) is complete. The table copy control sits in
a separate action row with clear space before the header.

Previous: milestone 56 (copy raw assistant responses) is complete. Every non-empty
assistant message has a Copy action for its exact original Markdown.

Previous: milestone 55 (table copy in preview modal) is complete. Expanded Markdown
tables expose the same rich HTML/Excel-compatible TSV copy control.

Previous: milestone 54 (Excel-compatible Markdown table copy) is complete. Rendered chat
tables have one copy control that writes rich HTML and Excel-compatible TSV
together, with a TSV-only fallback.

Previous: milestone 53 (approval modes) is complete: Manual/Normal/Auto/Chat modes
with a vault-scoped policy matrix (schema v16 migrates legacy presets;
`.git` protected in every mode; library/ guard unchanged) and a modes popup
menu in the composer.

Previous: milestone 52 (approval detail) is complete: approval cards show the target
path/command and a size-capped, collapsible preview of the pending change.

Previous: milestone 51 (new-chat defaults) is complete: composer settings changed in a
new-chat state persist to profile `chatDefaults` and seed future new chats.

Previous: milestone 50 (composer model menu) is complete. Archived checklist:
`docs/progress/milestones/archive/milestone-50-composer-model-menu.md`. The
composer names the real active model (no placeholder) with a popup menu:
model submenu, Thinking toggle, Effort slider (catalog-gated); persisted
per session (schema v16) and passed to the SDK at start. Milestones 48–50
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
