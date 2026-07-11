# Milestone 40: Stream chat replies live / stop blocking /messages

## Tasks

- [ ] m40-01: Establish sdk-session binding before the turn finishes to allow live fanning of SSE events. Debounce or batch DB inserts to avoid blocking the event loop.
  - Verify: `cd app && npm test --workspace server -- agent-session.test.ts`
- [ ] m40-02: Make the `/messages` handler return `202` asynchronously and not await the entire turn.
  - Verify: `cd app && npm test --workspace server -- chat-api.test.ts`
- [ ] m40-03: Verify dependent flows (tool approvals, compaction) function correctly with async turns.
  - Verify: `cd app && npm test --workspace server -- chat-approvals.test.ts`
  - Verify: `cd app && npm test --workspace server`
