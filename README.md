# Second Brain Web

Second Brain Web is a self-hosted, single-user web application for operating a private file-based second brain through an AI executive assistant.

The app runs separately from the actual second-brain vault. At deployment time it clones the private vault into local runtime storage, authenticates the owner with password plus TOTP, streams assistant sessions through the browser, and keeps generated reports behind app authentication.

## Project Status

The implementation roadmap (milestones 0–12) is complete: auth, vault
clone/health, provider profiles, Cline SDK chat with tool approvals, quick
capture and uploads, commit/push, reports, follow-ups, search, explorer, and
production hardening. Ongoing work is principal-directed.

**Implementation agents: start at [AGENTS-PLAYBOOK.md](AGENTS-PLAYBOOK.md).**
It routes you to the current state in `docs/progress/` and the parts of the
plan that matter right now. The full design pack:

- [Project master plan](docs/project-plan/master-plan.md)
- [Implementation roadmap](docs/project-plan/phase-006-implementation-roadmap.md)
- [Security, auth, and secrets](docs/project-plan/phase-002-security-auth-and-secrets.md)

## Quick Start (Docker)

The primary way to build and run locally is
[compose-helper](https://github.com/jpbaking/compose-helper), a thin
`docker compose` wrapper that is committed to this repo. With Docker installed:

```sh
./configure                 # PowerShell: ./configure.ps1
./compose-helper.sh up      # build the image, start it, follow logs
```

`configure` is an interactive menu-driven tool (a Node CLI shipped in the app;
`./configure` runs it with local Node when the app is built, otherwise via the
Docker image). It **loads and edits** your config in the gitignored `.config/`
directory rather than overwriting it — nothing is clobbered:

- `.config/.env` — the secrets key and compose settings (bind address, port,
  environment). Unknown keys you added by hand are preserved.
- `.config/providers.yaml` — provider profiles, API keys stored only as
  ciphertext. Add a provider (pick provider → enter key → choose a model from
  the list it reports, `f` to filter a long list), or per existing provider
  **rename / change model / change key / delete**. Untouched providers keep
  their existing key.
- `.config/deploy_key` — a generated vault SSH deploy key (needs `ssh-keygen`);
  its public half is printed and also shown on the Vault page to register with
  your Git host.

Choose **save** to write changes, or **quit** to discard them. Restart the app
to apply; the first enabled provider entry is the default.

Then create the owner credentials (password plus TOTP) and open
`http://localhost:8722/`:

```sh
./compose-helper.sh reset-auth
```

Day-to-day commands:

```sh
./compose-helper.sh stop     # stop — the data volume is kept
./compose-helper.sh rebuild  # rebuild the image and start again
./compose-helper.sh logs     # follow logs
./compose-helper.sh down     # stop AND delete the data volume (clean slate)
```

App data lives on the `sbw-data` named volume. Runtime config (secrets key,
provider profiles, vault deploy key) lives in the gitignored `.config/`
directory that `configure` produces and compose bind-mounts; settings for the
helper itself go in `compose-helper.env`. `configure` must run before the first
`up`, or the bind mounts have no files to point at. Login works on
`http://localhost` and behind HTTPS; on a
plain-HTTP LAN address the `Secure` auth cookies are dropped by the browser, so
front the app with a TLS-terminating proxy (e.g. nginx-proxy-manager) — see
[docs/deploy/deployment.md](docs/deploy/deployment.md).

## Development (hot reload)

Requirements: Node.js 22 or newer. All app source lives under `app/` (the npm
workspace root); docs and compose files stay at the repo root.

```sh
cd app
npm install
install -d -m 700 /tmp/second-brain-web-data
SECOND_BRAIN_WEB_DATA_DIR=/tmp/second-brain-web-data npm run dev
```

Vite serves the browser app on `SECOND_BRAIN_WEB_PORT` (default 8722) and
proxies `/api` to the API server, which dev mode runs on port + 1 — so the dev
URL matches production. To front the dev server with a TLS proxy, bind it and
allow your public hostname:

```sh
SECOND_BRAIN_WEB_DATA_DIR=/tmp/second-brain-web-data \
SECOND_BRAIN_WEB_HOST=0.0.0.0 \
SECOND_BRAIN_WEB_DEV_ALLOWED_HOSTS=assistant.example.com \
npm run dev
```

For a production run without Docker, do not launch the app from your login
account: global Cline skills and rules from that account would merge into agent
sessions. Follow the dedicated-user systemd procedure in
[the deployment guide](docs/deploy/deployment.md#bare-metal-production-with-systemd).

## Host Bootstrap (without Docker)

When running bare-metal, generate the owner credentials and the vault deploy key
from the host shell. Both scripts read `SECOND_BRAIN_WEB_DATA_DIR`, refuse a data
root that other users can reach, and need the server to be built first
(`npm run build`). (Under Docker, use the `docker exec` form from the quick
start instead.)

Owner authentication (password plus TOTP):

```sh
SECOND_BRAIN_WEB_DATA_DIR=/data/second-brain-web app/scripts/reset-auth.sh
```

It prints a one-time password and an `otpauth://` setup URI once — record the
password and add the URI to your authenticator app. The Argon2id password hash
and TOTP secret encrypted with `SECOND_BRAIN_WEB_SECRETS_KEY` are written to
`auth/owner.json` (mode 600). The command refuses to write without that key.
Re-running it replaces the credentials and invalidates the old ones.

Vault SSH deploy key:

```sh
SECOND_BRAIN_WEB_DATA_DIR=/data/second-brain-web app/scripts/generate-deploy-key.sh
```

It creates an ed25519 key under `ssh/` (private key mode 600, never printed) and
prints the public key to add as a deploy key — with write access — on your
vault's Git host. It refuses to overwrite an existing key; pass `--rotate` to
replace one (which invalidates the old key).

## Core Direction

- Self-hosted and single-user only.
- Password plus TOTP authentication, generated or reset from the host shell.
- App authentication required for every private route, even behind Cloudflare Access or another proxy.
- Runtime-local clone of the owner's private second-brain git repository.
- Dedicated SSH deploy key for vault git access.
- Cline SDK based agent runtime, with provider/model profiles.
- SSE-first streaming for chat and agent events.
- SQLite for owner/session/runtime metadata, with WAL mode and backup-aware operations.
- Responsive desktop and mobile UI from the first implementation pass.
- Styling based on `jpbaking/lazyway-io-design`.

## Public Repo Boundary

This public repository should contain application source, documentation, examples, and non-sensitive fixtures only.

Never commit:

- Runtime data under `/data` or equivalent deployment volumes.
- Private second-brain vault checkouts.
- SSH deploy keys.
- Provider API keys.
- Password hashes or TOTP secrets.
- SQLite databases, WAL files, or session stores.
- Uploaded source files.
- Generated private reports.
- Logs that may contain prompts, file names, secrets, or personal content.

See [SECURITY.md](SECURITY.md) for the security baseline.

## Licence

This project is licensed under the [Zero-Clause BSD licence](LICENSE).
