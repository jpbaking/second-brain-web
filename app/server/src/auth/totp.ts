import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * TOTP (RFC 6238) verification for the owner's authenticator app. The secret
 * is the base32 string stored in auth/owner.json. Codes are checked over a
 * small ± window to tolerate clock drift (phase-002: small allowed skew).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export interface TotpOptions {
  now?: Date
  period?: number
  digits?: number
  /** Hash algorithm as stored (e.g. 'SHA1'); mapped to a node HMAC name. */
  algorithm?: string
  /** Number of ±period steps to accept around the current one. */
  skewSteps?: number
}

/** Decode an unpadded RFC 4648 base32 string to bytes. */
export function decodeBase32 (input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error(`invalid base32 character: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function hotp (secret: Buffer, counter: number, digits: number, algorithm: string): string {
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac(algorithm, secret).update(counterBuf).digest()
  const offset = digest.readUInt8(digest.length - 1) & 0x0f
  // RFC 4226 dynamic truncation: 31-bit value from 4 bytes at offset.
  const binary = digest.readUInt32BE(offset) & 0x7fffffff
  return (binary % 10 ** digits).toString().padStart(digits, '0')
}

/** Compute the current TOTP code for a secret (used mainly in tests). */
export function totpCode (secretBase32: string, opts: TotpOptions = {}): string {
  const period = opts.period ?? 30
  const digits = opts.digits ?? 6
  const algorithm = (opts.algorithm ?? 'SHA1').toLowerCase()
  const now = opts.now ?? new Date()
  const counter = Math.floor(now.getTime() / 1000 / period)
  return hotp(decodeBase32(secretBase32), counter, digits, algorithm)
}

function timingSafeEqualStr (a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Verify a submitted code against the secret, accepting the current step and
 * ±skewSteps around it. Returns false for malformed input rather than throwing.
 */
export function verifyTotp (secretBase32: string, code: string, opts: TotpOptions = {}): boolean {
  const period = opts.period ?? 30
  const digits = opts.digits ?? 6
  const algorithm = (opts.algorithm ?? 'SHA1').toLowerCase()
  const skew = opts.skewSteps ?? 1
  const now = opts.now ?? new Date()

  const normalized = code.replace(/\s+/g, '')
  if (!/^[0-9]+$/.test(normalized) || normalized.length !== digits) return false

  const secret = decodeBase32(secretBase32)
  const counter = Math.floor(now.getTime() / 1000 / period)
  for (let w = -skew; w <= skew; w++) {
    if (timingSafeEqualStr(hotp(secret, counter + w, digits, algorithm), normalized)) {
      return true
    }
  }
  return false
}
