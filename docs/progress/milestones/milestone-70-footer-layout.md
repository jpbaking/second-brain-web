# Milestone 70 — footer without forced scroll

Principal-directed 2026-07-12: the m69 footer adds height beyond the kit's
100vh `.app-page`, so even short pages scroll. Fit page + footer inside one
viewport (footer at the bottom, no scroll unless content needs it), and make
sure /capture shows the footer.

- [ ] **m70-01** Flex-column the footer's containers (`.shell-content`
  non-chat, and a wrapper for /login + /setup) so `.app-page` flexes and the
  footer sits at the viewport bottom without overflow; assert in e2e that
  /explorer, /capture and /login have no vertical page scroll and the footer
  is in view; screenshots.
  Verify: `cd app && npm run lint && npm run build && npx playwright test`
