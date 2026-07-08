import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes, randomInt } from 'node:crypto'
import path from 'node:path'
import { hash } from '@node-rs/argon2'
import type { Algorithm } from '@node-rs/argon2'

/** Owner auth state lives here, relative to the data root's `auth/` dir. */
export const OWNER_AUTH_FILE = 'owner.json'

/** Shown in authenticator apps (phase-002). British spelling, plain wording. */
const ISSUER = 'Second Brain Web'
const ACCOUNT = 'owner'

/** TOTP parameters (phase-002 MVP): standard SHA1 / 6 digits / 30s period. */
const TOTP_ALGORITHM = 'SHA1'
const TOTP_DIGITS = 6
const TOTP_PERIOD = 30
const TOTP_SECRET_BYTES = 20

/**
 * Argon2id cost parameters (OWASP baseline: 19 MiB, 2 iterations, 1 lane).
 * The encoded hash string embeds the salt and these parameters, so it is
 * self-contained for later verification.
 */
const ARGON2_MEMORY_COST = 19456
const ARGON2_TIME_COST = 2
const ARGON2_PARALLELISM = 1
/** Algorithm.Argon2id — pinned explicitly rather than trusting the default. */
const ARGON2_ID = 2 as Algorithm

/** One-time password alphabet: no I/O/0/1 to avoid transcription mistakes. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PASSWORD_GROUPS = 4
const PASSWORD_GROUP_LEN = 5

/** RFC 4648 base32 alphabet (no padding) — the form authenticator apps expect. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export interface OwnerAuthState {
  version: 1
  createdAt: string
  password: {
    algorithm: 'argon2id'
    /** Encoded Argon2id string ($argon2id$v=19$m=..,t=..,p=..$salt$hash). */
    hash: string
    createdAt: string
    changedAt: string
  }
  totp: {
    algorithm: string
    digits: number
    period: number
    /** MVP: plaintext base32 secret in a 0600 file (phase-002 TOTP Storage). */
    secretBase32: string
    createdAt: string
  }
}

export interface GeneratedOwnerAuth {
  /** Plaintext one-time password — shown once, never persisted. */
  password: string
  otpauthUri: string
  state: OwnerAuthState
}

/** A grouped one-time password, e.g. `ABCDE-FGHJK-LMNPQ-RSTUV` (~100 bits). */
export function generateOneTimePassword (
  groups = PASSWORD_GROUPS,
  groupLen = PASSWORD_GROUP_LEN
): string {
  const parts: string[] = []
  for (let g = 0; g < groups; g++) {
    let part = ''
    for (let i = 0; i < groupLen; i++) {
      part += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
    }
    parts.push(part)
  }
  return parts.join('-')
}

/** Hash a password with Argon2id. Returns the self-contained encoded string. */
export async function hashPassword (password: string): Promise<string> {
  return await hash(password, {
    algorithm: ARGON2_ID,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
  })
}

/** Encode bytes as unpadded RFC 4648 base32 (uppercase). */
export function encodeBase32 (data: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of data) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

interface OtpauthParams {
  secret: string
  issuer: string
  account: string
  algorithm: string
  digits: number
  period: number
}

/** Build an `otpauth://totp/...` provisioning URI (spaces percent-encoded). */
export function buildOtpauthUri (params: OtpauthParams): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`
  const query = [
    `secret=${params.secret}`,
    `issuer=${encodeURIComponent(params.issuer)}`,
    `algorithm=${params.algorithm}`,
    `digits=${params.digits}`,
    `period=${params.period}`,
  ].join('&')
  return `otpauth://totp/${label}?${query}`
}

/**
 * Generate fresh owner auth material: a one-time password (returned in the
 * clear for one-time display, never stored), its Argon2id hash, a TOTP secret,
 * and the otpauth setup URI. Only non-plaintext-password state goes into
 * `state` for persistence.
 */
export async function generateOwnerAuth (now = new Date()): Promise<GeneratedOwnerAuth> {
  const password = generateOneTimePassword()
  const passwordHash = await hashPassword(password)
  const totpSecret = encodeBase32(randomBytes(TOTP_SECRET_BYTES))
  const iso = now.toISOString()

  const otpauthUri = buildOtpauthUri({
    secret: totpSecret,
    issuer: ISSUER,
    account: ACCOUNT,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  })

  const state: OwnerAuthState = {
    version: 1,
    createdAt: iso,
    password: {
      algorithm: 'argon2id',
      hash: passwordHash,
      createdAt: iso,
      changedAt: iso,
    },
    totp: {
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secretBase32: totpSecret,
      createdAt: iso,
    },
  }

  return { password, otpauthUri, state }
}

/**
 * Write owner auth state to `<dataDir>/auth/owner.json` at mode 0600,
 * overwriting any previous state (which invalidates old credentials).
 * Returns the file path.
 */
export function writeOwnerAuth (dataDir: string, state: OwnerAuthState): string {
  const authDir = path.join(dataDir, 'auth')
  mkdirSync(authDir, { recursive: true, mode: 0o700 })
  const file = path.join(authDir, OWNER_AUTH_FILE)
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  // writeFileSync's mode only applies on creation; enforce 0600 on an
  // existing file too, and against a permissive umask.
  chmodSync(file, 0o600)
  return file
}
