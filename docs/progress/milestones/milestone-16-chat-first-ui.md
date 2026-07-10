# Milestone 16 - Chat-First UI (principal-directed)

Directed by the principal (2026-07-11): the landing page is the last active
chat (or a new-chat state when there is no history), and the UI/navigation is
revamped to mimic the Claude/ChatGPT/Gemini web apps — a left sidebar with a
New chat button, recent chats, and the other screens as secondary nav; the
conversation fills the main pane with a bottom composer.

- [x] **m16-01:** Bump `chat_sessions.updated_at` on every appended event so "last active" ordering stays correct for live sessions. (Verification: `cd app && npm test --workspace server -- chat-store.test.ts -t "updated"` or equivalent new test: appending an event to an older session moves it to the top of `listSessions`)
- [x] **m16-02:** Sidebar shell + routing: left sidebar (brand, New chat, recent chats, secondary nav, sign out), persistent ≥1024px, off-canvas drawer with a top hamburger bar below; `/` and `/chat[/:id|/new]` route to the chat surface; command centre moves to `/command-centre`; old top/bottom navs removed. (Verification: `cd app && npm run lint --workspace web && npm run build --workspace web` + responsive visual at 390/1280 incl. drawer open/close)
- [x] **m16-03:** Chat-first ChatScreen: auto mode opens the most recent chat (URL rewritten to `/chat/:id`) or the new-chat state; new-chat state creates the session on first send (title derived from the message) then streams; conversation bubbles fill the pane with a sticky bottom composer; workflows/compact/lock/approvals preserved; sidebar recents refresh on creation. (Verification: web lint/build + browser check of both landing behaviours)
- [ ] **m16-04:** Deliverable check: landing shows the last active chat; with an empty history it shows the new-chat state; sending from the new-chat state creates + streams a session and the sidebar updates; other screens render correctly inside the shell. (Verification: `cd app && npm run lint && npm test && npm run build` plus a headless-Chrome e2e of the above at 390 and 1280)
