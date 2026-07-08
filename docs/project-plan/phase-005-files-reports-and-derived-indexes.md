# Phase 005 - Files, Reports, And Derived Indexes

## Upload Handling

Uploads should land in the vault `inbox/` exactly as supplied, subject to safe
filename handling.

Rules:

- Do not interpret or summarise uploaded files in app code.
- Do not write uploads directly to `library/`.
- Preserve original file content.
- Normalise dangerous paths.
- Support folder uploads by recreating a safe folder structure under `inbox/`
  or by packaging folder content in a dated upload folder.

Recommended upload path:

```text
inbox/uploads/YYYY-MM-DD_HHMMSS/<safe-original-name>
```

The agent can later process that tree through `/inbox.md`.

## Inbox Intake Wizard

The upload UI should include an optional intake wizard. It should improve agent
filing without turning the app into a second memory system.

Suggested fields:

- Short description.
- Date received or created.
- Related people.
- Related projects.
- Urgency.
- Desired workflow, such as process inbox, create report, prep meeting, or just
  file for later.
- Notes for the secretary.

Implementation options:

- Store a small companion metadata file in the upload folder, for example
  `_intake.json` or `_intake.md`.
- Or store intake metadata in the app DB and inject it into the `/inbox.md`
  task prompt.

Preferred MVP approach: write a companion `_intake.md` in the upload folder so
the context travels with the uploaded files inside the vault checkout. The agent
should later move/catalogue original files according to vault rules and decide
whether to preserve, summarise, or discard the intake note as provenance.

The intake companion is app-authored metadata, not a user-provided original.
Original uploaded files remain untouched. If the intake note is later moved or
summarised, it should be handled as provenance/context, not as a sacred library
original.

## File Size And Types

Initial support:

- Markdown
- Text
- PDF
- Images
- Office documents if the agent/runtime can inspect them
- JSON/CSV

MVP should set a configurable max upload size. Large files should be stored but
may require the agent to ask for conversion or extraction support.

## Report Browser

Index generated reports under:

- `reports/YYYY/*.html`
- `reports/YYYY/*.pdf`
- `reports/YYYY/*.md`

Report metadata can be derived by scanning the vault:

- Path
- Filename
- Date from filename or file mtime
- Type
- Title from HTML `<title>` or markdown first heading
- Related workflow if inferable from path/name

The browser should support:

- List by year.
- Search title/path.
- Open HTML.
- Download PDF/Markdown.
- Show raw path in vault.
- Show source coverage when available.

## Report Hosting

Serve reports through authenticated app routes:

```text
/reports/<encoded-vault-relative-path>
```

Security requirements:

- Resolve real path under vault `reports/`.
- Reject path traversal.
- Require auth.
- Do not expose the whole workspace as static files.

## PDF Export

The vault already has:

```bash
scripts/export-pdf.sh <report.html>
```

The app can expose PDF export as an approved tool action, but MVP can simply
display existing PDFs and rely on agent workflows to generate PDFs.

## Derived Index Philosophy

Derived indexes are caches. The vault remains canonical.

Allowed sidecars:

- SQLite table of files/pages.
- SQLite FTS5 index for markdown/report text.
- Link graph extracted from markdown links.
- Optional embedding/vector index.
- Source coverage index for reports and cited answers when sources can be
  parsed from report metadata, report sections, links, or agent events.

If sidecar state is lost, the app must rebuild it from the vault checkout.

## Suggested SQLite Schema

Tables:

- `vault_files`
  - `path`
  - `kind`
  - `mtime`
  - `sha256`
  - `title`
  - `summary`
- `vault_links`
  - `from_path`
  - `to_path`
  - `label`
- `vault_search`
  - FTS table over path, title, body
- `reports`
  - path, title, type, year, mtime
- `source_coverage`
  - artifact_path, source_path, source_kind, evidence_label, vault_commit
- `index_runs`
  - started, completed, commit, status

Core app tables live in `db/app.sqlite`; rebuildable search/link/source coverage
caches may live in `indexes/vault.sqlite`.

## Search Strategy

MVP:

- Lexical search over `memory/`, `library/catalog.md`, and `reports/`.

Later:

- Optional embeddings for semantic search.
- Search results grouped by memory area.
- "Ask from selected sources" action that sends a recall request to the agent.

## Source Coverage View

Source coverage is a trust surface for reports and substantial cited answers.

It should show:

- Which memory pages were used.
- Which library originals were cited or referenced through catalogs.
- Which generated report or answer the coverage belongs to.
- The vault commit at generation time if known.
- Staleness or missing-source notes if the agent recorded them.

Potential sources of coverage data:

- Report "Sources" sections.
- Markdown links in reports.
- Agent event metadata.
- Chat/session metadata.
- Explicit report provenance stored by the app.

MVP can start with simple parsing of report links and Sources sections, then
improve as report generation becomes more structured.

## Memory Explorer

Stretch goal visualisation:

- Nodes: people, projects, meetings, decisions, notes, topics, reports,
  library originals.
- Edges: markdown links, catalog references, report sources.
- Filters: area, date, stale pages, warning markers.
- Detail panel: file path, title, latest dated entries, links.

The explorer is for navigation and discovery. It should not become a freeform
editor in MVP.

## Reindex Triggers

Rebuild derived indexes:

- After clone.
- After pull.
- After successful mutating workflow.
- After report generation.
- On manual "reindex app cache" action.

Do not confuse app cache reindex with the vault's `/reindex.md` workflow. The
former rebuilds sidecars; the latter repairs vault navigation files.
