import { describe, expect, it } from 'vitest'
import {
  parseEnv, serializeEnv, getEnv, setEnv,
  parseProviders, serializeProviders, providerSummary,
  slugify, isValidProviderId, isValidProvider, isValidPort,
} from '../src/cli/configure-lib.js'

describe('.env round-trip', () => {
  it('parses KEY=VALUE, drops comments/blanks, preserves order', () => {
    const entries = parseEnv('# comment\nA=1\n\nB=two\n#X=skip\nC=3\n')
    expect(entries).toEqual([{ key: 'A', value: '1' }, { key: 'B', value: 'two' }, { key: 'C', value: '3' }])
  })

  it('keeps the last value but the first position on a duplicate key', () => {
    const entries = parseEnv('A=1\nB=2\nA=9\n')
    expect(entries).toEqual([{ key: 'A', value: '9' }, { key: 'B', value: '2' }])
  })

  it('preserves an unknown key when a known one is updated', () => {
    const entries = parseEnv('SECOND_BRAIN_WEB_PORT=8722\nMY_CUSTOM=keep-me\n')
    setEnv(entries, 'SECOND_BRAIN_WEB_PORT', '9000')
    setEnv(entries, 'SECOND_BRAIN_WEB_BIND', '0.0.0.0')
    expect(serializeEnv(entries)).toBe(
      'SECOND_BRAIN_WEB_PORT=9000\nMY_CUSTOM=keep-me\nSECOND_BRAIN_WEB_BIND=0.0.0.0\n'
    )
    expect(getEnv(entries, 'MY_CUSTOM')).toBe('keep-me')
  })
})

describe('providers YAML round-trip', () => {
  const doc = `providers:
  anthropic-main:
    display_name: 'Main'
    provider: anthropic
    model: 'claude-sonnet-4-5'
    key: 'v1:abc'
  local:
    provider: openai-compatible
    model: 'x'
    base_url: 'https://llm.local/v1'
`

  it('parses to a provider map and preserves untouched entries on re-serialise', () => {
    const map = parseProviders(doc)
    expect(Object.keys(map)).toEqual(['anthropic-main', 'local'])
    expect(map['anthropic-main'].key).toBe('v1:abc')
    // Edit only one entry's model; the other must survive verbatim.
    map['anthropic-main'].model = 'claude-opus-4-8'
    const out = parseProviders(serializeProviders(map))
    expect(out['anthropic-main'].model).toBe('claude-opus-4-8')
    expect(out['anthropic-main'].key).toBe('v1:abc')
    expect(out.local).toEqual({ provider: 'openai-compatible', model: 'x', base_url: 'https://llm.local/v1' })
  })

  it('handles empty/missing documents and emits an empty map', () => {
    expect(parseProviders('')).toEqual({})
    expect(parseProviders('providers:\n')).toEqual({})
    expect(serializeProviders({})).toBe('providers:\n  {}\n')
  })

  it('emits fields in the documented order', () => {
    const out = serializeProviders({
      x: { key: 'v1:z', model: 'm', provider: 'openai', display_name: 'X' },
    })
    // Colon-suffixed so the 'providers:' header does not match 'provider'.
    expect(out.indexOf('display_name:')).toBeLessThan(out.indexOf('provider:'))
    expect(out.indexOf('provider:')).toBeLessThan(out.indexOf('model:'))
    expect(out.indexOf('model:')).toBeLessThan(out.indexOf('key:'))
  })

  it('summarises a provider for menus', () => {
    expect(providerSummary('id1', { provider: 'anthropic', model: 'claude' })).toBe('id1  (anthropic / claude)')
  })
})

describe('validators and slug', () => {
  it('slugifies', () => {
    expect(slugify('OpenAI GPT-4o!')).toBe('openai-gpt-4o')
    expect(slugify('anthropic/claude sonnet')).toBe('anthropic-claude-sonnet')
  })
  it('validates provider ids', () => {
    expect(isValidProviderId('anthropic-main')).toBe(true)
    expect(isValidProviderId('1bad')).toBe(false)
    expect(isValidProviderId('Bad')).toBe(false)
  })
  it('validates provider types', () => {
    expect(isValidProvider('gemini')).toBe(true)
    expect(isValidProvider('bogus')).toBe(false)
  })
  it('validates ports', () => {
    expect(isValidPort('8722')).toBe(true)
    expect(isValidPort('0')).toBe(false)
    expect(isValidPort('99999')).toBe(false)
    expect(isValidPort('abc')).toBe(false)
  })
})
