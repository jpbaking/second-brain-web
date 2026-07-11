# Milestone 31 — configure helper revamp

Principal-directed. Revamp `./configure` and the runtime-config layout so that:

1. Invalid input **re-prompts in place** instead of exiting the script.
2. Provider **selection + key are entered first**, then the operator picks a
   model from a **queried list** (with a manual-entry fallback).
3. `configure` **generates** the vault SSH deploy keypair; the **public key is
   shown on the Vault page** to register with the Git host.
4. All runtime config (`.env`, `providers.yaml`, `deploy_key`) lives in a
   gitignored **`.config/`** directory, bind-mounted into the container.

Decisions (from principal): config dir = `.config/`; vault key = generate-only
with the public key surfaced on the Vault page; bash `configure` only for now
(port `configure.ps1` later — backlog).

## Read before working

- `AGENTS-PLAYBOOK.md`
- `configure`, `docker-compose.yaml`, `compose-helper.sh`
- `app/server/src/config.ts`, `app/server/src/vault/config.ts`,
  `app/server/src/vault/routes.ts`, `app/server/src/providers/test.ts`
- `app/web/src/VaultSettings.tsx`

## Checklist

- [ ] **m31-01** Server: honour `SECOND_BRAIN_WEB_SSH_KEY_PATH`. When set and
      the file exists, copy it (and a `.pub` sibling if present) into
      `<dataDir>/ssh/deploy_key` at mode `600` (pub `644`) during data-root
      prep, so the canonical derived path keeps working regardless of the
      mount's owner/mode.
      Verify: `cd app && npm test --workspace server -- ssh-key-import.test.ts`

- [ ] **m31-02** Server: `GET /api/vault/public-key` returns
      `{ publicKey: string | null }` read from `<dataDir>/ssh/deploy_key.pub`
      (never the private key).
      Verify: `cd app && npm test --workspace server -- vault-public-key.test.ts`

- [ ] **m31-03** Web: Vault page shows the deploy public key with a copy
      control and register-with-Git-host guidance when one is present.
      Verify: `cd app && npm run build` then Playwright/headless screenshot of
      `/vault` showing the public-key block.

- [ ] **m31-04** Server: shared `listModels()` in `providers/models.ts`
      (mirrors `test.ts` endpoints/headers, parses model ids per provider) plus
      a thin `cli/list-models.ts` printing ids newline-separated.
      Verify: `cd app && npm test --workspace server -- list-models.test.ts`

- [ ] **m31-05** Rewrite `configure`: retry-in-place validation; provider +
      key first; query models via the `list-models` CLI and pick from the list
      (manual fallback on failure); generate the vault keypair; write `.env`,
      `providers.yaml`, and `deploy_key`(+`.pub`) into `.config/`.
      Verify: `bash -n configure && shellcheck configure` and a scripted
      non-interactive run (stdin-fed) produces the expected `.config/` files in
      a temp `ROOT`.

- [ ] **m31-06** Wire `docker-compose.yaml` (`.config/providers.yaml` mount +
      `.config/deploy_key` mount + `SECOND_BRAIN_WEB_SSH_KEY_PATH`) and
      `.gitignore` (`.config/`).
      Verify: `SECOND_BRAIN_WEB_SECRETS_KEY=x docker compose --env-file /dev/null config`
      shows both mounts + the env var; `git check-ignore .config/providers.yaml`.

- [ ] **m31-07** Docs: update README + `STATUS.md` quick-start to the `.config/`
      flow; add a `BACKLOG.md` note to port `configure.ps1`.
      Verify: `grep -n '.config/' README.md docs/progress/STATUS.md`
