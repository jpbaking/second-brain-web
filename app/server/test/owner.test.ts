import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { isOwnerConfigured, readOwnerAuth, verifyOwnerPassword } from '../src/auth/owner.js'

const scratch: string[] = []
const SECRETS_ENV = { SECOND_BRAIN_WEB_SECRETS_KEY: 'owner-test-key' }
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
    writeOwnerAuth(dir, state, SECRETS_ENV)

    expect(isOwnerConfigured(dir)).toBe(true)
    expect(await verifyOwnerPassword(dir, password, SECRETS_ENV)).toBe(true)
    expect(await verifyOwnerPassword(dir, `${password}x`, SECRETS_ENV)).toBe(false)
    expect(readOwnerAuth(dir, SECRETS_ENV)?.totp.secretBase32).toBe(state.totp.secretBase32)
  })

  it('reports not-configured and never throws when owner.json is absent', async () => {
    const dir = dataDir()
    expect(isOwnerConfigured(dir)).toBe(false)
    expect(readOwnerAuth(dir)).toBeNull()
    await expect(verifyOwnerPassword(dir, 'anything')).resolves.toBe(false)
  })

  it('migrates legacy plaintext state without changing credentials', async () => {
    const dir = dataDir()
    const { password, state } = await generateOwnerAuth()
    const file = path.join(dir, 'auth', 'owner.json')
    mkdirSync(path.dirname(file))
    writeFileSync(file, JSON.stringify(state))

    expect(await verifyOwnerPassword(dir, password, SECRETS_ENV)).toBe(true)
    const migrated = readFileSync(file, 'utf8')
    expect(JSON.parse(migrated).version).toBe(2)
    expect(migrated).not.toContain(state.totp.secretBase32)
    expect(readOwnerAuth(dir, SECRETS_ENV)?.totp.secretBase32).toBe(state.totp.secretBase32)
  })

  it('does not overwrite legacy or encrypted state when the key fails', async () => {
    const dir = dataDir()
    const { state } = await generateOwnerAuth()
    const file = path.join(dir, 'auth', 'owner.json')
    const legacy = JSON.stringify(state)
    mkdirSync(path.dirname(file))
    writeFileSync(file, legacy)
    expect(() => readOwnerAuth(dir, {})).toThrow(/SECOND_BRAIN_WEB_SECRETS_KEY/)
    expect(readFileSync(file, 'utf8')).toBe(legacy)

    writeOwnerAuth(dir, state, SECRETS_ENV)
    const encrypted = readFileSync(file, 'utf8')
    expect(() => readOwnerAuth(dir, { SECOND_BRAIN_WEB_SECRETS_KEY: 'wrong' })).toThrow(/decrypt/)
    expect(readFileSync(file, 'utf8')).toBe(encrypted)
  })
})
