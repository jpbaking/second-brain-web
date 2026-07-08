import { describe, expect, it } from 'vitest'
import {
  SecretsError,
  decryptSecret,
  encryptSecret,
  secretLast4,
  secretsKeyConfigured,
} from '../src/secrets/crypto.js'

const envWith = (key: string): NodeJS.ProcessEnv => ({ SECOND_BRAIN_WEB_SECRETS_KEY: key })

describe('secrets crypto', () => {
  it('round-trips encryption and decryption', () => {
    const env = envWith('a-strong-random-secret-key')
    const enc = encryptSecret('sk-provider-abc123', env)
    expect(enc.startsWith('v1:')).toBe(true)
    expect(enc).not.toContain('sk-provider-abc123')
    expect(decryptSecret(enc, env)).toBe('sk-provider-abc123')
  })

  it('produces different ciphertext each call (random nonce)', () => {
    const env = envWith('key')
    expect(encryptSecret('same', env)).not.toBe(encryptSecret('same', env))
  })

  it('fails to decrypt with the wrong key', () => {
    const enc = encryptSecret('secret', envWith('key-one'))
    expect(() => decryptSecret(enc, envWith('key-two'))).toThrow(SecretsError)
  })

  it('rejects tampered ciphertext', () => {
    const env = envWith('key')
    const enc = encryptSecret('secret', env)
    const parts = enc.split(':')
    const tampered = [parts[0], parts[1], parts[2], Buffer.from('xxxx').toString('base64')].join(':')
    expect(() => decryptSecret(tampered, env)).toThrow(SecretsError)
  })

  it('reports not-configured and refuses to encrypt without the key', () => {
    expect(secretsKeyConfigured({})).toBe(false)
    expect(secretsKeyConfigured({ SECOND_BRAIN_WEB_SECRETS_KEY: '  ' })).toBe(false)
    expect(secretsKeyConfigured(envWith('k'))).toBe(true)
    expect(() => encryptSecret('x', {})).toThrow(/SECOND_BRAIN_WEB_SECRETS_KEY/)
  })

  it('exposes a last-4 helper for masked display', () => {
    expect(secretLast4('sk-abcdefgh')).toBe('efgh')
  })
})
