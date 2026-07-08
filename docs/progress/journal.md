# Journal — append-only work log

Never edit or delete past entries. New entries go at the bottom.

## 2026-07-08 — bootstrap (planning session)

Progress-tracking system created alongside `AGENTS-PLAYBOOK.md`. Plan pack in
`docs/project-plan/` reviewed and refined the same day (SDK feasibility spike
added as Milestone 0; `library/` tool-policy guard made mandatory; MVP
slimmed; stack set to a plain long-lived Node service + Vite/React). No
implementation exists yet. Next: milestone 00 checklist, item m00-01.

## 2026-07-08 12:35 — session start
Tree clean at d523094. Active: milestone 00, next item: m00-01. Note: SECOND_BRAIN_SPIKE_API_KEY not set in this environment; key-dependent items will be blocked unless provided.

- 12:35 STARTED m00-01: research current Cline SDK packages/entry points/Agent construction; record in docs/spike/findings.md
- 12:37 DONE m00-01: findings.md created; packages confirmed on npm (@cline/core 0.0.58, sdk=alias, agents/llms/shared; Node >=22). Approval = requestToolApproval async callback (good for web). Docs silent on clinerules/workflows/skills/hooks. Committing.
- 12:37 STARTED m00-02: scaffold spike/ Node project, install @cline/core @cline/llms @cline/shared
- 12:44 DONE m00-02: spike scaffolded, ClineCore session ran against LM Studio ornith-1.0-9b@q4_k_m (principal chose model mid-session). Key gotcha: lmstudio baseUrl needs /v1. Verified by `node spike/01-hello.mjs` -> assistant reply persisted. Bonus: SDK search paths natively include .clinerules layouts.
- 12:45 STARTED m00-03: clone public second-brain template into spike/test-vault, seed dummy data, run health.py
- 12:46 DONE m00-03: public template cloned to spike/test-vault (git-ignored), dummy dossier/project/original seeded per vault conventions; health.py reports healthy. Private vault untouched.
- 12:47 STARTED m00-04: multi-turn test — codeword in turn 1, recall in turns 2 and 3 via cline.send
- 12:48 DONE m00-04: multi-turn PASS via `node spike/02-multiturn.mjs` (codeword recalled across 3 turns). Bonus: .clinerules auto-loaded from cwd — secretary persona appeared without us injecting it.
- 12:48 STARTED m00-05: resume across process restart (script A plants codeword and exits; script B resumes)
- 12:49 DONE m00-05: resume PASS via rehydration (readMessages + initialMessages); plain send across restart = session_not_found. DECISION: app-side rehydration is the primary continuity path.
- 12:51 STARTED m00-06: approval flow — editor tool with autoApprove:false, approval resolved asynchronously from a separate code path
- 13:01 DONE m00-06: approval PASS — editor tool paused on requestToolApproval, resolved externally 3s later, file written. request.input carries the path (feeds m00-09 guard). Tool names: editor/bash/fetch/search.
- 13:01 STARTED m00-07: rules A/B — same prompt, cwd in vault vs empty dir; look for secretary persona
- 13:03 DONE m00-07: rules AUTO-LOADED, A/B confirmed via `node spike/05-rules.mjs` — vault run answers as executive secretary quoting 00-role.md, empty-dir run generic. No injection layer needed.
- 13:04 STARTED m00-08: workflows/skills — marker workflow via /spike-test.md slash message; then inbox attempt
- 13:15 DONE m00-08: slash NOT expanded by core (app expands workflow files — proven); skills auto-load incl. global ~/.cline/skills (flag for deployment); full /inbox.md run with 9B model filed everything correctly, health passes.
- 13:16 STARTED m00-09: library/ tool-policy guard — deny editor on originals, allow catalog edits and shell mv
- 13:21 DONE m00-09: library guard PASS — editor write to original denied (file unchanged), catalog edit + shell mv allowed. Paths arrive relative OR absolute; normalise in production. Rules alone already deter edits (defence layer 1).
- 13:22 DONE m00-10: findings complete, verdict GO, 9 binding decisions recorded. STATUS points to milestone 0A.

## 13:22 — session end. Milestone 00 complete (10/10). Next: create milestone-0a-scaffold checklist and begin scaffold. Note: spike ran fully on local LM Studio, no cloud key needed.
- 13:23 repair: removed stray spike/library/ (editor tool once resolved a relative path against process cwd, not session cwd — recorded in findings m00-09 as a guard requirement).
- 13:24 progress: milestone-0a-scaffold checklist created (8 items); STATUS now points at m0a-01.

## 2026-07-08 13:28 — session continues (same conversation)
Tree clean at 08447f2. Active: milestone 0A.

- 13:28 STARTED m0a-01: root npm workspaces + server/ TypeScript Fastify skeleton with lint/test/build (neostandard, vitest, tsc)
- 13:29 DONE m0a-01: npm workspaces root + server/ Fastify TS skeleton; verified `npm run lint && npm test && npm run build` all pass (neostandard, vitest, tsc). Port default 8722, localhost bind.
- 13:30 STARTED m0a-02: web/ Vite+React+TS skeleton, dev proxy to server, Fastify serves production build
- 13:32 DONE m0a-02: web/ Vite+React skeleton; verified dev proxy (5173 -> /api/health ok), prod build served by Fastify static with SPA fallback (200 on deep route), lint+test pass.
- 13:32 STARTED m0a-03: vendor lazyway-io-design kit into web/public/design, wire stylesheets + favicons, style first screen
- 13:35 DONE m0a-03: lazyway kit vendored (commit f0717ab noted in VENDORED.txt), styles+components linked in order, favicons 200, first screen uses kit classes only; vendored files excluded from lint. Verified against prod build.
- 13:35 STARTED m0a-04: config loader + data root (SECOND_BRAIN_WEB_DATA_DIR, 0700 layout, loud failures)
- 13:37 DONE m0a-04: config loader + data root — no env var exits 1 with actionable message; with it, 8-dir layout created at mode 700; world-readable dir refused (tested); localhost default. 5 tests pass.
- 13:37 STARTED m0a-05: SQLite helper (node:sqlite built-in) with WAL+FK per connection, core/sidecar split
- 13:42 DONE m0a-05: recovered previous WIP; SQLite helper opens core `db/app.sqlite` and sidecar `indexes/vault.sqlite`, applying WAL, foreign keys, and busy timeout per connection. Verified by `npm test --workspace server -- db.test.ts` and full `npm run lint && npm test && npm run build` (lint warnings only in pre-existing config files). Committing.
- 13:43 NOTE m0a-05: recovery commit is 904f127.
- 13:43 STARTED m0a-06: migration runner with schema version tables, startup integrity check, and separate core/sidecar migrations.
- 13:45 DONE m0a-06: migration runner added with per-DB `schema_version`, startup integrity checks before listen, core `app_metadata` and sidecar `vault_index_metadata` kept separate, and sidecar rebuild helper preserving core data. Verified by `npm test --workspace server -- migrations.test.ts` and full `npm run lint && npm test && npm run build` (lint warnings only in pre-existing config files). Committing.
- 13:46 NOTE m0a-06: commit is f89675e.
- 13:46 STARTED m0a-07: unauthenticated setup/status JSON endpoint and kit-styled status page for data dir, DB, and missing auth setup.
- 13:49 DONE m0a-07: `/api/status` reports data dir, core/sidecar DB state, and auth reset message; React setup page renders the same JSON with lazyway kit classes and mobile layout verified at 390x844. Verified by `npm test --workspace server -- status.test.ts`, full `npm run lint && npm test && npm run build`, `curl -sS http://127.0.0.1:8877/api/status`, and headless Chrome screenshot `/tmp/sbw-m0a07-mobile.png` (lint warnings only in pre-existing config files). Committing.
- 13:51 NOTE m0a-07: commit is aea2320.
- 13:51 STARTED m0a-08: scaffold deliverable check, README start command, STATUS handoff to milestone 01, and milestone 01 checklist.
- 13:53 DONE m0a-08: README now documents the scaffold start command; milestone 0A is fully ticked; STATUS points to milestone 01; milestone 01 checklist is seeded. Verified by current `npm run lint && npm test && npm run build`, then temp clone `/tmp/sbw-m0a08-clone` with `npm install`, `npm run build`, documented `SECOND_BRAIN_WEB_DATA_DIR=/tmp/sbw-m0a08-data SECOND_BRAIN_WEB_PORT=8878 npm start`, and `curl -sS http://127.0.0.1:8878/api/status` showing private data root, ready DBs, schema 1, and missing auth setup (lint warnings only in pre-existing config files). Committing.
- 13:54 NOTE m0a-08: commit is db8c63d.

## 13:54 — session end. Milestone 0A complete (8/8). Next: m01-01, `scripts/reset-auth.sh` data-root validation/bootstrap.

## 2026-07-08 17:08 — session start
Tree clean at 8cd068f. Active: milestone 01, next item: m01-01 (scripts/reset-auth.sh data-root validation/bootstrap).
- 17:10 STARTED m01-01: scripts/reset-auth.sh data-root validation + private layout bootstrap with actionable errors
- 17:10 DONE m01-01: scripts/reset-auth.sh validates SECOND_BRAIN_WEB_DATA_DIR, creates the 8-dir private layout at mode 700, and refuses a world-readable root. Verified: no-env exit 1, fresh 0700 root exit 0 with full layout, world-readable (755) exit 1, idempotent re-run exit 0. Committing.
- 17:59 STARTED m01-02: owner auth bootstrap — random one-time password, Argon2id hash (@node-rs/argon2), TOTP secret + otpauth URI, written to auth/owner.json at 0600 (no plaintext password on disk)
- 18:06 DONE m01-02: reset-auth.sh generates owner auth via server CLI — one-time password (100-bit, unambiguous alphabet), Argon2id hash (@node-rs/argon2, m=19456 t=2 p=1), TOTP secret + otpauth URI, written to auth/owner.json at 0600. Verified: 7 new unit tests (hash verifies, no plaintext pw in state, 0600 enforced), full lint(0 err)/test(20)/build pass, end-to-end shell run prints password+otpauth URI and writes 0600 owner.json with no plaintext password, and the tsx dev-fallback path works. Committing.
- 18:08 STARTED m01-03: scripts/generate-deploy-key.sh (ed25519 deploy key under ssh/, private 0600); factor shared data-root validation into scripts/lib/data-root.sh used by both bootstrap scripts
- 18:10 DONE m01-03: added scripts/generate-deploy-key.sh (ed25519 deploy key at ssh/deploy_key, private 0600, public 0644) and factored data-root validation into scripts/lib/data-root.sh (sourced by both scripts). Verified: fresh 0700 root creates priv+pub key with priv mode 600, no-env exits 1, re-run refuses overwrite; reset-auth.sh regression (no-env/fresh/world-readable + prints pw+otpauth) still passes after refactor; bash -n clean on all three; 20 tests pass. Committing.
- 18:11 STARTED m01-04: generate-deploy-key.sh prints operator instructions with the public key line and storage path, never the private key
- 18:11 DONE m01-04: generate-deploy-key.sh prints operator instructions — storage paths, the ssh-ed25519 public key line, and add-as-deploy-key steps (GitHub/GitLab, write access). Verified output includes the public key line and instructions, and contains no private-key header or body. Committing.
- 18:12 STARTED m01-05: add documented --rotate flag to generate-deploy-key.sh (refuse overwrite without it), confirm reset-auth invalidation, add tests for default-refusal + rotate-success and owner-state invalidation
- 18:14 DONE m01-05: generate-deploy-key.sh gains a documented --rotate flag (and --help); default run refuses to overwrite an existing key, --rotate replaces it and reports the old key invalid. reset-auth invalidation confirmed (overwrites owner.json with fresh material). Tests: 4 shell-integration cases (create/refuse/rotate/unknown-arg) + owner-state invalidation unit test; full lint(0 err)/test(25)/build pass; manual refuse/rotate/help demo matches docs. Committing.
- 18:14 STARTED m01-06: README host-bootstrap section for reset-auth.sh + generate-deploy-key.sh; run both scripts in a fresh temp data root and confirm git tracks no secrets/keys/DBs/temp data
- 18:15 DONE m01-06: added README Host Bootstrap section documenting both scripts (matches reality). Deliverable check in a fresh external temp data root: reset-auth produces a password + otpauth URI, generate-deploy-key produces an ssh-ed25519 public key; owner.json and deploy_key both mode 600. Git-tracking check: an in-repo data root has all of owner.json/deploy_key(.pub) ignored (0 untracked under data/), and no sensitive runtime files are tracked anywhere. Milestone 1 complete (6/6). Committing.
- 18:16 STARTED m01-07(progress): create milestone-02-authentication checklist from roadmap Milestone 2 + phase-002
- 18:18 DONE m01-07(progress): milestone-02-authentication checklist created (10 items, each with a verification command); STATUS points at m02-01. Committing.
