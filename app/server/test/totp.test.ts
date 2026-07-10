import { describe, expect, it } from 'vitest'
import { encodeBase32 } from '../src/auth/bootstrap.js'
import { decodeBase32, totpCode, verifyTotp } from '../src/auth/totp.js'

// RFC 6238 Appendix B seed for SHA1: ASCII "12345678901234567890".
const rfcSecret = encodeBase32(Buffer.from('12345678901234567890'))
const at = (t: number): Date => new Date(t * 1000)

describe('base32 round trip', () => {
  it('decodes what bootstrap encodes', () => {
    const bytes = Buffer.from('foobar')
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes)
  })
})

describe('RFC 6238 test vectors (SHA1, 8 digits)', () => {
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ]
  for (const [t, code] of vectors) {
    it(`T=${t} -> ${code}`, () => {
      expect(totpCode(rfcSecret, { now: at(t), digits: 8, algorithm: 'SHA1' })).toBe(code)
      expect(verifyTotp(rfcSecret, code, { now: at(t), digits: 8, skewSteps: 0 })).toBe(true)
    })
  }
})

describe('verifyTotp', () => {
  it('accepts the current 6-digit code and rejects a wrong one', () => {
    const now = at(1234567890)
    const code = totpCode(rfcSecret, { now })
    expect(verifyTotp(rfcSecret, code, { now })).toBe(true)
    const wrong = code === '000000' ? '111111' : '000000'
    expect(verifyTotp(rfcSecret, wrong, { now })).toBe(false)
  })

  it('accepts a code from the previous step within ±1 skew, not with skew 0', () => {
    const now = at(1234567890)
    const prev = totpCode(rfcSecret, { now: at(1234567890 - 30) })
    expect(verifyTotp(rfcSecret, prev, { now, skewSteps: 1 })).toBe(true)
    expect(verifyTotp(rfcSecret, prev, { now, skewSteps: 0 })).toBe(false)
  })

  it('rejects a code outside the skew window', () => {
    const now = at(1234567890)
    const farFuture = totpCode(rfcSecret, { now: at(1234567890 + 300) })
    expect(verifyTotp(rfcSecret, farFuture, { now, skewSteps: 1 })).toBe(false)
  })

  it('rejects malformed input without throwing', () => {
    const now = at(1234567890)
    expect(verifyTotp(rfcSecret, '12ab56', { now })).toBe(false)
    expect(verifyTotp(rfcSecret, '1234', { now })).toBe(false)
    expect(verifyTotp(rfcSecret, '', { now })).toBe(false)
  })
})
