import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Application secret encryption (phase-002 Provider API Keys). Provider keys are
 * encrypted at rest with a key derived from `SECOND_BRAIN_WEB_SECRETS_KEY` and
 * nothing else — never the session secret, never plaintext. If the key is not
 * configured, callers must refuse to store secrets rather than degrade.
 */

const ENV_KEY = 'SECOND_BRAIN_WEB_SECRETS_KEY'
const KDF_SALT = 'second-brain-web/secrets/v1'
const VERSION = 'v1'

export class SecretsError extends Error {}

/** Whether encrypted secret storage is available (the key is configured). */
export function secretsKeyConfigured (env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[ENV_KEY]
  return value !== undefined && value.trim() !== ''
}

function requireSecretKey (env: NodeJS.ProcessEnv): string {
  const value = env[ENV_KEY]
  if (value === undefined || value.trim() === '') {
    throw new SecretsError(
      `${ENV_KEY} is not set. Set it to a strong random value to enable ` +
      'encrypted provider-key storage, then try again.'
    )
  }
  return value
}

/** Stretch the configured secret into a 32-byte AES key. */
function deriveKey (secret: string): Buffer {
  return scryptSync(secret, KDF_SALT, 32)
}

/** Encrypt plaintext to a self-describing `v1:nonce:tag:ciphertext` string. */
export function encryptSecret (plaintext: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = deriveKey(requireSecretKey(env))
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, nonce.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/** Decrypt a string produced by encryptSecret. Throws on wrong key or tamper. */
export function decryptSecret (encoded: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = deriveKey(requireSecretKey(env))
  const [version, nonceB64, tagB64, ctB64] = encoded.split(':')
  if (version !== VERSION || nonceB64 === undefined || tagB64 === undefined || ctB64 === undefined) {
    throw new SecretsError('malformed secret ciphertext.')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonceB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  try {
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw new SecretsError('could not decrypt secret (wrong key or corrupt data).')
  }
}

/** Last four characters of a secret, for non-sensitive display. */
export function secretLast4 (secret: string): string {
  return secret.slice(-4)
}
