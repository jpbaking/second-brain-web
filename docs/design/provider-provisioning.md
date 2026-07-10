# Design: Declarative Provider Provisioning (milestone 15 — documented, not yet built)

Status: **approved by the principal 2026-07-11, execution deferred.** Do not
start implementation until the principal says go. The gated checklist lives at
`docs/progress/milestones/milestone-15-provider-provisioning.md`.

**Revision 2 (2026-07-11): YAML-only.** The principal does not want to manage
providers via the UI. The YAML file is the *sole* source of provider config;
provider management via the web UI and API is removed (the roadmap milestone-5
CRUD becomes historical). This supersedes revision 1's dual-source
reconciliation design — see "What replaces the milestone-5 UI" below.

**Revision 3 (2026-07-11): document order is meaningful.** UI display order =
YAML document order, and the first enabled entry is the default for new chat
sessions. The `default:` field and its validation are removed — see the
ordering convention under "The YAML file".

## Goal

Provider profiles (Anthropic / OpenAI / OpenAI-compatible) are configured
declaratively before `docker run` — the YAML file is the only way providers
enter the system. The quick start becomes:

```sh
./configure            # interactive: generates SECRETS_KEY, encrypts provider keys
./compose-helper.sh up # boots with providers fully provisioned
```

## Non-goals

- Managing providers at runtime. Changing a provider = edit YAML (via
  `configure` or by hand) + restart the container.
- Supporting plaintext keys anywhere at rest, even transiently. This design
  strengthens the existing hard rule, never relaxes it.
- Multi-file or remote config sources. One local YAML file.

## The YAML file

`providers.yaml` at the repo root (gitignored; `providers.yaml.example` is
committed). Mounted read-only by compose; located by the app via a new env var
`SECOND_BRAIN_WEB_PROVIDERS_FILE` (unset → feature entirely off).

```yaml
providers:
  claude:                      # FIRST entry = the default provider for new chats
    display_name: Claude
    provider: anthropic        # anthropic | openai | openai-compatible
    model: claude-haiku-4-5
    key: v1:mm3aX…             # AES-256-GCM ciphertext ONLY (see crypto)
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

**Ordering convention (revision 3):** document order is meaningful — the
read-only UI lists providers in document order, and the **first enabled entry
is the default** for new chat sessions. There is no `default:` field. This is
an application convention (the YAML spec treats map order as insignificant),
which is fine for a hand-edited local file; it is reliable in code because the
`yaml` package returns a plain JS object and JS preserves string-key insertion
order — provided keys are not integer-like, hence the key pattern below
requires a leading letter. Duplicate map keys are rejected at parse time by
the `yaml` package's defaults.

Field rules:

| Field | Rule |
|---|---|
| map key | Required, stable profile identity, `[a-z][a-z0-9-]*` (leading letter keeps JS insertion order intact) |
| `display_name` | Optional; defaults to the map key |
| `provider` | Required; one of the three known ids |
| `model` | Required |
| `base_url` | Required for `openai-compatible`, optional otherwise |
| `key` | Optional; **must** start with `v1:` (ciphertext). A non-`v1:` value refuses startup with a message pointing at `./configure`. |
| `enabled` | Optional bool, default `true`; a disabled first entry passes the default to the next enabled one |

## Load semantics (YAML is the sole source, boot-time)

No reconciliation is needed — there is only one writer. On every startup,
after migrations and before serving:

1. Parse the file (missing file / unset env / empty `providers:` map → app
   boots with zero providers; chat refuses to start sessions with the existing
   "no enabled provider profile" error). A path that exists but is a directory
   is misconfiguration: log a warning and treat as absent (covers the docker
   bind-mount gotcha below).
2. Validate every entry (rules above). Any violation → refuse startup
   (`setup error:` style, like the secret-permission check) — a silent partial
   import would be worse than a loud failure.
3. **Rebuild the `provider_profiles` table from the YAML** — full replace,
   with the YAML map key as the profile `id`, **inserted in document order**
   (the read path lists in insertion order, so the UI shows the file's order).
   The table survives purely as a derived cache so the existing snapshot/chat
   plumbing (`snapshotFor`, `provider_profile_id` on sessions, captured
   `session_config` events) keeps working unchanged. Because the id is the
   stable YAML key, a session resumed after a restart re-resolves its key
   correctly as long as the entry still exists; a removed entry surfaces as
   the existing "profile not found / cannot be decrypted" error at resume
   time.
4. **The first enabled entry becomes the default** (`is_default`) for new
   chat sessions. No `default:` field, no exactly-one validation — reordering
   the file is how you change the default.
5. If any entry has a `key`, `SECOND_BRAIN_WEB_SECRETS_KEY` must be set, else
   refuse startup.

**One-time migration note for existing deployments:** profiles created via
the old UI (random ids) are wiped by the first YAML rebuild. Re-declare them
in `providers.yaml` (re-entering keys through `configure`); old chat sessions
referencing the random ids will show the existing profile-missing error on
resume, which is acceptable — new sessions are unaffected.

## What replaces the milestone-5 UI

Provider *management* is removed; a minimal read-only surface remains:

- **Remove:** `POST/PUT/DELETE /api/providers*` (create/edit/delete/set-default)
  and the corresponding add/edit forms on the `/providers` page. This deletes
  the only API paths that ever carried plaintext keys over HTTP — a real
  attack-surface reduction, not just simplification.
- **Keep, read-only:** `GET /api/providers` (name, type, model, base URL,
  `key: configured|none`, default flag — note `key_last4` disappears; it
  cannot be derived from ciphertext and `configure` should not persist it) and
  `POST /api/providers/:id/test` (the connectivity Test action is genuinely
  useful and read-only costs nothing).
- The `/providers` page becomes a read-only status list with Test buttons and
  a hint: "Providers are configured in providers.yaml — run ./configure".
  Nav label may drop from the top bar into the vault/settings area if we want
  the density win; decide at build time.
- Milestone-5 tests for the removed endpoints are deleted with the endpoints;
  the store keeps only what the cache rebuild and read paths need.

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
- **No schema migration needed** (revision 2): the full-replace rebuild uses
  the existing `provider_profiles` table with YAML keys as ids. The
  `key_last4` column stops being populated (see read-only UI notes); core
  schema stays at v10.
- Provider CRUD endpoints, their web forms, and their tests are removed;
  `GET /api/providers` + `POST /api/providers/:id/test` remain (read-only).
- README quick start gains the `./configure` step; deployment.md documents the
  YAML for non-compose deploys; backup-restore.md notes that `providers.yaml`
  + `.env` live *outside* the data volume and need their own backup.

## Open decisions (small, decide at build time)

- Whether `configure` also runs the owner `reset-auth` step (probably yes as
  an optional final prompt — it completes the zero-to-working story).
- Where the read-only providers view lives: keep `/providers` in the top nav,
  or fold it into the vault/settings area (frees a nav slot — see the parked
  nav-density TODO).

## Milestone breakdown

See `docs/progress/milestones/milestone-15-provider-provisioning.md` — five
items: encrypt-secret CLI, YAML reconciliation + migration, configure scripts,
compose/docs wiring, deliverable e2e.
