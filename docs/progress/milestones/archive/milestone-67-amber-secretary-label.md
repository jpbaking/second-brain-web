# Milestone 67 — amber "Secretary" author label in chat

Principal-directed 2026-07-12: the "Secretary" author label above assistant
messages should be amber (kit token `--accent-amber`), not muted grey.

- [x] **m67-01** Colour `.chat-msg-author` with `var(--accent-amber, #b45309)`
  (the class is only used for the Secretary label).
  Verify: `cd app && npm run lint && npm run build`; screenshot of a chat
  showing the amber label.
