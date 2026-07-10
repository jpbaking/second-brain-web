# Milestone 15 - Declarative Provider Provisioning (GATED — do not start)

> ⛔ **Documented only. The principal approved the design (2026-07-11) but
> directed "document first; don't execute yet." Do not begin `m15-01` until
> the principal explicitly says go.** Design: [provider-provisioning.md](../../design/provider-provisioning.md)
> — **revision 2 (YAML-only)**: the principal does not want to manage providers
> via the UI, so the YAML is the sole source and provider CRUD is removed.

Pre-set provider profiles before `docker run`: a gitignored `providers.yaml`
(keys pre-encrypted, `v1:` ciphertext only) mounted read-only by compose and
loaded as the sole provider source at startup (full-replace rebuild of the
`provider_profiles` cache; YAML map key = profile id; no schema migration),
plus interactive `configure` (bash) / `configure.ps1` scripts that generate
`SECOND_BRAIN_WEB_SECRETS_KEY` and encrypt keys immediately via a server CLI —
plaintext never at rest, and no API path carries plaintext keys anymore.

- [ ] **m15-01:** Add the `encrypt-secret` server CLI (stdin plaintext → `v1:` ciphertext via `secrets/crypto.ts`; requires `SECOND_BRAIN_WEB_SECRETS_KEY`; actionable error otherwise). (Verification: `cd app && npm test --workspace server -- encrypt-secret.test.ts`, plus a round-trip: CLI output decrypts with `decryptSecret`)
- [ ] **m15-02:** Boot-time YAML load as the sole provider source: parse/validate `SECOND_BRAIN_WEB_PROVIDERS_FILE` (keys `[a-z][a-z0-9-]*`), refuse non-`v1:` keys and invalid entries, full-replace rebuild of `provider_profiles` with YAML keys as ids **in document order**, first enabled entry = default (no `default:` field), tolerate missing/empty/directory path. Add the `yaml` package. (Verification: `cd app && npm test --workspace server -- provider-provisioning.test.ts` — incl. an ordering test: list order matches document order and reordering flips the default — + full suite green)
- [ ] **m15-03:** Retire provider management: remove create/edit/delete/set-default endpoints, their web forms, and their tests; `GET /api/providers` (with `key: configured|none`, no `key_last4`) and `POST /api/providers/:id/test` remain; `/providers` becomes a read-only list with Test buttons and a "configured in providers.yaml — run ./configure" hint. (Verification: `cd app && npm test` green after removals; mutating provider routes return 404; web lint/build + visual check of the read-only page)
- [ ] **m15-04:** Interactive `configure` (bash) + `configure.ps1` at the repo root: secrets-key generate/reuse/rotate (rotation warns about re-encryption), silent key prompts piped straight to the CLI, emits `.env` (0600) + `providers.yaml` (always, even empty). (Verification: scripted non-interactive run produces a valid `.env` + `providers.yaml` whose ciphertext decrypts; `bash -n` / `pwsh -NoProfile` syntax checks)
- [ ] **m15-05:** Wire compose (`providers.yaml` ro-mount + `SECOND_BRAIN_WEB_PROVIDERS_FILE`), gitignore `providers.yaml`, commit `providers.yaml.example`, update README quick start (`./configure` step), deployment.md, and backup-restore.md (YAML + `.env` live outside the volume). (Verification: `grep` checks + `./compose-helper.sh rebuild` boots healthy with and without the file present)
- [ ] **m15-06:** Deliverable check: `./configure` (scripted) → `./compose-helper.sh up` → read-only `/providers` lists the YAML profiles with the default set, Test works against a reachable endpoint, a keyed profile's snapshot decrypts for a chat session, and plaintext appears nowhere on disk at any point. (Verification: `cd app && npm run lint && npm test && npm run build` plus the compose e2e exercised for real)
