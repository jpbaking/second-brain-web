import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { isOwnerConfigured, readOwnerAuth, verifyOwnerPassword } from '../src/auth/owner.js'

const scratch: string[] = []
function dataDir (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-owner-'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('owner credentials', () => {
  it('verifies the generated password and rejects a wrong one', async () => {
    const dir = dataDir()
    const { password, state } = await generateOwnerAuth()
    writeOwnerAuth(dir, state)

    expect(isOwnerConfigured(dir)).toBe(true)
    expect(await verifyOwnerPassword(dir, password)).toBe(true)
    expect(await verifyOwnerPassword(dir, `${password}x`)).toBe(false)
    expect(readOwnerAuth(dir)?.totp.secretBase32).toBe(state.totp.secretBase32)
  })

  it('reports not-configured and never throws when owner.json is absent', async () => {
    const dir = dataDir()
    expect(isOwnerConfigured(dir)).toBe(false)
    expect(readOwnerAuth(dir)).toBeNull()
    await expect(verifyOwnerPassword(dir, 'anything')).resolves.toBe(false)
  })
})
