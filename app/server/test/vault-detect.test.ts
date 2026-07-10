import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { VAULT_MARKERS, detectVault } from '../src/vault/detect.js'

const scratch: string[] = []
function seededVault (skip: string[] = []): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-detect-'))
  scratch.push(dir)
  for (const marker of VAULT_MARKERS) {
    if (skip.includes(marker)) continue
    const file = path.join(dir, marker)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'x')
  }
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('detectVault', () => {
  it('reports all markers present in a complete vault', () => {
    const result = detectVault(seededVault())
    expect(result.present).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.markers).toHaveLength(VAULT_MARKERS.length)
  })

  it('flags a missing marker', () => {
    const result = detectVault(seededVault(['scripts/health.py']))
    expect(result.present).toBe(false)
    expect(result.missing).toEqual(['scripts/health.py'])
  })

  it('reports everything missing for a non-vault directory', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'sbw-detect-empty-'))
    scratch.push(empty)
    const result = detectVault(empty)
    expect(result.present).toBe(false)
    expect(result.missing).toHaveLength(VAULT_MARKERS.length)
  })
})
