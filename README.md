# Second Brain Web

Second Brain Web is a planned self-hosted, single-user web application for operating a private file-based second brain through an AI executive assistant.

The app is designed to run separately from the actual second-brain vault. At deployment time it will clone or mount the private vault into local runtime storage, authenticate the owner with password plus TOTP, stream assistant sessions through the browser, and keep generated reports behind app authentication.

## Project Status

This repository is currently in early scaffold implementation.

**Implementation agents: start at [AGENTS-PLAYBOOK.md](AGENTS-PLAYBOOK.md).**
It routes you to the current state in `docs/progress/` and the parts of the
plan that matter right now. The full design pack:

- [Project master plan](docs/project-plan/master-plan.md)
- [Implementation roadmap](docs/project-plan/phase-006-implementation-roadmap.md)
- [Security, auth, and secrets](docs/project-plan/phase-002-security-auth-and-secrets.md)

## Local Scaffold

Requirements:

- Node.js 22 or newer.
- A private local data directory. It must not be readable by group or other
  users.

Install and run the current scaffold:

```sh
npm install
npm run build
install -d -m 700 /tmp/second-brain-web-data
SECOND_BRAIN_WEB_DATA_DIR=/tmp/second-brain-web-data npm start
```

Then open `http://127.0.0.1:8722/` or check the setup JSON directly:

```sh
curl http://127.0.0.1:8722/api/status
```

For development, use the same data-dir environment variable with
`npm run dev`; Vite serves the browser app and proxies `/api` to the server.

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
