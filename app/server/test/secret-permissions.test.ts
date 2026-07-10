import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertSecretPermissions, checkSecretPermissions, SecretPermissionError } from '../src/security/secret-permissions.js'

const scratch: string[] = []

function dataDir (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-secret-perms-'))
  scratch.push(dir)
  return dir
}

function writeSecret (dir: string, rel: string, mode: number): void {
  const full = path.join(dir, ...rel.split('/'))
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, 'secret')
  chmodSync(full, mode)
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('secret permission checks', () => {
  it('passes when secret files are private (0600) or absent', () => {
    const dir = dataDir()
    writeSecret(dir, 'auth/owner.json', 0o600)
    // ssh/deploy_key intentionally absent — not yet generated.
    expect(checkSecretPermissions(dir)).toEqual([])
    expect(() => assertSecretPermissions(dir)).not.toThrow()
  })

  it('flags group- or other-accessible secret files', () => {
    const dir = dataDir()
    writeSecret(dir, 'auth/owner.json', 0o644)
    writeSecret(dir, 'ssh/deploy_key', 0o640)

    const issues = checkSecretPermissions(dir)
    expect(issues).toContainEqual({ path: 'auth/owner.json', mode: '644' })
    expect(issues).toContainEqual({ path: 'ssh/deploy_key', mode: '640' })
  })

  it('refuses to continue with an actionable error listing the offenders', () => {
    const dir = dataDir()
    writeSecret(dir, 'auth/owner.json', 0o604) // other-readable

    expect(() => assertSecretPermissions(dir)).toThrow(SecretPermissionError)
    try {
      assertSecretPermissions(dir)
    } catch (err) {
      expect((err as Error).message).toContain('auth/owner.json')
      expect((err as Error).message).toContain('chmod 600')
    }
  })

  it('ignores the public deploy key (not a secret)', () => {
    const dir = dataDir()
    writeSecret(dir, 'ssh/deploy_key', 0o600)
    writeSecret(dir, 'ssh/deploy_key.pub', 0o644) // public keys may be world-readable
    expect(checkSecretPermissions(dir)).toEqual([])
  })
})
