import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { verify } from '@node-rs/argon2'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OWNER_AUTH_FILE,
  buildOtpauthUri,
  encodeBase32,
  generateOneTimePassword,
  generateOwnerAuth,
  writeOwnerAuth,
} from '../src/auth/bootstrap.js'

const scratch: string[] = []
function tempDir (): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbw-auth-'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('generateOneTimePassword', () => {
  it('uses the unambiguous alphabet and is random each call', () => {
    const a = generateOneTimePassword()
    const b = generateOneTimePassword()
    expect(a).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}){3}$/)
    expect(a).not.toBe(b)
  })
})

describe('encodeBase32', () => {
  it('matches RFC 4648 test vectors (unpadded, uppercase)', () => {
    expect(encodeBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
    expect(encodeBase32(Buffer.from(''))).toBe('')
  })
})

describe('buildOtpauthUri', () => {
  it('percent-encodes spaces and keeps the label colon', () => {
    const uri = buildOtpauthUri({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Second Brain Web',
      account: 'owner',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
    expect(uri).toBe(
      'otpauth://totp/Second%20Brain%20Web:owner?secret=JBSWY3DPEHPK3PXP' +
      '&issuer=Second%20Brain%20Web&algorithm=SHA1&digits=6&period=30'
    )
    // No raw spaces and no '+' (which some authenticators misparse).
    expect(uri).not.toMatch(/[ +]/)
  })
})

describe('generateOwnerAuth', () => {
  it('produces a password, a verifiable argon2id hash, and a TOTP setup URI', async () => {
    const { password, otpauthUri, state } = await generateOwnerAuth()
    expect(state.version).toBe(1)
    expect(state.password.algorithm).toBe('argon2id')
    expect(state.password.hash).toMatch(/^\$argon2id\$/)
    expect(await verify(state.password.hash, password)).toBe(true)
    expect(await verify(state.password.hash, 'not the password')).toBe(false)
    expect(otpauthUri).toContain(`secret=${state.totp.secretBase32}`)
    expect(state.totp.secretBase32).toMatch(/^[A-Z2-7]+$/)
  })

  it('does not carry the plaintext password anywhere in the persisted state', async () => {
    const { password, state } = await generateOwnerAuth()
    expect(JSON.stringify(state)).not.toContain(password)
  })
})

describe('writeOwnerAuth', () => {
  it('writes owner.json at mode 0600 with no plaintext password', async () => {
    const dir = tempDir()
    const { password, state } = await generateOwnerAuth()
    const file = writeOwnerAuth(dir, state)

    expect(file).toBe(path.join(dir, 'auth', OWNER_AUTH_FILE))
    expect(statSync(file).mode & 0o777).toBe(0o600)
    const contents = readFileSync(file, 'utf8')
    expect(contents).not.toContain(password)
    expect(JSON.parse(contents).password.hash).toBe(state.password.hash)
  })

  it('enforces 0600 even when the file already exists more permissively', async () => {
    const dir = tempDir()
    const { state } = await generateOwnerAuth()
    // Pre-create the target with loose permissions.
    const authFile = path.join(dir, 'auth')
    rmSync(authFile, { recursive: true, force: true })
    const { mkdirSync } = await import('node:fs')
    mkdirSync(authFile, { recursive: true, mode: 0o700 })
    const target = path.join(authFile, OWNER_AUTH_FILE)
    writeFileSync(target, 'stale', { mode: 0o644 })

    writeOwnerAuth(dir, state)
    expect(statSync(target).mode & 0o777).toBe(0o600)
  })

  it('invalidates old auth state by replacing it on a repeat run', async () => {
    const dir = tempDir()
    const first = await generateOwnerAuth()
    writeOwnerAuth(dir, first.state)
    const second = await generateOwnerAuth()
    const file = writeOwnerAuth(dir, second.state)

    // Fresh material each run, and the file holds only the latest.
    expect(second.state.password.hash).not.toBe(first.state.password.hash)
    expect(second.state.totp.secretBase32).not.toBe(first.state.totp.secretBase32)
    const persisted = JSON.parse(readFileSync(file, 'utf8'))
    expect(persisted.password.hash).toBe(second.state.password.hash)
    expect(persisted.totp.secretBase32).toBe(second.state.totp.secretBase32)
  })
})
