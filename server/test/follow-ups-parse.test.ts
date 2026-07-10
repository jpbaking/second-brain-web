import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFollowUps } from '../src/follow-ups/parse.js'

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('follow-up parsing', () => {
  it('parses reminders and commitments using the vault-defined sections', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'sbw-follow-ups-'))
    scratch.push(workspace)
    const notes = path.join(workspace, 'memory', 'notes')
    mkdirSync(notes, { recursive: true })
    writeFileSync(path.join(notes, 'reminders.md'), `# Reminders
Intro is ignored.
## Open
- [ ] 2026-07-10 due: Call dentist (captured 2026-07-01)
- [ ] Review undated notes
not a task
## Done
- [x] 2026-07-01 due: Submit form
`)
    writeFileSync(path.join(notes, 'commitments.md'), `# Commitments
## I owe
- [ ] 2026-07-11 due: Send design to Maya (agreed 2026-07-01, source: [meeting](../meetings/2026/kickoff.md))
## Waiting on
- [ ] 2026-07-09 due: Alex to approve budget
## Done
- [ ] 2026-06-01 due: Historical promise
`)

    const items = parseFollowUps(workspace)
    expect(items).toHaveLength(6)
    expect(items[0]).toMatchObject({ kind: 'reminder', text: 'Call dentist (captured 2026-07-01)', dueDate: '2026-07-10', completed: false, sourceLine: 4 })
    expect(items[1]).toMatchObject({ dueDate: null, text: 'Review undated notes' })
    expect(items[2]?.completed).toBe(true)
    expect(items[3]).toMatchObject({ kind: 'commitment', direction: 'i-owe', linkedSource: 'memory/meetings/2026/kickoff.md' })
    expect(items[4]?.direction).toBe('waiting-on')
    expect(items[5]).toMatchObject({ completed: true, direction: null })
    expect(items.every(item => /^[a-f0-9]{16}$/.test(item.id))).toBe(true)
  })

  it('returns an empty list when note files are absent and rejects external source links', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'sbw-follow-ups-'))
    scratch.push(workspace)
    expect(parseFollowUps(workspace)).toEqual([])
    const notes = path.join(workspace, 'memory', 'notes')
    mkdirSync(notes, { recursive: true })
    writeFileSync(path.join(notes, 'commitments.md'), '## I owe\n- [ ] Task (source: [bad](https://example.com))\n')
    expect(parseFollowUps(workspace)[0]?.linkedSource).toBeNull()
  })
})
