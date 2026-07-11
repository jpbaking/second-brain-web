# BACKLOG — the only queue of future work

Nothing here is in progress. **Do not start an item without the principal
saying go.** When the principal picks one, create a milestone checklist for it
in `docs/progress/milestones/` (numbered after the last archived milestone)
and follow AGENTS-PLAYBOOK.md. Completed checklists move to
`docs/progress/milestones/archive/`.

## Gated (designed, waiting for "go")

- **Milestone 15 — declarative provider provisioning (YAML-only).**
  Design: `docs/design/provider-provisioning.md` (revision 3).
  Checklist already written: `docs/progress/milestones/milestone-15-provider-provisioning.md`.
  Summary: `providers.yaml` (pre-encrypted keys, first entry = default) is the
  sole provider source; provider CRUD UI/API removed (read-only view + Test
  stays); interactive `configure` / `configure.ps1` scripts.

## Improvements (small/medium, self-contained)

- **Slim the Docker image (~1.28GB).** The runtime `npm ci --omit=dev`
  installs the web workspace's deps (react etc.) that are dead weight at
  runtime. Install only the server workspace's prod deps instead.
- **Strip inline `— source: [label](path)` markdown from follow-up display
  text.** Cosmetic; the parser deliberately preserves raw text and the
  resolved link is already shown separately as `→ linkedSource`.
- **Run the production app under a dedicated system user.** Global
  `~/.cline/skills` and rules paths merge into agent sessions; a dedicated
  user isolates them. (Container deployments already isolate this.)

## Larger features (from the phase-008 backlog — need principal scoping)

See `docs/project-plan/phase-008-feature-backlog-and-design-hooks.md` for the
full list. Highlights: automatic context compaction triggers, source-coverage
view, scheduled briefs, semantic search (embeddings), meeting-prep mode,
voice capture, rich diff review, backup/restore UI.

## Dropped / resolved (kept for the record)

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
