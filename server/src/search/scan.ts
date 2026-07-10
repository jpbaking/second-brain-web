import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { scanReports } from '../reports/scan.js'

/**
 * Search record scan (milestone 10). Phase-005 defines lexical search over
 * `memory/`, `library/catalog.md`, and `reports/`. This module walks those
 * canonical sources and produces flat, typed records (path/kind/title/text/
 * mtime) that the FTS index (m10-02) is built from. Records are a rebuildable
 * cache — the vault checkout stays canonical.
 *
 * Only real files are read: symlinks are skipped (a symlink is not `isFile()`),
 * as are unsupported extensions, so the scan cannot follow a link out of the
 * checkout or index binary blobs.
 */

export type SearchKind = 'memory' | 'catalog' | 'report'

export interface SearchRecord {
  /** Vault-relative POSIX path, e.g. `memory/notes/reminders.md`. */
  path: string
  kind: SearchKind
  title: string
  /** Body text used for full-text indexing. Empty when none can be extracted. */
  text: string
  /** File mtime, ISO 8601. */
  mtime: string
}

/** Cap per-file reads so a pathological file cannot blow up the scan. */
const MAX_BYTES = 512 * 1024

export function scanSearchRecords (workspace: string): SearchRecord[] {
  const records: SearchRecord[] = [
    ...scanMemory(workspace),
    ...scanCatalog(workspace),
    ...scanReportRecords(workspace),
  ]
  // Deterministic order: newest first, then path for stable ties.
  return records.sort((a, b) => b.mtime.localeCompare(a.mtime) || a.path.localeCompare(b.path))
}

/** All markdown under `memory/`. */
function scanMemory (workspace: string): SearchRecord[] {
  const root = path.join(workspace, 'memory')
  if (!existsSync(root)) return []
  const out: SearchRecord[] = []

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.isFile()) continue // skips symlinks and other non-regular entries
      if (path.extname(entry.name).toLowerCase() !== '.md') continue
      const body = readTextFile(full)
      out.push({
        path: relPosix(workspace, full),
        kind: 'memory',
        title: markdownTitle(body, entry.name),
        text: body,
        mtime: statSync(full).mtime.toISOString(),
      })
    }
  }
  walk(root)
  return out
}

/** The single `library/catalog.md` index, when present. */
function scanCatalog (workspace: string): SearchRecord[] {
  const full = path.join(workspace, 'library', 'catalog.md')
  if (!existsSync(full) || !statSync(full).isFile()) return []
  const body = readTextFile(full)
  return [{
    path: relPosix(workspace, full),
    kind: 'catalog',
    title: markdownTitle(body, 'catalog.md'),
    text: body,
    mtime: statSync(full).mtime.toISOString(),
  }]
}

/** Reuse the canonical report scanner and add indexable body text. */
function scanReportRecords (workspace: string): SearchRecord[] {
  const reportsRoot = path.join(workspace, 'reports')
  return scanReports(workspace).map(report => {
    const full = path.join(reportsRoot, ...report.path.split('/'))
    return {
      path: `reports/${report.path}`,
      kind: 'report' as const,
      title: report.title,
      text: reportText(full, report.type),
      mtime: report.mtime,
    }
  })
}

function reportText (full: string, type: 'html' | 'pdf' | 'markdown'): string {
  if (type === 'markdown') return readTextFile(full)
  if (type === 'html') return stripHtml(readTextFile(full))
  return '' // PDF body is not extractable without a parser; title still indexes.
}

function readTextFile (full: string): string {
  try {
    return readFileSync(full, 'utf8').slice(0, MAX_BYTES)
  } catch {
    return ''
  }
}

function markdownTitle (body: string, filename: string): string {
  const heading = /^#\s+(.+?)\s*$/m.exec(body)?.[1]
  if (heading !== undefined) return heading.trim()
  return path.basename(filename, path.extname(filename)).replaceAll(/[-_]+/g, ' ').trim()
}

function stripHtml (source: string): string {
  return source
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function relPosix (workspace: string, full: string): string {
  return path.relative(workspace, full).split(path.sep).join('/')
}
