# Milestone 64 — new-chat landing + brand links to command centre

Principal direction (2026-07-12): login should land on the new-chat state
(no auto-open of the last active chat), and the expanded-sidebar logo+title
should navigate to /command-centre (collapsed logo keeps its open-sidebar
role).

- [x] m64-01: `/` renders the new-chat state; remove the auto-open-last-chat
      landing mode.
      Verify: `cd app && npm run build` then Playwright probe: log in with
      existing chats and assert the new-chat welcome shows and the URL stays
      off /chat/<id>.
- [ ] m64-02: expanded sidebar brand (logo + "Second Brain") is a link to
      /command-centre; collapsed brand stays the open-sidebar button.
      Verify: Playwright probe: click brand → URL /command-centre; collapse,
      click brand → sidebar expands (no navigation). Screenshots.
- [ ] m64-03: full check (`cd app && npm run lint && npm test && npm run
      build`), remove probe, archive checklist, update STATUS.
