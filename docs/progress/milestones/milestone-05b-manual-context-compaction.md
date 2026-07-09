# Milestone 5B — Manual Context Compaction

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 5B.

Deliverable: Long-running sessions can be manually compacted without losing task state, pending approvals, vault status, or unfiled facts.

Deferred post-MVP: automatic compaction triggers based on token/context pressure or transcript size. Design the summary format and timeline events so the automatic trigger bolts on without rework.

- [x] **m5b-01** — Compaction data model: Update `chat_sessions` schema to support storing a `compaction_summary` text and `compacted_at` timestamp. Add `compaction` to the valid `chat_events` types.
      Verify: `npm test --workspace server -- chat-store.test.ts` includes checks for updating and retrieving compaction state.
- [x] **m5b-02** — Compaction request handler: Implement the backend logic for `POST /api/chat/sessions/:id/compact` to instruct the agent to generate a summary of the current working context (preserving task state, unfiled facts, pending approvals, etc.).
      Verify: `npm test --workspace server -- chat-api.test.ts` verifies the compaction intent is accepted and routed to the agent session.
- [ ] **m5b-03** — Compaction event persistence: Process the agent's summary response, persist it to the session record, and append a `compaction` event to the `chat_events` timeline to be broadcast via SSE.
      Verify: `npm test --workspace server -- agent-session.test.ts` verifies the summary is stored and the timeline event is dispatched.
- [ ] **m5b-04** — Rehydration path: Update `AgentSessionService` resume logic to rehydrate a session using the `compaction_summary` as the foundation, truncating or omitting the prior messages from the prompt.
      Verify: `npm test --workspace server -- agent-session.test.ts` proves that a restarted session builds its `initialMessages` from the compaction summary when available.
- [ ] **m5b-05** — Chat web UI: Add a "Compact Context" button to the ChatScreen interface. Render `compaction` events in the transcript as a visual break or system notice.
      Verify: `npm run lint` and `npm run build` pass for the web workspace. Headless render check confirms the button and event display.
- [ ] **m5b-06** — Deliverable check: End-to-end verification. Create a session, converse to build context, manually trigger compaction, verify the summary is saved and rendered, restart the server, and verify the agent resumes using the summarized context.
      Verify: Live run with evidence in the journal; full lint/test/build pass.
