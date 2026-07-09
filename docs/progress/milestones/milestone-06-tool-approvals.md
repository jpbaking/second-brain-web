# Milestone 6 — Tool Approvals And Write Lock

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 6.

Deliverable:
- Owner can choose an approval preset for a session.
- Mutating sessions cannot concurrently edit the vault.
- Tool requests are visible and approvable.
- Owner can review changed files and health output before commit/push.

- [x] **m06-01** — Approval presets data model: Define the three presets (`read-only`, `normal`, `high-trust`). Update `chat_sessions` schema (core migration) to store the selected `approval_preset` (defaulting to `normal`).
      Verify: `npm test --workspace server` verifies the preset is stored and retrieved on session creation.
- [x] **m06-02** — Tool policy preset enforcement: Update `tool-policy.ts` to enforce presets. `read-only` denies all mutating tools; `normal` asks for mutating tools (except catalog edits which are allowed per current rules? Or requires asking per preset rules); `high-trust` allows mutating tools without asking.
      Verify: `npm test --workspace server` verifies tool policy correctly allows/denies/asks based on the session's preset.
- [x] **m06-03** — Preset selection UI: Update the web `/chat` New Chat form to include a preset selector.
      Verify: `npm run lint` and `npm run build` pass. Headless render check confirms the preset selector is present.
- [x] **m06-04** — Session write lock integration: A chat session must acquire the `vault_lock` before starting a mutating tool, and maintain the heartbeat while running. Refuse execution and surface a lock error if another session holds the lock. Release the lock when the session goes idle or is closed.
      Verify: `npm test --workspace server` proves concurrent mutating sessions are prevented and locks are managed correctly.
- [x] **m06-05** — Lock status UI: Update the AppShell or ChatScreen to visually indicate if the current session holds the write lock, or if it is blocked by another session.
      Verify: `npm run lint` and `npm run build` pass.
- [ ] **m06-06** — Review-before-commit backend: Implement an endpoint `GET /api/vault/review` that aggregates `readGitStatus` (changed files, diff summary) and `runHealthCheck` output into a single review object.
      Verify: `npm test --workspace server` proves the review payload is correctly aggregated.
- [ ] **m06-07** — Explicit commit/push action: Implement a mutating endpoint `POST /api/vault/commit` that commits the current dirty state with a generated message and pushes to the configured remote.
      Verify: `npm test --workspace server` proves the commit and push operations succeed and clear the dirty state.
- [ ] **m06-08** — Review & Commit UI: Add a "Review & Commit" interface accessible from the Chat or Command Center when the vault is dirty, displaying the review summary and a Confirm button to trigger the commit/push.
      Verify: `npm run lint` and `npm run build` pass.
- [ ] **m06-09** — Deliverable check: End-to-end verification. Create sessions with different presets, verify lock behaviour, and perform a mutating workflow culminating in a review and commit.
      Verify: Live run with evidence in the journal; full lint/test/build pass.
