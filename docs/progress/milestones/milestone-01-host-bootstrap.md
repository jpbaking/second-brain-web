# Milestone 1 — Host Bootstrap Scripts

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 1.
Binding constraints: no secrets in git; data root private (`0700`);
provider/model secrets later use `SECOND_BRAIN_WEB_SECRETS_KEY`, never the
session secret.

- [x] **m01-01** — Add `scripts/reset-auth.sh` entry point that validates
      `SECOND_BRAIN_WEB_DATA_DIR`, creates/uses the app data root, refuses
      unsafe permissions, and prints actionable errors.
      Verify: running it with no env var fails; running it against a fresh
      `0700` temp dir succeeds far enough to create/use the expected layout;
      running it against a world-readable dir fails.
- [x] **m01-02** — `reset-auth.sh` generates owner auth bootstrap material:
      a random one-time password, an Argon2id password hash, a TOTP secret,
      and a TOTP setup URI, storing only non-plaintext runtime auth state
      under `auth/`.
      Verify: script output contains a password and otpauth URI; data files
      are mode `0600`; no plaintext password appears in files.
- [x] **m01-03** — Add `scripts/generate-deploy-key.sh` entry point that
      creates or rotates the dedicated SSH deploy key under `ssh/` in the
      data root.
      Verify: running it against a fresh `0700` temp dir creates private and
      public key files with private key mode `0600`.
- [x] **m01-04** — Deploy-key script prints operator instructions, including
      the SSH public key to add as a deploy key and where it was stored.
      Verify: script output includes the public key line and does not print
      the private key.
- [ ] **m01-05** — Script idempotency and rotation behaviour are explicit:
      reset auth invalidates old auth bootstrap state; deploy-key generation
      refuses overwrite unless a documented rotate flag is supplied.
      Verify: repeated runs behave as documented and tests cover both
      default refusal and rotate success.
- [ ] **m01-06** — Milestone deliverable check: reset script produces a
      password and TOTP setup URI; key script produces an SSH public key to
      add as a deploy key; README/operator instructions match reality.
      Verify: run both scripts in a fresh temp data root and confirm no
      secrets, auth state, SSH private keys, SQLite DBs, or temp data are
      tracked by git.
