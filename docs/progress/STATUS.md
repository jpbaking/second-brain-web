# STATUS — single source of truth

Updated: 2026-07-10 (milestone 10 in progress, 3/6)

## Where we are

- Phase: pre-implementation, **SDK feasibility spike DONE — verdict GO**.
  All findings and binding decisions: `docs/spike/findings.md` (m00-10
  section has the decision list).
- **Milestone 1 — Host Bootstrap Scripts: COMPLETE (6/6).**
- **Milestone 2 — Authentication: COMPLETE (10/10).**
- **Milestone 3 — Vault Configuration And Clone: COMPLETE (8/8).**
- **Milestone 4 — Vault Status And Health: COMPLETE (7/7).** git status module,
  single-writer lock, health runner (`python3 scripts/health.py`, text-parsed) +
  endpoint, command-center aggregate + endpoint, and the `/` command centre
  landing page (verified e2e).
- **Milestone 4A — Responsive App Shell: COMPLETE (5/5).** AppShell with a
  sticky desktop top nav + fixed mobile bottom nav across the core screens
  (command centre, chat, follow-ups, reports, vault) with active-route
  highlight + sign-out; stub screens for chat/follow-ups/reports; verified
  navigable with no horizontal overflow at 390 and 1280. Web routes:
  `/`=command centre, `/chat`, `/follow-ups`, `/reports`, `/vault`, `/login`,
  `/setup`.
- **Milestone 5 — Provider Settings: COMPLETE (7/7).** Secrets crypto
  (AES-256-GCM via `SECOND_BRAIN_WEB_SECRETS_KEY`), `provider_profiles` store
  (masked views; key only as ciphertext+last4), guarded CRUD endpoints, a
  connectivity test action (`POST /api/providers/:id/test`), an in-memory
  provider snapshot for chat sessions, and the `/providers` web page (add/edit,
  set default, test, delete) wired into the shell nav. Verified e2e: keyed
  profile create→mask→default→snapshot with the plaintext key never returned
  and never at rest (only `v1:` ciphertext on disk).
- **Milestone 5A — Cline SDK Chat: COMPLETE (10/10).** SDK integration is complete with local LM Studio verified end-to-end. Streaming, persistence, and session rehydration fully implemented without provider key leakage.
- **Milestone 5B — Manual Context Compaction: COMPLETE (6/6).**
- **Milestone 6 — Tool Approvals And Write Lock: COMPLETE (9/9).**
- **Milestone 7 — Quick Capture And Uploads: COMPLETE (8/8).** Quick capture
  routes through the agent; multipart uploads stream unchanged originals into
  locked, traversal-safe timestamped inbox folders with `_intake.md` context;
  the UI can explicitly dispatch the vault inbox workflow for an upload.
- **Milestone 8 — Commit, Health, Push Loop: COMPLETE (6/6).** Changed-file
  review includes untracked uploads; health gates staging; audited commits push
  to the configured branch; push failures remain visible and retryable.
- **Milestone 9 — Report Browser: COMPLETE (6/6).** Authenticated report
  scanning/serving, responsive search/filter shelf, HTML open, PDF/Markdown
  download, and command-centre recents are complete.
- **Milestone 9A — Follow-Up Queue: COMPLETE (6/6).** Typed parser for
  reminders/commitments; guarded `/api/follow-ups` filters+counts; responsive
  queue screen with filter tabs; source `file:line` + vault-safe `linkedSource`;
  `POST /api/follow-ups/:id/complete|edit` routing changes through the agent
  (guard + write-lock), with Mark done / Edit actions in the UI. Verified full
  lint/test/build (227 tests) + a real headless-Chrome e2e (filter → inspect →
  safely update; write dispatched to the agent).
- App runnable: yes, with `SECOND_BRAIN_WEB_DATA_DIR` pointing at a private
  `0700` data root. Core DB schema at v10; sidecar (`indexes/vault.sqlite`)
  at v2 (adds the FTS5 `vault_search` table).

## Current Phase
Milestone 10 — Derived Search (not yet started)
- Checklist: `docs/progress/milestones/milestone-10-derived-search.md`.

## Next step
- Begin `m10-04`: responsive search screen wired into the shell nav (query
  box, ranked results with snippet/kind/path/date, empty+loading states). API:
  `GET /api/search?q=&kind=` → `{ query, count, results:[{path,kind,title,
  mtime,snippet}] }`; snippet marks matches with `[` `]`. Add a nav entry +
  route in `web/src/App.tsx`/`AppShell.tsx`. Verification: web lint+build +
  responsive visual.
- m10-03 DONE: guarded `GET /api/search?q=&kind=` (`server/src/search/
  routes.ts`, wired in app.ts) tokenises input into safe `"tok"*` prefix terms
  (implicit AND, FTS operators can't reach the matcher), queries `vault_search`
  ordered by rank, returns hits with `snippet(-1,'[',']','…',12)`. 400 on empty
  q / bad kind; optional `kind` filter. Verified `search-api.test.ts` (5) +
  full server suite (236) + lint/build.
- m10-02 DONE: sidecar migration v2 adds FTS5 `vault_search (path, title, body,
  kind UNINDEXED, mtime UNINDEXED)`; `buildSearchIndex(db, records)` clears +
  reinserts in one transaction (deterministic, no dup on rebuild) and stamps
  `search_record_count`. Node `node:sqlite` has FTS5 (snippet/rank verified).
  Updated migrations/status version assertions to sidecar v2. Verified
  `search-index.test.ts` (2) + full server suite (231) + lint/build.
- m10-01 DONE: `scanSearchRecords(workspace)` in `server/src/search/scan.ts`
  walks `memory/**.md`, `library/catalog.md`, and reuses `scanReports` (adding
  body text: markdown raw, HTML tag-stripped, PDF title-only). Skips symlinks
  (not `isFile()`) and unsupported extensions; newest-first, path-stable order;
  512KB read cap. Verified `search-scan.test.ts` (2) + server lint/build.
- m9a-06 DONE: wired Mark done / Edit UI actions to the m9a-05 endpoints and
  ran the deliverable e2e. Caught and fixed a real bug — the `complete` POST
  was sending a JSON content-type with no body (Fastify 400); now only `edit`
  carries a JSON body. Verified full lint/test/build + headless-Chrome e2e
  (`runnerStarts:1`, success notice, no horizontal overflow).
- SDK notes (m5a-01): provider ids map anthropic→anthropic, openai→openai-native,
  openai-compatible→openai-compatible; model config is `CoreModelConfig`
  (providerId/modelId/apiKey/baseUrl/headers); storage root is set via
  `CLINE_DATA_DIR` → `<dataDir>/sessions`. `@cline/core` 0.0.58 installed.

## Read before working

- `docs/spike/findings.md` — m00-10 decisions (binding on implementation).
- `docs/project-plan/phase-006-implementation-roadmap.md` — Milestone 7.
- `docs/project-plan/phase-005-files-reports-and-derived-indexes.md` — upload
  and authenticated report-browser rules.
- `docs/project-plan/master-plan.md` — hard rules, runtime layout, auth
  crypto, and secrets handling.
- `docs/project-plan/phase-002-security-auth-and-secrets.md` — password,
  TOTP, session, and secret-storage baseline.

## Questions for the principal

- none currently. (Spike ran entirely on local LM Studio
  `ornith-1.0-9b@q4_k_m` per the principal's instruction; no cloud API key
  was needed.)

## Known issues / parked TODOs

- Follow-up item `text` keeps the inline `source: [label](path)` markdown, so
  it shows raw in the queue row (the resolved link is also shown separately as
  `→ linkedSource`). Cosmetic; parser (m9a-01) deliberately preserves text.
  Consider stripping the trailing `— source: [...](...)` from the display text.

- Global `~/.cline/skills` and rules paths merge into agent sessions — run
  the production app under a dedicated system user (fold into phase-007
  work when it comes up).
- SDK writes session artifacts to `~/.cline/data/sessions/` — find/confirm
  a data-root override option during 5A so session state lands under
  `/data/second-brain-web/sessions/`.
- `spike/test-vault/` is a git-ignored local clone; delete freely, reseed
  via findings m00-03 notes if a later item needs it.
- TOTP secret is stored plaintext base32 in `auth/owner.json` (0600) — MVP per
  phase-002. Hardened option: encrypt it with `SECOND_BRAIN_WEB_SECRETS_KEY`
  (do when the secrets-key crypto lands, likely phase-002 secrets work).
- `reset-auth.sh` invalidates old *credentials* by overwriting `owner.json`;
  clearing active DB sessions on reset is Milestone 2 (sessions table).
- `reset-auth.sh` needs the built server (`npm run build`) or a dev checkout
  with `tsx`; it errors actionably if neither is present.
