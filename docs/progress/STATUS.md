# STATUS — single source of truth

Updated: 2026-07-10 (milestone 12 in progress, 6/7)

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
- **Milestone 10 — Derived Search: COMPLETE (6/6).** Scan `memory/` +
  `library/catalog.md` + `reports/` into typed records (`scanSearchRecords`);
  FTS5 `vault_search` sidecar built deterministically (`buildSearchIndex`);
  guarded `GET /api/search?q=&kind=` (safe prefix-token MATCH, ranked, snippets);
  responsive `/search` screen with debounced query, kind filter, highlighted
  snippets, and a Reindex button; `rebuildSearchIndex` runs on demand
  (`POST /api/search/reindex`) and after commit/sync. Verified full
  lint/test/build (238 tests) + a real headless-Chrome e2e (search memory +
  reports, open a report hit → 200 content, reindex picks up a new file).
- **Milestone 11 — Explorer: COMPLETE (6/6).** Link extraction
  (`extractVaultLinks`), persisted `vault_links` graph (sidecar v3, rebuilt via
  `rebuildVaultIndexes` on the search reindex triggers), guarded
  `GET /api/explorer?area=` (nodes+edges+areas) and `GET /api/explorer/node`
  (path-confined detail: title/preview/exists + incoming+outgoing), and the
  responsive `/explorer` screen: area filter, degree-sorted node list with
  outgoing links, and a click-to-open detail panel with jump-between-nodes and
  dangling-target notes. Verified full lint/test/build (252 tests) + a
  headless-Chrome e2e (explore → filter → open node → follow link → dangling
  target).
- App runnable: yes, with `SECOND_BRAIN_WEB_DATA_DIR` pointing at a private
  `0700` data root. Core DB schema at v10; sidecar (`indexes/vault.sqlite`)
  at v3 (FTS5 `vault_search` + `vault_links` graph table).

## Current Phase
Milestone 12 — Production Hardening (final milestone, not yet started)
- Checklist: `docs/progress/milestones/milestone-12-production-hardening.md`.

## Next step
- Begin `m12-07` (milestone + roadmap deliverable): `npm run lint && npm test
  && npm run build` plus a documented container cold-start against a persisted
  data volume. The docker build + run + backup/restore cycles are already
  proven (m12-01/03); m12-07 is the final all-green + a clean cold-start check.
- m12-06 DONE: added `smoke.test.ts` — boots the app and walks health 200 →
  guarded route 401 → full password+TOTP login → guarded route 200 with the
  session. Verified `smoke.test.ts` (1) + full server suite (259) + lint/build.
- m12-05 DONE: `buildApp` now takes a `logStream` seam and applies pino
  `redact` for `req.headers.cookie`/`authorization` (defence-in-depth; default
  serializer already omits headers/bodies). Verified `structured-logs.test.ts`
  (2: JSON lines with level/time/msg + req.method/url + res.statusCode; login
  password and session cookie never appear in logs) + full server suite (258).
- m12-04 DONE: `server/src/security/secret-permissions.ts` —
  `checkSecretPermissions`/`assertSecretPermissions` refuse startup when
  `auth/owner.json` or `ssh/deploy_key` grant any group/other bit (`.pub`
  excluded; missing files skipped). Wired into `index.ts` (exits 1 with an
  actionable chmod message). Verified `secret-permissions.test.ts` (4) + full
  server suite (256) + a real container (boots at 0600; after `chmod 644` +
  restart it exits 1 with "secret files are accessible by other users…").
- m12-03 DONE: wrote `docs/deploy/backup-restore.md` — data-root subdir table
  (db/auth not recoverable; ssh regenerable; workspaces re-clonable; indexes a
  rebuildable cache), volume tar backup, restore into a fresh volume (chown
  1000 + chmod 700), and boot verification. Noted `SECRETS_KEY` lives outside
  the volume. Empirically ran the full backup→restore→boot cycle: restored
  container `/api/health`→200 with `owner.json` 600 and `/data` 700 preserved.
- m12-02 DONE: wrote `docs/deploy/deployment.md` — Docker build/run (publish to
  127.0.0.1 + volume), env table (DATA_DIR/SECRETS_KEY/HOST/PORT/UPLOAD_MAX/
  NODE_ENV), reverse-proxy + **HTTPS required** (cookies are `Secure` under
  `NODE_ENV=production`) with nginx + Caddy examples, first-run owner setup, and
  vault SSH deploy-key setup. Verified the grep check AND that the documented
  `docker exec … node server/dist/cli/reset-auth.js /data` really works in the
  container (prints OTP + TOTP URI, writes owner.json 600).
- m12-01 DONE: multi-stage `Dockerfile` (node:24-slim) builds server+web and
  runs `node server/dist/index.js`; `.dockerignore` keeps the context clean.
  Data root at `/data` (volume), created `700 node` so the app's privacy check
  passes; binds `0.0.0.0:8722`. Verified `docker build` succeeds AND a run
  against a named volume serves `/api/health`→200, `/login`→200, `/api/status`
  →200 with `/data` at `700 node` and structured JSON logs. Docker daemon IS
  available in this env.
- m10-06 DONE: added a Reindex button to `/search` (POST `/api/search/reindex`
  with a count notice, re-running the active query). Ran full lint/test/build
  (238) + a headless-Chrome deliverable e2e: searched "domain" across memory +
  reports, filtered to the report, opened the hit's authenticated content URL
  (`/api/reports/content/...` → 200 with the report body), then wrote a new
  note and used Reindex to make it searchable (0 → "Reindexed 3 items." → 1).
- Milestone 10 items m10-01…m10-05 done — see journal for per-item evidence.
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

- Top nav now has 9 items (added Search + Explorer): at ~1280 the desktop
  labels wrap to two lines and the mobile bottom-nav clips the last items
  (Vault/Models). Page has no horizontal overflow, but the nav needs a density
  pass (overflow menu / horizontal scroll / shorter labels) — its own UI task.

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
