# Milestone 62 — sidebar polish (hover affordances, active state, body search)

Principal direction (2026-07-12): five sidebar improvements.

- [x] m62-01: collapsed sidebar — hovering the logo swaps it for an "Open
      sidebar" affordance (expand icon) while keeping the click-to-open
      behaviour.
      Verify: `cd app && npm run build` then Playwright screenshot of the
      collapsed sidebar with and without hover over the brand button.
- [x] m62-02: New chat and Capture actions get the active (blue-bold) state
      from the current path — Capture active on /capture, New chat active only
      on chat paths.
      Verify: `cd app && npm run build` then Playwright screenshot on /capture
      showing Capture highlighted and New chat not.
- [x] m62-03: chat search matches message bodies, not just titles — server
      search over chat_events (user_message text + assistant text) exposed via
      `GET /api/chat/sessions?q=`, sidebar search box uses it (debounced).
      Verify: `cd app && npm test --workspace server -- chat-store.test.ts`
      (new searchSessions tests green) and `npm run build`.
- [x] m62-04: favourite star only appears on row hover (or focus); already
      favourited rows keep the leading ★ marker.
      Verify: `cd app && npm run build` then Playwright screenshots of a chat
      row idle vs hovered.
- [x] m62-05: hover also reveals a Delete button left of the star; it calls
      `DELETE /api/chat/sessions/:id` and refreshes the list.
      Verify: `cd app && npm run build` then Playwright: hover row, click
      delete, row disappears from the list.
- [ ] m62-06: full check (`cd app && npm run lint && npm test && npm run
      build`), archive checklist, update STATUS/BACKLOG.
