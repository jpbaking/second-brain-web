# STATUS — single source of truth

Updated: 2026-07-08 (milestone 3 complete)

## Where we are

- Phase: pre-implementation, **SDK feasibility spike DONE — verdict GO**.
  All findings and binding decisions: `docs/spike/findings.md` (m00-10
  section has the decision list).
- **Milestone 1 — Host Bootstrap Scripts: COMPLETE (6/6).**
- **Milestone 2 — Authentication: COMPLETE (10/10).**
- **Milestone 3 — Vault Configuration And Clone: COMPLETE (8/8).** vault_config
  store + GET/PUT config API, git runner (deploy-key SSH), clone/ff-only-pull
  sync, vault detection, sync/status API, and a `/vault` settings page. Owner
  can configure a repo and clone it into the data root; UI shows branch +
  commit (verified e2e).
- Active milestone: **Milestone 4 — Vault Status And Health**.
- Checklist: `docs/progress/milestones/milestone-04-vault-health.md`
- App runnable: yes, with `SECOND_BRAIN_WEB_DATA_DIR` pointing at a private
  `0700` data root. Core DB schema at v5.

## Next step

- m04-07: milestone deliverable check — log in, land on the command centre, run
  the health check, see git + health results; full lint/test/build; no secrets
  or checkouts tracked. (m04-01..06 done: git status, lock, health runner +
  endpoint, command-center model + endpoint, command centre page.)

## Read before working

- `docs/spike/findings.md` — m00-10 decisions (binding on implementation).
- `docs/project-plan/phase-006-implementation-roadmap.md` — Milestone 4.
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
