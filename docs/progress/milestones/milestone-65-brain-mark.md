# Milestone 65 — brain logo mark + favicons

Principal direction (2026-07-12): replace the radio-tower brand mark with a
"brain" mark across logo and favicons. Keep the design-kit language: blue
tile (#12279E), white line work, amber accent (#D9821F), invert variant.

- [x] m65-01: design the brain mark and update the SVG assets
      (`design/assets/logo-mark.svg`, `logo-mark-invert.svg`,
      `/favicon.svg`, `design/assets/favicons/favicon.svg`).
      Verify: `cd app && npm run build` + Playwright screenshots of the
      sidebar brand, hero, and welcome screen showing the new mark.
- [ ] m65-02: regenerate raster favicons (favicon.ico, icon-192/512,
      apple-touch-icon) from the new mark; set the webmanifest name to
      Second Brain.
      Verify: rasters decode at expected sizes (`file`/dimensions check)
      and browser tab shows the new icon in a Playwright run.
- [ ] m65-03: full check (`cd app && npm run lint && npm test && npm run
      build`), archive checklist, update STATUS.
