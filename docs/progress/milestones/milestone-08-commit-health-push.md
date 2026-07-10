# Milestone 08 - Commit, Health, Push Loop

- [x] **m08-01:** Detect changed files after mutating workflows and expose the review state. (Verification: `npm test --workspace server -- vault-review.test.ts`)
- [ ] **m08-02:** Run the vault health check as a required pre-commit gate. (Verification: `npm test --workspace server -- commit-loop.test.ts -t "health gate"`)
- [ ] **m08-03:** Commit healthy vault changes with an auditable generated message. (Verification: `npm test --workspace server -- commit-loop.test.ts -t "commits"`)
- [ ] **m08-04:** Push the new commit through the configured deploy key and branch. (Verification: `npm test --workspace server -- commit-loop.test.ts -t "pushes"`)
- [ ] **m08-05:** Surface health, commit, push, and lock failures with recovery-safe UI state. (Verification: `npm test --workspace server -- commit-loop.test.ts -t "failure" && npm run lint --workspace web && npm run build --workspace web`)
- [ ] **m08-06:** Deliverable check: healthy changes commit+push; unhealthy changes remain local. (Verification: `npm test --workspace server -- commit-loop.test.ts && npm run lint && npm run build`)
