# Phase 007 - Deployment, Operations, And Threat Model

## Deployment Shape

The app should be deployable as a private self-hosted service:

- Single container plus mounted data volume, or direct Node process.
- Reverse proxy terminates HTTPS. Intended deployments include local Nginx
  Proxy Manager and public Cloudflare Tunnel with Cloudflare Access rules.
- No public signup.
- One owner.
- One configured vault.

## Required Host Dependencies

- Node.js 22+ if not containerised.
- Git.
- OpenSSH client.
- Python 3 for vault `scripts/health.py`.
- Optional Chrome/Chromium for PDF export through vault script.

## Environment Variables

Suggested:

- `SECOND_BRAIN_WEB_DATA_DIR`
- `SECOND_BRAIN_WEB_BASE_URL`
- `SECOND_BRAIN_WEB_COOKIE_SECURE`
- `SECOND_BRAIN_WEB_SESSION_SECRET`
- `SECOND_BRAIN_WEB_LOG_LEVEL`
- `SECOND_BRAIN_WEB_SECRETS_KEY` — required before provider keys can be
  stored; the only key-encryption secret (never reuse the session secret).
- Provider/model variables required by Cline SDK configuration.

Do not require secrets to be committed to source files.

## Backup Strategy

Back up:

- App data directory, excluding rebuildable indexes if desired.
- Auth state.
- SSH private key.
- Provider API keys and optional OAuth tokens.
- SQLite app database.
- Vault git remote, which is the primary backup for vault contents.

Because the vault is pushed to git, the most critical local-only state is auth,
SSH key, session/app DB, and any unpushed working tree changes.

SQLite backup requirements:

- Account for WAL mode files: `*.sqlite`, `*.sqlite-wal`, and `*.sqlite-shm`.
- Prefer an application-provided backup command that checkpoints or uses
  SQLite's online backup API rather than copying a hot database blindly.
- Rebuildable sidecar indexes may be excluded if the restore path explicitly
  rebuilds them.
- Core app DB tables must be backed up with auth/session metadata, provider
  profile metadata, approval history, report metadata, and session metadata.

## Restore Strategy

1. Restore app data directory.
2. Start app.
3. Verify auth works.
4. Verify SSH key still matches GitHub deploy key.
5. Verify vault checkout or reclone from remote.
6. Rebuild derived indexes.
7. Run SQLite integrity checks and migrations.

If auth state is lost, run host reset script. If SSH key is lost, rotate deploy
key in GitHub.

## SQLite Runtime Requirements

- Enable WAL mode for the app database.
- Enable foreign keys for every SQLite connection.
- Keep write transactions short.
- Use explicit migrations and track schema versions.
- Run `PRAGMA integrity_check` or an equivalent startup integrity check on a
  safe cadence.
- Keep core app state separate from rebuildable indexes so damaged or stale
  indexes can be dropped and rebuilt.
- Avoid placing the SQLite database on network filesystems unless the deployment
  has verified SQLite-safe locking semantics.
- Use application-level write locks for vault mutations; do not rely on SQLite
  locking as the vault concurrency model.

## Observability

Minimum logs:

- Startup config summary without secrets.
- Auth setup state.
- Login success/failure metadata.
- Vault clone/pull/push operations.
- Agent session lifecycle.
- Tool approvals.
- Approval preset changes.
- SSE disconnect/reconnect summaries.
- Context compaction events.
- Health check summaries.
- Index rebuild status.

Avoid logging:

- Passwords.
- TOTP secrets or codes.
- SSH private key material.
- Provider API keys or token values.
- Full chat content unless explicitly configured.
- Sensitive report contents.

## Public Surface Allowlist

Unauthenticated routes should be explicit and minimal:

- Login page.
- Missing setup/reset instruction page.
- Static design assets under `/design/`.
- Favicons and non-sensitive static app assets.

Everything else requires app auth, even when Cloudflare Access also protects the
public hostname: command center, chat, SSE streams, uploads, reports, search,
settings, provider config, vault status, and all API routes.

## Threat Model

### Attacker: Internet Scanner

Risk:

- Brute force login.
- Exploit exposed app.

Mitigations:

- HTTPS.
- Password + TOTP.
- Rate limiting.
- No signup.
- Keep dependencies updated.
- Put behind VPN or private network when possible.

### Attacker: Compromised Browser Session

Risk:

- View vault/report data.
- Approve agent actions.

Mitigations:

- HttpOnly cookies.
- SameSite cookies.
- Session expiry.
- Re-auth for sensitive actions.
- Logout invalidates session server-side.

### Attacker: Compromised Host

Risk:

- Read vault checkout.
- Read SSH private key.
- Read TOTP secret.
- Read provider API keys.

Mitigations:

- Least-privilege deploy key scoped to one repo.
- File permissions.
- Encrypt provider keys at rest when possible.
- Prefer provider keys with usage limits and revocation.
- Host hardening.
- Disk encryption where appropriate.
- Key rotation procedure.

### Failure: Provider Misconfiguration

Risk:

- Agent fails to start.
- Local LM Studio endpoint is unreachable from container.
- Wrong model used for sensitive task.
- Unexpected provider costs.

Mitigations:

- Provider test action before saving as default.
- Store provider/model snapshot per session.
- Show active provider/model in chat header.
- Track token/cost usage when SDK events provide it.
- Allow disabling a provider profile without deleting its audit history.

### Attacker: Malicious Uploaded File

Risk:

- Agent/tool parser exploit.
- HTML/script content later served as report.

Mitigations:

- Store uploads in `inbox/`, not executable paths.
- Avoid automatic execution of uploaded files.
- Keep report serving authenticated.
- Consider content security policy for report routes, balanced against offline
  report templates.

### Attacker: Prompt Injection In Uploaded Content

Risk:

- Uploaded docs instruct agent to leak secrets or modify vault incorrectly.

Mitigations:

- Strong agent system/vault rules.
- Tool approvals.
- Library original immutability.
- Health checks.
- Git diff review for sensitive operations.

### Failure: Approval Preset Too Permissive

Risk:

- Agent performs a write, shell, network, or git operation the principal did not
  intend to allow.

Mitigations:

- Conservative default: normal secretary.
- Always-visible active preset.
- Re-auth for changing into high-trust local if desired.
- Never allow destructive shell, credential access, auth/key changes, force
  push, or external network without explicit approval.
- Log preset changes and approval decisions.

### Failure: Agent Makes Bad Vault Edits

Risk:

- Misfiled facts.
- Broken indexes.
- Incorrect report.

Mitigations:

- Git history.
- Health check.
- Report/vault diff review.
- Single-writer lock.
- Keep originals immutable.

## Operational Commands

Expected host commands:

```bash
./scripts/reset-auth.sh
./scripts/generate-deploy-key.sh
./scripts/check-config.sh
./scripts/backup.sh
./scripts/restore.sh <backup>
```

Exact scripts can evolve during implementation. The important property is that
auth reset and key rotation are host-level operations, not web routes.

## Production Defaults

- Bind to localhost by default unless configured.
- Require explicit base URL in production.
- Refuse insecure cookies when `NODE_ENV=production` unless override is set.
- Fail startup if data directory permissions are unsafe.
- Keep indexes rebuildable and noncritical.
- Prefer explicit operator action for destructive recovery.
- Use SSE-first realtime with heartbeats and reconnect support.
- Keep app auth mandatory even when Cloudflare Access is also protecting the
  public hostname.
