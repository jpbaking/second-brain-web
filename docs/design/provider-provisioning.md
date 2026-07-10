# Design: Declarative Provider Provisioning (milestone 15 — documented, not yet built)

Status: **approved by the principal 2026-07-11, execution deferred.** Do not
start implementation until the principal says go. The gated checklist lives at
`docs/progress/milestones/milestone-15-provider-provisioning.md`.

## Goal

Provider profiles (Anthropic / OpenAI / OpenAI-compatible) can be pre-set
*before* `docker run`, so a fresh deployment is fully usable without touching
the `/providers` UI. The quick start becomes:

```sh
./configure            # interactive: generates SECRETS_KEY, encrypts provider keys
./compose-helper.sh up # boots with providers already provisioned
```

## Non-goals

- Replacing the `/providers` UI — it remains fully functional for ad-hoc
  profiles and for editing.
- Supporting plaintext keys anywhere at rest, even transiently. This design
  strengthens the existing hard rule, never relaxes it.
- Multi-file or remote config sources. One local YAML file.

## The YAML file

`providers.yaml` at the repo root (gitignored; `providers.yaml.example` is
committed). Mounted read-only by compose; located by the app via a new env var
`SECOND_BRAIN_WEB_PROVIDERS_FILE` (unset → feature entirely off).

```yaml
providers:
  claude:                      # map key = stable config key, [a-z0-9-]+
    display_name: Claude
    provider: anthropic        # anthropic | openai | openai-compatible
    model: claude-haiku-4-5
    key: v1:mm3aX…             # AES-256-GCM ciphertext ONLY (see crypto)
    default: true
  openai:
    display_name: OpenAI
    provider: openai
    model: gpt-5.2
    key: v1:9hQz…
  lm-studio:
    display_name: LM Studio
    provider: openai-compatible
    base_url: http://host.docker.internal:1234/v1
    model: ornith-1.0-9b       # keyless is fine for openai-compatible
```

Field rules:

| Field | Rule |
|---|---|
| map key | Required, stable identity for reconciliation, `[a-z0-9-]+` |
| `display_name` | Optional; defaults to the map key |
| `provider` | Required; one of the three known ids |
| `model` | Required |
| `base_url` | Required for `openai-compatible`, optional otherwise |
| `key` | Optional; **must** start with `v1:` (ciphertext). A non-`v1:` value refuses startup with a message pointing at `./configure`. |
| `default` | Optional bool; more than one `true` refuses startup |
| `enabled` | Optional bool, default `true` |

## Reconciliation semantics (declarative, boot-time)

On every startup, after migrations and before serving:

1. Parse the file (missing file / unset env / empty `providers:` map → no-op).
   A path that exists but is a directory is treated as misconfiguration: log a
   warning and skip (this covers the docker bind-mount gotcha below).
2. Validate every entry (rules above). Any violation → refuse startup
   (`setup error:` style, like the secret-permission check), because a silent
   partial import would be worse than a loud failure.
3. **Upsert by config key.** YAML-managed profiles are marked as such (new
   nullable-unique `config_key` column on `provider_profiles`, core migration
   v11). Re-running is idempotent; UI edits to a YAML-managed profile are
   overwritten on the next boot — that is the declarative contract and must be
   stated in the UI copy for such profiles ("managed by providers.yaml").
4. Profiles whose `config_key` no longer appears in the YAML are **disabled,
   not deleted** — chat sessions reference `provider_profile_id` for key
   re-resolution on resume, so deletion could strand resumable sessions.
   Deleting a disabled ex-YAML profile stays a manual UI action.
5. `default: true` sets `is_default` (clearing any other default). No YAML
   default → existing default untouched.
6. If any YAML entry has a `key`, `SECOND_BRAIN_WEB_SECRETS_KEY` must be set,
   else refuse startup.

UI-created profiles (no `config_key`) are never touched by reconciliation.

## Crypto: one implementation, thin wrappers

The ciphertext format and KDF are exactly `app/server/src/secrets/crypto.ts`
(scrypt over `SECOND_BRAIN_WEB_SECRETS_KEY`, salt `second-brain-web/secrets/v1`,
AES-256-GCM, `v1:nonce:tag:ciphertext`). **Do not reimplement this in shell.**

New CLI, sibling of `reset-auth`: `app/server/src/cli/encrypt-secret.ts` →
`server/dist/cli/encrypt-secret.js`.

- Reads the plaintext from **stdin** (never argv — keeps keys out of shell
  history and `ps`), requires `SECOND_BRAIN_WEB_SECRETS_KEY` in the env,
  prints the `v1:` ciphertext to stdout. Exit non-zero with an actionable
  message when the env key is missing/empty.
- Also usable in-container: `docker run --rm -i -e SECOND_BRAIN_WEB_SECRETS_KEY=…
  second-brain-web node server/dist/cli/encrypt-secret.js` — so docker-only
  users need no local Node.

**Key-binding caveat (document everywhere):** ciphertext is bound to the exact
`SECOND_BRAIN_WEB_SECRETS_KEY`. Rotating the key invalidates every `key:` in
the YAML; `configure` must offer a re-encrypt flow (re-prompt for plaintext
keys) when the user rotates.

## The `configure` scripts

Two thin interactive wrappers at the repo root (the "run-it" layer):
`configure` (bash) and `configure.ps1` (PowerShell). Both:

1. **Secrets key:** if `.env` already has a non-empty
   `SECOND_BRAIN_WEB_SECRETS_KEY`, reuse it (offer rotation with a loud
   warning about re-encryption). Otherwise generate one
   (`openssl rand -base64 32` / `RandomNumberGenerator` + Base64) and write
   `.env` (mode 600 on POSIX).
2. **Provider loop:** for each provider the user wants: prompt for config key,
   display name, type, model, base URL (when applicable), and API key with a
   **silent** prompt (`read -s` / `Read-Host -AsSecureString`) — never echoed,
   never written to a temp file. Pipe the plaintext straight into the
   `encrypt-secret` CLI and capture only the ciphertext.
3. **Emit `providers.yaml`** (always, even with an empty `providers: {}` map —
   see the compose gotcha) and print a summary plus the next command
   (`./compose-helper.sh up`).

CLI resolution order for `encrypt-secret`: local `app/server/dist` (if built) →
`docker run` against the `second-brain-web` image (build it if absent, with
consent) → actionable error.

## Compose integration

`docker-compose.yaml` gains:

```yaml
    volumes:
      - sbw-data:/data
      - ./providers.yaml:/config/providers.yaml:ro
    environment:
      SECOND_BRAIN_WEB_PROVIDERS_FILE: /config/providers.yaml
```

**Gotcha:** a bind mount whose host source is missing makes Docker create an
empty *directory* at that path. Mitigations: `configure` always writes the
file, `providers.yaml.example` documents it, and the server's
directory-not-file check (reconciliation step 1) degrades to a warning instead
of a crash.

## Security invariants (unchanged, restated)

- Plaintext provider keys never at rest: enforced by stdin-only CLI intake,
  silent prompts, and the startup refusal of non-`v1:` YAML keys.
- `providers.yaml` is gitignored (ciphertext is useless without the env key,
  but the file still names endpoints/models and is deployment state, not
  source).
- Keys encrypted only with `SECOND_BRAIN_WEB_SECRETS_KEY` (master-plan hard
  rule) — the CLI reuses `secrets/crypto.ts`, no second derivation path.

## Dependencies / repo changes

- Add the zero-dependency `yaml` npm package to the server workspace (no YAML
  parser exists today). JSON was considered and rejected: hand-editability is
  the point.
- Core DB migration v11: `ALTER TABLE provider_profiles ADD COLUMN config_key
  TEXT UNIQUE` (nullable). Bump the schema-version assertions in
  `migrations.test.ts` / `status.test.ts` (currently v10).
- README quick start gains the `./configure` step; deployment.md documents the
  YAML for non-compose deploys; backup-restore.md notes that `providers.yaml`
  + `.env` live *outside* the data volume and need their own backup.

## Open decisions (small, decide at build time)

- Whether `configure` also runs the owner `reset-auth` step (probably yes as
  an optional final prompt — it completes the zero-to-working story).
- Whether the `/providers` UI should hard-block edits to YAML-managed profiles
  or allow them with a "will be overwritten on restart" banner (banner is
  cheaper; blocking is safer UX).

## Milestone breakdown

See `docs/progress/milestones/milestone-15-provider-provisioning.md` — five
items: encrypt-secret CLI, YAML reconciliation + migration, configure scripts,
compose/docs wiring, deliverable e2e.
