# Milestone 4A — Responsive App Shell

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 4A;
`docs/project-plan/phase-001-product-and-scope.md` (mobile is not a reduced
product); `docs/project-plan/phase-009-design-system.md` (lazyway classes).

Deliverable: core workflows are navigable and usable on phone and desktop
before deeper features are added.

Binding constraints:
- Use the vendored lazyway design-kit classes and tokens only; no bespoke
  theming. App copy uses plain, understated British spelling.
- The page body must never scroll horizontally at mobile width; wide content
  scrolls inside its own container.
- Login and the setup status page stay outside the authenticated shell.
- The web workspace has no unit-test runner — verify with `npm run build` and
  headless Chrome loads/screenshots (desktop + 390×844 mobile).

- [x] **m4a-01** — Client route table + stub screens: a small router replaces
      the ad-hoc pathname checks, with routes for command centre (`/`), chat
      (`/chat`), follow-up queue (`/follow-ups`), reports (`/reports`), and
      vault settings (`/vault`); unbuilt screens render a clear lazyway-styled
      "coming in a later milestone" stub.
      Verify: `npm run build`; headless loads of `/chat`, `/follow-ups`,
      `/reports` each render their stub heading (dump-dom check).
- [x] **m4a-02** — App shell with desktop navigation: an `AppShell` wraps the
      authenticated screens with a persistent nav (command centre, chat,
      follow-ups, reports, vault settings) using kit classes, with an
      active-route highlight; login/setup are not wrapped.
      Verify: headless load at 1280×800 shows the nav with all items and the
      active item highlighted; desktop screenshot captured.
- [x] **m4a-03** — Mobile navigation: below a breakpoint the shell shows a
      touch-friendly mobile nav (bottom bar or drawer) for the same screens; the
      desktop nav is hidden on mobile and vice versa.
      Verify: headless load at 390×844 shows the mobile nav and no desktop
      sidebar; mobile screenshot captured; no horizontal body scroll.
- [x] **m4a-04** — Responsive content layouts: command centre, vault settings,
      and the stubs lay out cleanly at mobile and desktop widths (readable
      spacing, wide content scrolls within its container, touch-friendly
      controls).
      Verify: headless at 390 and 1280 for `/`, `/vault`, `/reports` —
      `document.documentElement.scrollWidth <= innerWidth` at 390 on each.
- [x] **m4a-05** — Milestone deliverable check: the core screens are navigable
      and usable on phone and desktop.
      Verify: authenticated headless run — from `/`, navigate to each core
      screen at both 390×844 and 1280×800, capturing screenshots; `npm run lint
      && npm test && npm run build` pass.
