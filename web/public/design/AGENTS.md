# design

## Purpose
The design system itself — everything a consuming site copies verbatim: the token entry point (`styles.css`), the component-class stylesheet (`components.css`), zero-dependency JS behaviors (`components.js`) and charts (`charts.js`), brand SVG assets, and the default favicon set. This folder is framework-agnostic and reusable as-is on any stack.

## Ownership
Owns everything under `design/`. Token values and asset linework define the visual identity; changes here ripple across all components, demos, and consuming sites. Cross-cutting rules (class-first, amber rule, no gradients, favicon standard, chart-palette validation) are owned by the root AGENTS.md.

## Local Contracts
- `styles.css` (tokens) and `components.css` (classes) are the two public stylesheet entry points, linked in that order. Consumers never link individual token files.
- Import order in `styles.css` is load-order-sensitive: `colors.css` → `typography.css` → `spacing.css` → `charts.css`. Do not reorder.
- All tokens are `:root`-scoped custom properties. No component-scoped token overrides in this folder.
- `components.css` sections are numbered (§1–§24) and listed in its header CONTENTS block; the README §5 catalog and CHEATSHEET.md map to those numbers — keep all three in sync.
- `components.js` and `charts.js` are plain classic scripts (no modules, no build step, no dependencies). `components.js` auto-initialises from `data-*` attributes; `charts.js` exposes `window.lwCharts`.
- `--chart-1..5` in `tokens/charts.css` is a validated palette (CVD separation, ≥3:1 contrast on white) — never eyeball-edit; re-validate any change (see the file's header comment).
- Asset URLs inside `components.css` are relative (`assets/…`) so they resolve wherever `design/` is mounted.
- The logo mark structure must be preserved across all variants: rounded blue tile (`#12279E`), white linework, single amber dot (`#D9821F`).
- `assets/favicons/` is the generated default favicon set for the kit's own mark; regenerate with `../scripts/make-favicons.sh` after changing the mark.
- Never add a token without adding a corresponding row/entry to README §8.

## Feature Map
- **Style entry point** — Loads Google Fonts and imports the four token files in order. Start: `styles.css`. Files: `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/charts.css`.
- **Component classes** — Every documented UI class (§1 base … §24 spinner), including the single-function app shell (§23, the url-shortener pattern). Start: `components.css`. Files: (none beyond the file).
- **JS behaviors** — Modal (`data-modal-open/close` on `<dialog class="modal">`), tabs (`[data-tabs]`), date picker (`[data-datepicker]` → `YYYY-MM-DD`), time picker (`[data-timepicker]` → `HH:MM`). Start: `components.js`. Files: (none beyond the file).
- **Charts** — Dependency-free SVG bar/line/donut/sparkline with legends, hover tooltips, and sr-only data tables; colors from `--chart-*` tokens. Start: `charts.js`. Files: `tokens/charts.css`.
- **Color tokens** — Brand, neutrals, on-blue, focus, status dots, success/danger pairs. Start: `tokens/colors.css`.
- **Typography tokens** — Font stacks, size/weight scales, letter-spacing tracks. Start: `tokens/typography.css`.
- **Spacing tokens** — Space scale, radii, borders, shadows, mesh opacities. Start: `tokens/spacing.css`.
- **Chart tokens** — Validated categorical slots, sequential ramp, diverging trio, chart chrome. Start: `tokens/charts.css`.
- **Brand assets** — Logo mark (light/invert), mesh motif (blue/white), default favicon set. Start: `assets/logo-mark.svg`. Files: `assets/logo-mark-invert.svg`, `assets/mesh-blue.svg`, `assets/mesh-white.svg`, `assets/favicons/`.

## Child DOX Index
- (none)
