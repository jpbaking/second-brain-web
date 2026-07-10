# Milestone 15 - Declarative Provider Provisioning (GATED — do not start)

> ⛔ **Documented only. The principal approved the design (2026-07-11) but
> directed "document first; don't execute yet." Do not begin `m15-01` until
> the principal explicitly says go.** Design: [provider-provisioning.md](../../design/provider-provisioning.md).

Pre-set provider profiles before `docker run`: a gitignored `providers.yaml`
(keys pre-encrypted, `v1:` ciphertext only) mounted read-only by compose and
reconciled into `provider_profiles` at startup, plus interactive `configure`
(bash) / `configure.ps1` scripts that generate `SECOND_BRAIN_WEB_SECRETS_KEY`
and encrypt keys immediately via a server CLI — plaintext never at rest.

- [ ] **m15-01:** Add the `encrypt-secret` server CLI (stdin plaintext → `v1:` ciphertext via `secrets/crypto.ts`; requires `SECOND_BRAIN_WEB_SECRETS_KEY`; actionable error otherwise). (Verification: `cd app && npm test --workspace server -- encrypt-secret.test.ts`, plus a round-trip: CLI output decrypts with `decryptSecret`)
- [ ] **m15-02:** Startup reconciliation of `SECOND_BRAIN_WEB_PROVIDERS_FILE`: core migration v11 (`config_key` column), upsert by config key, disable-on-removal, single-default enforcement, refuse non-`v1:` keys and other invalid entries, no-op on missing/empty/directory path. Add the `yaml` package. (Verification: `cd app && npm test --workspace server -- provider-provisioning.test.ts` + full suite green with bumped schema assertions)
- [ ] **m15-03:** Interactive `configure` (bash) + `configure.ps1` at the repo root: secrets-key generate/reuse/rotate (rotation warns about re-encryption), silent key prompts piped straight to the CLI, emits `.env` (0600) + `providers.yaml` (always, even empty). (Verification: scripted non-interactive run produces a valid `.env` + `providers.yaml` whose ciphertext decrypts; `bash -n` / `pwsh -NoProfile -Command "…"` syntax checks)
- [ ] **m15-04:** Wire compose (`providers.yaml` ro-mount + `SECOND_BRAIN_WEB_PROVIDERS_FILE`), gitignore `providers.yaml`, commit `providers.yaml.example`, update README quick start (`./configure` step), deployment.md, and backup-restore.md (YAML + `.env` live outside the volume). (Verification: `grep` checks + `./compose-helper.sh rebuild` boots healthy with and without the file present)
- [ ] **m15-05:** Deliverable check: `./configure` (scripted) → `./compose-helper.sh up` → `/api/providers` lists the YAML profiles with masked keys, the default is set, a keyed profile's snapshot decrypts, and plaintext appears nowhere on disk at any point. (Verification: `cd app && npm run lint && npm test && npm run build` plus the compose e2e exercised for real)
