# Phase 009 - Design System

## Required Kit

Use `jpbaking/lazyway-io-design` as the visual and component foundation for the
web app:

<https://github.com/jpbaking/lazyway-io-design>

The kit is portable and stack-agnostic. Its GitHub README describes tokens,
ready-made CSS component classes, zero-dependency behaviours, charts, demos,
favicon tooling, and React/Astro starters. A copy of the lazyway kit also exists
inside the current Second Brain repo under `reports/design/lazyway/`, but the
implementation should verify the latest upstream kit before scaffolding.

## Product Fit

The Second Brain web app is a private operational tool, not a consumer landing
page. Use the kit in its dashboard/docs/tool modes:

- Command center: dashboard shape.
- Chat: app/tool shell plus dense operational panels.
- Follow-up queue: dashboard table/list shape.
- Reports: prose/document shape.
- Settings: forms, alerts, data lists, tabs.
- Provider/model configuration: form and table components.
- Memory explorer: chart/card/table components when it ships.

## Non-Negotiable Visual Rules

Follow the kit rules:

- Use `design/styles.css` and `design/components.css` as public stylesheet entry
  points, loaded in that order.
- Prefer documented classes over custom CSS.
- If custom CSS is unavoidable, use kit CSS variables only.
- Do not hardcode colours, pixel sizes, radii, or shadows in app CSS.
- Use white or solid brand-blue backgrounds. No gradients.
- Use one amber accent per page. Status badges and chart series do not count.
- Use IBM Plex Sans for headings/body and IBM Plex Mono uppercase for labels.
- Do not use mono uppercase for body copy.
- Keep radii modest and avoid pill-shaped controls unless the kit defines them.
- Include the required favicon links on every page.
- Keep copy plain and understated; use British/Commonwealth spelling for
  app-authored prose.

## Implementation Shape

Recommended for a Next/React app:

1. Copy the kit's `design/` folder into `public/design/`.
2. Copy or generate favicon files into `public/`.
3. Link the stylesheets globally in the root layout:

```html
<link rel="stylesheet" href="/design/styles.css">
<link rel="stylesheet" href="/design/components.css">
```

4. Copy the kit's React components into the app when useful.
5. Use the kit's chart wrapper/helpers for charts.
6. Do not load `components.js` in React if React components own the behaviours.
7. Load `charts.js` only on screens that need charts, or through the kit's React
   chart component pattern.

## Required Screen Treatment

### Login

Use a compact action-card style. Keep text minimal:

- Password field.
- TOTP field.
- Submit button.
- Setup/reset instruction if auth state is missing.

Do not build a marketing hero for login.

### Command Center

Use dashboard components:

- Stat tiles for inbox, overdue, waiting-on, health, dirty state.
- Cards for recent reports and active sessions.
- Tables/lists for follow-up queue preview.
- Alerts for health failures, dirty checkout, or missing provider config.

### Chat

Use a calm workbench layout:

- Session list.
- Main message stream.
- Right or collapsible side panel for vault status, provider/model, approvals,
  and changed files.
- Mobile should collapse panels behind tabs or segmented navigation.

### Quick Capture

Use a single-function tool shape:

- Textarea.
- Optional capture type selector.
- Submit button.
- Filing status/result block.

This must be excellent on phone.

### Reports

Use prose/document components:

- Report shelf list.
- Report reader with `.prose`.
- Metadata/data-list panel.
- Download/export actions.

### Settings

Use forms, tabs, alerts, data lists, and tables:

- Auth status.
- Vault git remote and branch.
- SSH deploy key status.
- Provider/model profiles.
- Data directory and backup status.

## Accessibility And Responsiveness

The design must work at phone and desktop sizes from MVP.

Requirements:

- Touch targets are comfortable on mobile.
- Tables have responsive wrappers or list alternatives.
- Chat input remains reachable on small screens.
- Report text is readable without horizontal scrolling.
- Approval dialogs work on mobile.
- Keyboard focus states use kit focus tokens.
- Colour is not the only status indicator.

## Design Review Checklist

Before considering an MVP screen done:

- It uses lazyway styles and components.
- It has no arbitrary hardcoded colours or spacing.
- It respects the one-amber rule.
- It works on phone and desktop.
- Text does not overflow controls.
- The active provider/model and vault state are visible where relevant.
- Sensitive/destructive actions are visually distinct but not theatrical.
- The screen serves the work directly; no marketing filler.

