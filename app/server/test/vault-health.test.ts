import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runHealthCheck } from '../src/vault/health.js'

const scratch: string[] = []
function workspaceWith (script: string | null): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-health-'))
  scratch.push(dir)
  if (script !== null) {
    mkdirSync(path.join(dir, 'scripts'), { recursive: true })
    writeFileSync(path.join(dir, 'scripts', 'health.py'), script)
  }
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('runHealthCheck', () => {
  it('parses issue count and sections from stdout', async () => {
    const ws = workspaceWith([
      'print("# Vault health")',
      'print("3 issues found")',
      'print("## Reminders")',
      'print("## Structure")',
    ].join('\n'))
    const result = await runHealthCheck(ws)
    expect(result.available).toBe(true)
    expect(result.issueCount).toBe(3)
    expect(result.sections).toEqual(['Vault health', 'Reminders', 'Structure'])
    expect(result.rawText).toContain('3 issues found')
  })

  it('detects a healthy result as zero issues', async () => {
    const ws = workspaceWith('print("All checks passed. No issues.")')
    const result = await runHealthCheck(ws)
    expect(result.issueCount).toBe(0)
  })

  it('treats a script that exits non-zero but prints output as authoritative on text', async () => {
    // Always exits 1, but the text is what matters.
    const ws = workspaceWith('import sys\nprint("2 warnings")\nsys.exit(1)')
    const result = await runHealthCheck(ws)
    expect(result.available).toBe(true)
    expect(result.issueCount).toBe(2)
  })

  it('reports not-available when the script is missing', async () => {
    const result = await runHealthCheck(workspaceWith(null))
    expect(result.available).toBe(false)
    expect(result.message).toMatch(/health\.py/)
  })
})
