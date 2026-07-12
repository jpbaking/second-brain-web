# BACKLOG — the only queue of future work

Nothing here is in progress. **Do not start an item without the principal
saying go.** When the principal picks one, create a milestone checklist for it
in `docs/progress/milestones/` (numbered after the last archived milestone)
and follow AGENTS-PLAYBOOK.md. Completed checklists move to
`docs/progress/milestones/archive/`.

## Larger features (from the phase-008 backlog — need principal scoping)

See `docs/project-plan/phase-008-feature-backlog-and-design-hooks.md` for other larger features.

## Improvements

- Deterministic e2e for the chat processing indicator. The current e2e login
  spec (`test/e2e/login.spec.ts`) fails against the fresh in-process harness
  because the onboarding gate ("No providers configured") intercepts the chat
  welcome — it predates the gate and does not stub `/api/providers` (the vault
  spec does). Seed a provider in `global-setup.ts` (or stub it) and add a
  scripted-runner spec that drives send → asserts `.chat-processing` shows,
  then a scripted `ended` hides it and folds cumulative chunks without
  duplication. Verified live for now via a throwaway container-driven spec.

## Nice-to-have (do not pick up automatically)

- Voice capture
- Semantic search (embeddings)

## Completed (one line each; evidence in `milestones/archive/` and the journal)

- ~~Footer fits one viewport, no forced scroll~~ — milestone 70.
- ~~Copyright footer on all non-chat pages (incl. login/setup)~~ — milestone 69.
- ~~Explorer hover download icon + raw download endpoint~~ — milestone 68.
- ~~Amber "Secretary" author label in chat~~ — milestone 67.
- ~~Explorer revamp: read-only vault file browser~~ — milestone 66.
- ~~Gemini-inspired collapsible sidebar and chat search~~ — milestone 61.
- ~~Consistent branded heroes across non-chat pages~~ — milestone 60.
- ~~Workflow slash-autocomplete UX and fresh-chat execution~~ — milestone 59.
- ~~Give chat-side Git access to the deploy key~~ — milestone 58.
- ~~Space table copy control away from its header~~ — milestone 57.
- ~~Copy raw Markdown from assistant messages~~ — milestone 56.
- ~~Table copy in the expanded preview modal~~ — milestone 55.
- ~~Excel-compatible Markdown table copy~~ — milestone 54.
- ~~Chat-scoped file upload (attachments)~~ — milestone 49.
- ~~Web search tools (SearXNG + MCP)~~ — milestone 48.
- ~~Mermaid support~~ — milestone 47.
- ~~Markdown messages~~ — milestone 46.
- ~~Weak-model system prompt~~ — milestone 45.
- ~~General-purpose agent container toolkit~~ — milestone 44.
- ~~Browser-local chat timestamps~~ — milestone 43.
- ~~Durable reasoning transcript~~ — milestone 42.
- ~~Expanded chat controls~~ — milestone 41.
- ~~Stream chat replies live; non-blocking `/messages`~~ — milestone 40
  (root-cause notes preserved in the journal archive, 2026-07-11).
- ~~Agent cwd = vault, not `/app`~~ — milestone 39 (`enterVaultCwd()` in
  `cline-runner.ts`; investigation notes in the journal archive).
- ~~Regenerate Report + provenance~~ — milestone 37.
- ~~Claude Code subscription provider~~ — milestone 36.
- ~~Layout/theme compliance across feature screens~~ — milestone 35.
- ~~`configure.ps1` parity + model picker~~ — milestone 32 (Windows smoke-test
  remains the principal's to run).
- ~~Onboarding/state checks on login~~ — milestone 30.
- ~~Rich diff review~~ — milestone 28.
- ~~Principal Profile~~ — milestone 27.
- ~~Scheduled Briefs~~ — milestone 26.
- ~~Backup/Restore UI~~ — milestone 25.
- ~~Meeting Prep Mode~~ — milestone 24.
- ~~Automatic context compaction~~ — milestone 22.
- ~~Dedicated system user for bare-metal~~ — milestone 21.
- ~~Strip source-link markdown from follow-ups~~ — milestone 20.
- ~~Slim Docker image~~ — milestone 19.
- ~~Native `gemini` provider~~ — milestone 18.
- ~~Encrypt TOTP secret at rest~~ — milestone 17.
- ~~Declarative provider provisioning (YAML-only)~~ — milestone 15.
- ~~`reset-auth` revokes active sessions~~ — milestone 2 (already built).
- ~~SDK artifacts under data dir (`CLINE_DATA_DIR`)~~ — milestone 5A.
- ~~`spike/test-vault/` cleanup~~ — milestone 14.
- ~~Top-nav density~~ — milestone 16 sidebar shell.
