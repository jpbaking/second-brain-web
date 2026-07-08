# Security Policy

Second Brain Web is intended for self-hosted, single-user deployments that operate on private knowledge vaults. Treat the application host and runtime volume as sensitive.

## Public Repository Rules

Do not commit:

- Runtime data directories.
- Private vault clones or mounted vault content.
- SSH private keys or deploy keys.
- Provider API keys or OAuth tokens.
- Password hashes, TOTP seeds, recovery material, or session secrets.
- SQLite databases, WAL files, SHM files, or session stores.
- Uploaded files, generated reports, or derived private indexes.
- Logs containing prompts, file paths, personal data, or tool output.

## Deployment Baseline

- Keep app authentication mandatory on every private route.
- Use password plus TOTP for the single owner account.
- Generate and reset credentials only through host-level scripts.
- Keep secrets in the runtime data volume with restrictive filesystem permissions.
- Use a dedicated SSH deploy key for the configured second-brain vault repository.
- Prefer Cloudflare Access or another outer access layer for public exposure, but never rely on it instead of app authentication.
- Put the app behind a reverse proxy with HTTPS.
- Back up runtime data deliberately, including SQLite WAL/SHM files when the app is running.

## Reporting Issues

Please do not include private vault content, secrets, logs, or screenshots containing personal information in public issues. Use a minimal reproduction or a redacted description whenever possible.
