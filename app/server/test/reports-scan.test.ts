import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanReports } from '../src/reports/scan.js'

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('report scanning', () => {
  it('derives metadata for HTML, PDF, and Markdown reports', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'sbw-reports-'))
    scratch.push(workspace)
    const year = path.join(workspace, 'reports', '2026')
    mkdirSync(year, { recursive: true })
    writeFileSync(path.join(year, '2026-07-09_weekly.html'), '<html><head><title>Weekly &amp; Delivery</title></head></html>')
    writeFileSync(path.join(year, 'architecture-review.md'), '# Architecture review\n\nBody')
    writeFileSync(path.join(year, 'board_pack.pdf'), Buffer.from('%PDF-1.4 test'))
    writeFileSync(path.join(year, 'ignore.txt'), 'not a report')
    const older = new Date('2026-07-01T00:00:00Z')
    utimesSync(path.join(year, 'board_pack.pdf'), older, older)

    const reports = scanReports(workspace)
    expect(reports).toHaveLength(3)
    expect(reports.find(item => item.type === 'html')).toMatchObject({
      path: '2026/2026-07-09_weekly.html', title: 'Weekly & Delivery', year: 2026, date: '2026-07-09',
    })
    expect(reports.find(item => item.type === 'markdown')?.title).toBe('Architecture review')
    expect(reports.find(item => item.type === 'pdf')).toMatchObject({ title: 'board pack', date: '2026-07-01' })
    expect(reports.every(item => item.bytes > 0)).toBe(true)
  })

  it('returns empty for a missing shelf and does not follow symlinks', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'sbw-reports-'))
    scratch.push(workspace)
    expect(scanReports(workspace)).toEqual([])
    mkdirSync(path.join(workspace, 'reports'), { recursive: true })
    const outside = path.join(workspace, 'outside.html')
    writeFileSync(outside, '<title>Outside</title>')
    symlinkSync(outside, path.join(workspace, 'reports', 'linked.html'))
    expect(scanReports(workspace)).toEqual([])
  })
})
