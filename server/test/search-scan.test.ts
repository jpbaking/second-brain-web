import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanSearchRecords } from '../src/search/scan.js'
import type { SearchRecord } from '../src/search/scan.js'

const scratch: string[] = []

function workspace (): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-search-scan-'))
  scratch.push(root)
  return root
}

function write (root: string, rel: string, body: string): void {
  const full = path.join(root, ...rel.split('/'))
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, body)
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const byPath = (records: SearchRecord[], p: string): SearchRecord | undefined => records.find(r => r.path === p)

describe('search record scan', () => {
  it('scans memory markdown, the catalog, and reports into typed records', () => {
    const ws = workspace()
    write(ws, 'memory/notes/reminders.md', '# Reminders\n\n- [ ] renew the domain\n')
    write(ws, 'memory/people/alice.md', '# Alice\n\nWorks in finance.\n')
    write(ws, 'library/catalog.md', '# Library catalogue\n\n- invoice-2026.pdf — Q2 invoice\n')
    write(ws, 'reports/2026/weekly.md', '# Weekly review\n\nShipped the search index.\n')
    write(ws, 'reports/dash.html', '<html><head><title>Dashboard</title></head><body><p>Live metrics</p></body></html>')

    const records = scanSearchRecords(ws)

    expect(byPath(records, 'memory/notes/reminders.md')).toMatchObject({ kind: 'memory', title: 'Reminders' })
    expect(byPath(records, 'memory/notes/reminders.md')?.text).toContain('renew the domain')
    expect(byPath(records, 'memory/people/alice.md')).toMatchObject({ kind: 'memory', title: 'Alice' })
    expect(byPath(records, 'library/catalog.md')).toMatchObject({ kind: 'catalog', title: 'Library catalogue' })
    expect(byPath(records, 'reports/2026/weekly.md')).toMatchObject({ kind: 'report', title: 'Weekly review' })

    const html = byPath(records, 'reports/dash.html')
    expect(html?.kind).toBe('report')
    expect(html?.title).toBe('Dashboard')
    expect(html?.text).toContain('Live metrics')
    expect(html?.text).not.toContain('<p>') // tags stripped

    // Every record carries an ISO mtime; order is newest-first, path-stable.
    expect(records.every(r => /^\d{4}-\d{2}-\d{2}T/.test(r.mtime))).toBe(true)
    const sorted = [...records].sort((a, b) => b.mtime.localeCompare(a.mtime) || a.path.localeCompare(b.path))
    expect(records).toEqual(sorted)
  })

  it('skips unsupported files and symlinks, and tolerates missing directories', () => {
    const ws = workspace()
    write(ws, 'memory/notes/keep.md', '# Keep\n\nindexed.\n')
    write(ws, 'memory/notes/data.bin', 'binary blob')
    write(ws, 'memory/notes/image.png', 'not markdown')

    // A symlink inside memory/ must never be followed or indexed.
    const target = path.join(ws, 'outside-secret.md')
    writeFileSync(target, '# Secret\n\nshould not be indexed\n')
    symlinkSync(target, path.join(ws, 'memory', 'notes', 'link.md'))

    const records = scanSearchRecords(ws)
    const paths = records.map(r => r.path)

    expect(paths).toContain('memory/notes/keep.md')
    expect(paths).not.toContain('memory/notes/data.bin')
    expect(paths).not.toContain('memory/notes/image.png')
    expect(paths).not.toContain('memory/notes/link.md')
    expect(records.every(r => !r.text.includes('should not be indexed'))).toBe(true)

    // No reports/ or library/ present — scan still succeeds with just memory.
    expect(records).toHaveLength(1)
  })
})
