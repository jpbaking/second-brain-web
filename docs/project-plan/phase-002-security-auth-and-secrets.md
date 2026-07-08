# Phase 002 - Security, Auth, And Secrets

## Security Posture

The app holds sensitive personal, people, project, interview, performance, and
career data. Its security model should be small, boring, and host-controlled.

One app instance has one owner. There is no concept of a second web user.

## Authentication Model

- Username: fixed `owner`, or no username field at all.
- Factor 1: password.
- Factor 2: TOTP from an authenticator app.
- Reset path: host shell only.
- Browser reset path: none.
- Recovery email: none.

## First Run

If no auth state exists, the app should refuse normal web access and direct the
operator to run:

```bash
./scripts/reset-auth.sh
```

The script should:

1. Generate a strong random password.
2. Generate a TOTP secret.
3. Print the initial password once.
4. Print an `otpauth://` URI and, if dependencies allow, a terminal QR code.
5. Store only the password hash and TOTP secret.
6. Invalidate any existing sessions.

The first-run script may write a bootstrap output file with `0600` permissions
if terminal output alone is inconvenient. Prefer terminal output.

## Password Storage

- Use Argon2id.
- Store hash, salt, memory/time/parallelism parameters, created date, and
  changed date.
- Never store plaintext password.
- Never log attempted passwords.

## TOTP Storage

For MVP:

- Store the TOTP secret server-side in the app data directory with restrictive
  permissions.
- Keep it out of source control.

Hardened option:

- Encrypt the TOTP secret using an app secret supplied by environment variable
  or host secret store.

The app should allow the reset script to rotate the TOTP secret.

## Sessions

Use server-side sessions stored in SQLite:

- Random session ID.
- Hashed session token if storing a browser token reference.
- Created timestamp.
- Last used timestamp.
- Expiry timestamp.
- User agent and IP metadata for audit only.
- Revoked timestamp.

Cookie requirements:

- `HttpOnly`
- `Secure` in production
- `SameSite=Lax` or `Strict`
- Reasonable expiry, for example 12-24 hours

## Login Flow

1. User submits password.
2. Server verifies password hash.
3. If password is valid, server creates a short-lived pending challenge.
4. User submits TOTP.
5. Server verifies TOTP with a small allowed clock skew.
6. Server creates a full session.
7. Pending challenge is destroyed.

Rate-limit both password and TOTP failures.

## Rate Limiting

MVP can store failure counters in SQLite:

- Per IP.
- Per owner account.
- Exponential delay or temporary lock after repeated failures.
- Log only metadata, never secrets.

Because this is self-hosted, fail closed but avoid permanent web lockout. The
host reset script is the recovery path.

## Re-Authentication Gates

Require recent authentication, or re-enter password + TOTP, for:

- Rotating auth credentials.
- Rotating deploy key.
- Changing vault git remote.
- Approving destructive shell/git operations.
- Force pushing or conflict recovery.

## SSH Deploy Key

Use a dedicated key for the vault repo:

- Algorithm: `ed25519`.
- Scope: one key per vault repository.
- Permissions: GitHub deploy key with write access.
- Storage: app data root, not source.
- File mode: private key `0600`, containing directory `0700`.
- Never send private key to browser.

Suggested files:

```text
/data/second-brain-web/ssh/
  second_brain_ed25519
  second_brain_ed25519.pub
```

The app should run git with an explicit SSH command:

```bash
GIT_SSH_COMMAND="ssh -i /data/second-brain-web/ssh/second_brain_ed25519 -o IdentitiesOnly=yes"
```

## Secret Inventory

Secrets:

- Owner password hash parameters and hash.
- TOTP secret.
- Session signing secret.
- SSH private key.
- Model/API provider keys.
- Optional provider OAuth refresh tokens if a future connector uses them.

Non-secrets:

- SSH public key.
- Vault git URL, unless the operator considers repository names sensitive.
- Provider IDs, model IDs, base URLs, and display names.
- Report metadata.
- Chat titles.

## Provider API Keys

MVP should use bring-your-own API keys rather than provider OAuth. This keeps the
self-hosted setup simple and avoids becoming an OAuth app operator.

Rules:

- API keys are entered through authenticated settings or host-level config.
- API keys are stored server-side only.
- API keys are never sent back to the browser after save.
- API keys are never written to chat transcripts, app logs, git, or vault files.
- The UI may show key presence, provider name, and a masked suffix if useful.
- Rotating a provider key should invalidate active agent sessions using that
  provider.

Required storage:

- Encrypt provider keys at rest with the dedicated
  `SECOND_BRAIN_WEB_SECRETS_KEY`. This is the only key-encryption option: do
  not reuse `SECOND_BRAIN_WEB_SESSION_SECRET`, which has a different purpose
  and rotation schedule.
- If `SECOND_BRAIN_WEB_SECRETS_KEY` is not configured, the app refuses to
  store provider keys and directs the operator to set it, rather than falling
  back to weaker storage.

## Provider Web Authentication

Provider-native OAuth or web account linking can be considered later for
providers that support it cleanly through the SDK. It is not required for MVP.

If added later:

- OAuth tokens must be stored as secrets.
- Scopes must be minimal.
- Token refresh failures should degrade to a clear "reconnect provider" state.
- OAuth setup must remain optional; API-key and local-provider paths should
  continue to work.

## Filesystem Permissions

The app should check at startup:

- Data directory exists.
- Sensitive directories are not world-readable.
- SSH private key permissions are acceptable to `ssh`.
- Auth state is readable only by the app user.

Startup should fail loudly if secret permissions are unsafe.

## Audit Log

Maintain an app-level audit log separate from `memory/log.md`:

- Login success/failure metadata.
- Auth reset.
- Deploy key generation/rotation.
- Vault clone/pull/push.
- Agent session started/ended.
- Tool approvals.
- Report viewed/downloaded if useful.

Do not write sensitive content into audit logs.
