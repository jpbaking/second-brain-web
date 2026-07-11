# Milestone 41: Expanded chat controls

## Tasks

- [x] m41-01: Persist mutable provider and approval settings per chat; expose an authenticated update API. A provider change stops the current SDK session so the next turn rehydrates under the new provider; approval changes apply immediately.
  - Verify: `cd app && npm test --workspace server -- chat-store.test.ts agent-session.test.ts chat-api.test.ts`
- [x] m41-02: Add abort-turn service/API support and replace the processing-state Send action with an Abort action.
  - Verify: `cd app && npm test --workspace server -- agent-session.test.ts chat-api.test.ts && npm run build --workspace web`
- [ ] m41-03: Add persistent pinned chat state, pinned-first/activity-second ordering, and sidebar pin/unpin controls.
  - Verify: `cd app && npm test --workspace server -- migrations.test.ts chat-store.test.ts chat-api.test.ts && npm run build --workspace web`
- [ ] m41-04: Add clear-chat-history APIs and UI choices for deleting all chats or preserving pinned chats; active SDK turns must be stopped before deletion.
  - Verify: `cd app && npm test --workspace server -- chat-store.test.ts chat-api.test.ts && npm run build --workspace web`
- [ ] m41-05: Add keyboard-accessible `/` autocomplete sourced from the existing workflow catalogue; selecting/submitting a match runs that workflow.
  - Verify: `cd app && npm run build --workspace web`
- [ ] m41-06: Run full regression and visually verify the complete chat-control flow in the browser.
  - Verify: `cd app && npm run lint && npm test && npm run build`
