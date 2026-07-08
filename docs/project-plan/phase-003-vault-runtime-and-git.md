# Phase 003 - Vault Runtime And Git

## Purpose

The app manages a local runtime checkout of the Second Brain vault. The checkout
is where the agent works. Git is the durability and audit boundary.

## Runtime Layout

Recommended data layout:

```text
/data/second-brain-web/
  auth/
    owner.json
  db/
    app.sqlite
    app.sqlite-wal
    app.sqlite-shm
  secrets/
    provider-keys.enc
  ssh/
    second_brain_ed25519
    second_brain_ed25519.pub
  workspaces/
    second-brain/
  indexes/
    vault.sqlite
  logs/
  sessions/
```

The app source tree should not contain the checked-out vault in production.
`db/app.sqlite` is core app state. `indexes/vault.sqlite` is rebuildable cache
state derived from the vault checkout.

## Vault Configuration

Store vault config in core SQLite app state, with optional host-readable export
for diagnostics:

- Vault ID: `default`
- Display name
- Git remote URL
- Branch
- Workspace path
- SSH key path
- Last known commit
- Last pull timestamp
- Last health-check result

MVP supports one vault.

## Clone Flow

1. Confirm SSH key exists.
2. Confirm git remote is configured.
3. If workspace path is empty, run `git clone`.
4. If workspace exists, verify it is a git repository.
5. Verify expected remote.
6. Pull or fetch current branch.
7. Run vault detection checks.

Vault detection checks:

- `README.md` exists.
- `.clinerules/00-role.md` exists.
- `.clinerules/10-structure.md` exists.
- `memory/index.md` exists.
- `library/catalog.md` exists.
- `scripts/health.py` exists.

## Pull Before Work

Before a write-oriented workflow:

1. Acquire single-writer lock.
2. Check working tree status.
3. If clean, pull latest remote branch.
4. If dirty from an interrupted previous session, show recovery state.
5. Start the agent after the workspace is known.

Read-only recall workflows may skip pull if recent enough, but the UI should
show staleness.

## Single-Writer Lock

MVP should allow many chat sessions but only one active vault writer.

Lock state should include:

- Lock ID
- Session ID
- Owner operation
- Started timestamp
- Last heartbeat

Write operations include:

- Ingesting inbox
- Remembering chat facts
- Meeting capture
- Report generation
- Reindex
- Checkup fixes
- Any agent file edit

When uncertain whether an operation writes, take the write lock.

## Git Commit Strategy

Recommended MVP strategy: commit after each completed mutating workflow.

Commit message format:

```text
vault: <workflow> - <short subject>
```

Examples:

- `vault: ingest - process uploaded project notes`
- `vault: report - generate weekly portfolio review`
- `vault: chat-capture - record project status updates`

The app should include session metadata in commit body, not sensitive chat
content.

## Push Strategy

Default:

- Push after a successful commit and health check.

If health check reports issues:

- Keep commit local or leave changes uncommitted depending on implementation.
- Surface the health result.
- Ask for approval before pushing anyway.

Avoid force push in normal operation.

## Working Tree Recovery

If the app starts and finds a dirty vault checkout:

1. Do not discard changes.
2. Show changed files.
3. Allow continuing the same session if metadata exists.
4. Allow manual commit after health check.
5. Allow host-level recovery for advanced cases.

Never run destructive git reset automatically.

## Health Check

Run:

```bash
python3 scripts/health.py
```

After:

- Inbox processing
- Memory capture workflows
- Report generation
- Reindex
- Before push, when feasible

Parse output into:

- Raw text
- Issue count if detectable
- Sections
- Timestamp

Remember that the current health script always exits 0, so the app must inspect
output text rather than relying on process exit alone.

## Report Serving

Serve files under:

- `reports/**/*.html`
- `reports/**/*.pdf`
- `reports/**/*.md`

Rules:

- Only after auth.
- Use path normalisation to prevent path traversal.
- Set conservative response headers.
- HTML reports are trusted only because the principal/agent generated them;
  still serve them from authenticated routes.

## Library Original Protection

The app UI should not provide direct edit controls for `library/` originals.
Uploads go to `inbox/`; the agent moves originals to `library/` through vault
workflow rules.

The backend can add an extra guard that refuses non-catalog writes under
`library/`, but agent/tool integration details may decide where best to enforce
this.
