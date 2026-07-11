# Milestone 45: Weak-model system prompt

## Tasks

- [ ] m45-01: Replace the one-line fallback with a structured, tested operating prompt for weaker models with at least 64K context; keep vault `.clinerules` authoritative and avoid redundant prompt bloat.
  - Verify: `cd app && npm test --workspace server -- agent-session.test.ts && npm run lint && npm run build`
- [ ] m45-02: Run full regression, rebuild the container, and verify the enhanced prompt reaches the runner.
  - Verify: `cd app && npm test` and `./compose-helper.sh rebuild`
