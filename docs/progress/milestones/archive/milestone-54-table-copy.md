# Milestone 54: Excel-compatible Markdown table copy

- [x] **m54-01** — Add a single copy control to rendered chat Markdown tables
  that writes both `text/html` table markup and tab-separated `text/plain`,
  falling back to plain TSV where rich clipboard writes are unavailable.
  Verification: `npm run lint --workspace web && npm run build --workspace web`.
- [x] **m54-02** — Run the full project verification gate and archive the
  milestone. Verification: `npm run lint && npm test && npm run build`.
