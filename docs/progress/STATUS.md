# STATUS — single source of truth

Updated: 2026-07-09 (milestone 5 complete)

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
- Active milestone: **Milestone 5A — Cline SDK Chat** (10 items; offline-
  verifiable items first, one live-model deliverable check last).
- Checklist: `docs/progress/milestones/milestone-05a-cline-sdk-chat.md`
  (milestone 5 checklist complete).
- App runnable: yes, with `SECOND_BRAIN_WEB_DATA_DIR` pointing at a private
  `0700` data root. Core DB schema at v8 (adds `chat_sessions`, `chat_events`).

## Next step

- m5a-08: workflow shortcut messages — expand `.clinerules/workflows/<name>.md`
  app-side into the standard "Run the following workflow now.\n\n" + content
  message (spike m00-08/#3); list available workflows from the vault checkout
  (`vaultWorkspacePath(dataDir)/.clinerules/workflows`). Wire the existing
  `POST /api/chat/sessions/:id/commands` route to expand + dispatch via
  `AgentSessionService.sendMessage`. Offline tests with seeded workflow files
  (listing, exact expansion, unknown-workflow error with no send).
- Live-model dependency: **m5a-10 (deliverable check) needs LM Studio reachable
  at `http://127.0.0.1:1234/v1` or a configured cloud provider key.** LM Studio
  was NOT reachable when 5A started; m5a-01..09 build/verify offline with a fake
  runner (`AgentRunner` interface), so this only blocks the final live check.
- SDK notes (m5a-01): provider ids map anthropic→anthropic, openai→openai-native,
  openai-compatible→openai-compatible; model config is `CoreModelConfig`
  (providerId/modelId/apiKey/baseUrl/headers); storage root is set via
  `CLINE_DATA_DIR` → `<dataDir>/sessions`. `@cline/core` 0.0.58 installed.

## Read before working

- `docs/spike/findings.md` — m00-10 decisions (binding on implementation).
- `docs/project-plan/phase-006-implementation-roadmap.md` — Milestone 5.
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
