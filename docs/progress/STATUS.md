# STATUS — single source of truth

Updated: 2026-07-12 (no active milestone; milestone 68 complete)

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

Milestone 68 (explorer download) is complete: hovering or focusing a file
row in `/explorer` reveals a download icon at the right of the row;
`GET /api/explorer/download` streams the raw file (any type) as an
attachment with the same path guards as the other explorer endpoints.
**Milestones 62–68 need `./compose-helper.sh up` to go live.**

Previous: milestone 67 (amber Secretary label) is complete: the "Secretary" author
label above assistant chat messages uses `var(--accent-amber)` instead of
muted grey. **Milestones 62–67 need `./compose-helper.sh up` to go live.**

Previous: milestone 66 (explorer file browser) is complete: `/explorer` is now a
read-only vault file browser (breadcrumbs, directory listing,
rendered-Markdown/plain-text preview; `GET /api/explorer/tree` + `/file`).
The link-graph UI and endpoints are gone; link extraction stays for search
reindex. New Playwright e2e: `app/test/e2e/explorer.spec.ts` (global-setup
now seeds a provider + vault remote). **Milestones 62–66 need
`./compose-helper.sh up` to go live.**

Previous: milestone 65 (brain logo mark + favicons) is complete: the radio-tower mark is replaced by a brain mark (side profile + node network, kit colours) across logo-mark, invert, SVG and raster favicons; webmanifest named Second Brain. **Milestones 62–65 need `./compose-helper.sh up` to go live.**

Previous: milestone 64 (new-chat landing + brand → command centre) is complete: login/`/` always shows the fresh new-chat state (auto-open of the last chat removed), and the expanded sidebar logo+title link to /command-centre while the collapsed logo keeps its open-sidebar role. **Milestones 62–64 need `./compose-helper.sh up` to go live.**

Previous: milestone 63 (chat-row "…" menu) is complete: the hover trash button became a per-row "…" menu with Rename (inline edit, existing PATCH title route) and Delete. **Milestones 62–63 need `./compose-helper.sh up` (rebuild) to go live.**

Previous: milestone 62 (sidebar polish) is complete: collapsed-logo hover shows an
open-sidebar affordance; New chat/Capture blue-bold follows the current
page; chat search matches message bodies (`GET /api/chat/sessions?q=`,
`searchSessions` in chat-store); star and a new delete button appear only
on chat-row hover. **Needs `./compose-helper.sh up` (rebuild) to go live.**

Previous: milestone 61 (Gemini-inspired sidebar) is complete. The sidebar is persistently
collapsible with icon-led primary actions, chat-title search, recents, and a
bottom secondary-pages menu beside Sign out.

Previous: milestone 60 (consistent non-chat page heroes) is complete. Every non-chat
screen uses one shared logo, kicker, title, and subtitle hero structure.

Previous: milestone 59 (workflow autocomplete UX) is complete. Workflow chips are
hidden; slash autocomplete has descriptions and a strong selected state; a
workflow can create and run as the first turn of a fresh chat.

Previous: milestone 58 (agent deploy-key Git access) is complete. Agent-launched Git
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

Await direction. Rebuild (./compose-helper.sh up) pending for milestones 62–68.

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
