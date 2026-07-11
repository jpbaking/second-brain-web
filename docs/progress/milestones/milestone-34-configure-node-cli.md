# Milestone 34 — rewrite configure as a Node in-app CLI

Principal-directed. The shell `configure`/`configure.ps1` rewrite `providers.yaml`
and `.config/.env` from scratch each run. Replace them with a single interactive
**Node** CLI in the app that loads existing config, edits it in place, and saves —
so nothing is clobbered and every value is offered as a default.

Decisions (principal): Node (not Python), reusing the app's `yaml`,
`encryptSecret`, and `listModels`; preserve unknown `.env` keys and untouched
providers by value (not comments); root `configure`/`configure.ps1` become thin
node-or-docker launchers.

## Requirements

- Load `.config/.env` (preserve unknown keys) and `.config/providers.yaml`.
- Main menu: list providers, and per provider **keep / rename / change model /
  change API key / delete**; plus add-provider, runtime settings (BIND/PORT/
  NODE_ENV), deploy-key (generate/rotate/keep), secrets-key (keep/rotate).
- Existing values are the defaults everywhere; write only on explicit save.
- Model picker keeps the substring filter; API keys encrypted via `encryptSecret`.
- Untouched providers keep their existing ciphertext (no needless re-encrypt).

## Read before working

- `configure`, `configure.ps1` (behaviour to preserve, then retire the logic)
- `app/server/src/providers/provisioning.ts` (YAML shape, KNOWN_PROVIDERS,
  PROFILE_FIELDS, id regex, `v1:` key rule)
- `app/server/src/secrets/crypto.ts` (`encryptSecret(plaintext, env)`)
- `app/server/src/providers/models.ts` (`listModels`)

## Checklist

- [ ] **m34-01** Pure core module `app/server/src/cli/configure-lib.ts`:
      `.env` parse/serialise preserving unknown keys + key order; providers
      object <-> YAML via `yaml`; slug; provider/id/port validation; runtime
      defaults. Unit-tested.
      Verify: `cd app && npm test --workspace server -- configure-lib.test.ts`

- [ ] **m34-02** Interactive `app/server/src/cli/configure.ts` (Node
      `readline/promises`): load → main menu → provider add/edit/delete/keep,
      runtime settings, deploy key (ssh-keygen, graceful skip if absent),
      secrets key → save. Config dir from `SBW_CONFIG_DIR`. Imports
      `encryptSecret`/`listModels`; untouched providers keep ciphertext.
      Verify: `cd app && npm run build` then scripted-stdin runs against a temp
      `SBW_CONFIG_DIR` — (a) edit one provider's model + delete another +
      preserve an unknown `.env` key; (b) add a provider with model filter;
      assert the resulting `.env`/`providers.yaml`.

- [ ] **m34-03** Retire the shell logic: `configure` (bash) and `configure.ps1`
      become thin launchers that run `node …/dist/cli/configure.js` when Node is
      present, else `docker run -it -u <uid> -v ./.config:/config … configure.js`,
      passing `SBW_CONFIG_DIR`.
      Verify: `bash -n configure`; a launcher run dispatches to the built tool
      and writes `.config/`; ps1 parity review.

- [ ] **m34-04** Docs: update README + `STATUS.md` for the Node configurator
      (still invoked as `./configure`); note ssh-keygen requirement for key
      generation.
      Verify: `grep -n 'configure' README.md`.
