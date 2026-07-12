# Milestone 58: Agent deploy-key Git access

- [ ] **m58-01** — Make agent-launched Git inherit the canonical deploy key
  through the same hardened SSH command used by Save & Sync, with a regression
  test. Verification: `npm test --workspace server -- cline-runner-cwd.test.ts && npm run build --workspace server`.
- [ ] **m58-02** — Run the full project verification gate and archive the
  milestone. Verification: `npm run lint && npm test && npm run build`.
