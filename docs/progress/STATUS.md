# STATUS — single source of truth

Updated: 2026-07-10 (milestone 9A in progress, 5/6)

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
- Active milestone: **Milestone 9A — Follow-Up Queue**.
- Checklist: `docs/progress/milestones/milestone-09a-follow-up-queue.md`.
- App runnable: yes, with `SECOND_BRAIN_WEB_DATA_DIR` pointing at a private
  `0700` data root. Core DB schema at v10.

## Current Phase
Milestone 9A — Follow-Up Queue

## Next step
- Begin `m9a-06`: milestone deliverable. Wire the queue UI action(s) —
  Mark done (and edit) POST to `/api/follow-ups/:id/complete|edit` — then run
  `npm run lint && npm test && npm run build` plus a browser e2e proving
  filter → inspect → safely update. Action routes + tests already exist.
- m9a-05 DONE: `POST /api/follow-ups/:id/complete` and `.../edit` route the
  change through `AgentSessionService` (guard + write-lock + inspectable
  session), never a direct file write; 404 on unknown id, 400 on no provider/
  empty edit text. Verified `follow-ups-action.test.ts` (5) + server
  lint/build.
- m9a-04 DONE: API surfaces each item's `sourceFile:sourceLine` and a
  vault-safe `linkedSource` (in-vault relative links resolved; external/
  escaping links dropped). Queue rows render origin + `→ linkedSource`.
  Verified `follow-ups-api.test.ts -t source` and web build; 390px visual
  confirms the link wraps with no overflow.
- m9a-03 DONE: `/follow-ups` renders the guarded endpoint — filter tabs with
  live counts, per-item text/kind/direction/due-date (overdue+today emphasis).
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
