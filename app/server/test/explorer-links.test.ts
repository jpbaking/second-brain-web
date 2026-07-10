import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extractVaultLinks } from '../src/explorer/links.js'
import type { VaultLink } from '../src/explorer/links.js'

const scratch: string[] = []

function workspace (): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-explorer-links-'))
  scratch.push(root)
  return root
}

function write (root: string, rel: string, body: string): void {
  const full = path.join(root, ...rel.split('/'))
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, body)
}

const has = (edges: VaultLink[], from: string, to: string, label: string): boolean =>
  edges.some(e => e.from === from && e.to === to && e.label === label)

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('vault link extraction', () => {
  it('extracts resolved in-vault edges from memory, catalogue, and reports', () => {
    const ws = workspace()
    write(ws, 'memory/notes/index.md', '# Index\n\nSee [Alice](../people/alice.md) and the [weekly review](../../reports/2026/weekly.md).\n')
    write(ws, 'memory/people/alice.md', '# Alice\n\nLeads [Apollo](../projects/apollo.md#status).\n')
    write(ws, 'library/catalog.md', '# Catalogue\n\n- [Q2 invoice](originals/invoice-2026.pdf)\n')
    write(ws, 'reports/2026/weekly.md', '# Weekly review\n\nSource: [notes](../../memory/notes/index.md).\n')

    const edges = extractVaultLinks(ws)

    expect(has(edges, 'memory/notes/index.md', 'memory/people/alice.md', 'Alice')).toBe(true)
    expect(has(edges, 'memory/notes/index.md', 'reports/2026/weekly.md', 'weekly review')).toBe(true)
    // Fragment is stripped from the resolved target.
    expect(has(edges, 'memory/people/alice.md', 'memory/projects/apollo.md', 'Apollo')).toBe(true)
    expect(has(edges, 'library/catalog.md', 'library/originals/invoice-2026.pdf', 'Q2 invoice')).toBe(true)
    expect(has(edges, 'reports/2026/weekly.md', 'memory/notes/index.md', 'notes')).toBe(true)

    // Deterministic order and no duplicates.
    expect(edges).toEqual([...edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.label.localeCompare(b.label)))
  })

  it('drops external, image, anchor-only, and vault-escaping links', () => {
    const ws = workspace()
    write(ws, 'memory/notes/index.md', [
      '# Index',
      '',
      '[site](https://example.com/x)',
      '[mail](mailto:a@b.com)',
      '![diagram](../assets/diagram.png)',
      '[top](#heading)',
      '[escape](../../../outside.md)',
      '[ok](sibling.md)',
      '',
    ].join('\n'))

    const edges = extractVaultLinks(ws)
    const targets = edges.map(e => e.to)

    expect(targets).toContain('memory/notes/sibling.md')
    expect(targets).not.toContain('../assets/diagram.png')
    expect(edges.some(e => e.label === 'site' || e.label === 'mail' || e.label === 'diagram' || e.label === 'top' || e.label === 'escape')).toBe(false)
    // Only the one valid in-vault link survives.
    expect(edges).toHaveLength(1)
  })

  it('deduplicates identical edges', () => {
    const ws = workspace()
    write(ws, 'memory/a.md', '# A\n\n[b](b.md) then again [b](b.md) and [b again](b.md)\n')
    const edges = extractVaultLinks(ws)
    // Same from/to/label collapses to one; a different label is its own edge.
    expect(edges.filter(e => e.label === 'b')).toHaveLength(1)
    expect(edges.filter(e => e.to === 'memory/b.md')).toHaveLength(2)
  })
})
