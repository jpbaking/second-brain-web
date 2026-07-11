# BACKLOG — the only queue of future work

Nothing here is in progress. **Do not start an item without the principal
saying go.** When the principal picks one, create a milestone checklist for it
in `docs/progress/milestones/` (numbered after the last archived milestone)
and follow AGENTS-PLAYBOOK.md. Completed checklists move to
`docs/progress/milestones/archive/`.

## Larger features (from the phase-008 backlog — need principal scoping)

See `docs/project-plan/phase-008-feature-backlog-and-design-hooks.md` for the
view and rich diff review.

## Nice-to-have (do not pick up automatically)

- Voice capture
- Semantic search (embeddings)

## Dropped / resolved (kept for the record)

- ~~Principal Profile~~ — completed in milestone 27. Added persistent settings area for principal-directed preferences like report styles, timezone, and work week configuration.
- ~~Scheduled Briefs~~ — completed in milestone 26. Added background `SchedulerService`, `scheduled_jobs` SQLite table, `/api/schedules` CRUD endpoint, and `SchedulesScreen` UI.
- ~~Backup/Restore UI~~ — completed in milestone 25. Added `/api/backup/core` and `/api/backup/sidecar` to serve database snapshots, and created a dedicated `BackupScreen` in the UI to download them safely.
- ~~Meeting Prep Mode~~ — completed in milestone 24. Added `/api/chat/workflows/prep` and a dedicated frontend screen to kick off parameterized workflow sessions.
- ~~Automatic context compaction triggers~~ — completed in milestone 22. Triggers 
  compaction based on character count threshold at the end of agent turns.
- ~~Declarative provider provisioning (YAML-only)~~ — completed in milestone 15.
  `providers.yaml` (pre-encrypted keys) is the sole provider source; CRUD
  removed (read-only + Test stays); `configure`/`configure.ps1` scripts;
  compose bind-mount.
- ~~Run bare-metal production under a dedicated system user~~ — completed in
  milestone 21 with a validated, home-isolated systemd unit and documented
  install/bootstrap/upgrade flow. Containers remain isolated by `USER node`.
- ~~Strip inline source-link Markdown from follow-up display text~~ — completed
  in milestone 20. Raw parser/API text remains canonical; the UI shows clean
  text and the resolved source separately.
- ~~Slim the Docker image by excluding web runtime dependencies~~ — completed
  in milestone 19. The server-scoped install excludes React/ReactDOM and saves
  8 MiB uncompressed (Docker display 1.28 GB → 1.27 GB; compressed image size
  283,660,007 → 282,335,443 bytes). Cline's production tree remains dominant.
- ~~Expose the native `gemini` provider~~ — completed in milestone 18: SDK
  mapping, provider API, connectivity Test action, and settings selector.
- ~~Encrypt the TOTP secret at rest~~ — completed in milestone 17. New owner
  state is encrypted with `SECOND_BRAIN_WEB_SECRETS_KEY`; legacy plaintext
  state migrates safely on first authenticated read.
- ~~`reset-auth` should also revoke active DB sessions~~ — already implemented
  in milestone 2: the CLI calls `invalidateSessionsAndChallenges`, which
  revokes every active DB session and deletes pending login challenges.
- ~~SDK session artifacts under `~/.cline/data/sessions/`~~ — resolved in
  milestone 5A: `CLINE_DATA_DIR` points at `<dataDir>/sessions`.
- ~~`spike/test-vault/` cleanup note~~ — `spike/` was deleted in milestone 14.
- ~~Top-nav density~~ — resolved by the milestone 16 sidebar shell.
