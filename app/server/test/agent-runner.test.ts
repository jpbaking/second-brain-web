import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentStorageEnv, normaliseOpenAiBaseUrl, sdkProviderId, toModelConfig } from '../src/agent/runner.js'
import type { ProviderSnapshot } from '../src/providers/snapshot.js'

function snap (over: Partial<ProviderSnapshot>): ProviderSnapshot {
  return {
    profileId: 'p1',
    displayName: 'X',
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
    baseUrl: null,
    headers: null,
    apiKey: null,
    ...over,
  }
}

describe('sdkProviderId', () => {
  it('maps m05 provider ids to SDK provider ids', () => {
    expect(sdkProviderId('anthropic')).toBe('anthropic')
    expect(sdkProviderId('gemini')).toBe('gemini')
    expect(sdkProviderId('openai')).toBe('openai-native')
    expect(sdkProviderId('openai-compatible')).toBe('openai-compatible')
  })
  it('throws on an unsupported provider id', () => {
    expect(() => sdkProviderId('unknown')).toThrow(/unsupported/)
  })
})

describe('normaliseOpenAiBaseUrl', () => {
  it('appends /v1 to a bare host (LM Studio needs it — findings m00-08)', () => {
    expect(normaliseOpenAiBaseUrl('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234/v1')
    expect(normaliseOpenAiBaseUrl('http://127.0.0.1:1234/')).toBe('http://127.0.0.1:1234/v1')
  })
  it('leaves a URL that already carries a path untouched (minus trailing slash)', () => {
    expect(normaliseOpenAiBaseUrl('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1')
    expect(normaliseOpenAiBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1')
  })
})

describe('toModelConfig', () => {
  it('maps an anthropic snapshot with a key and no base URL', () => {
    const cfg = toModelConfig(snap({ providerId: 'anthropic', apiKey: 'sk-ant-123' }))
    expect(cfg).toEqual({ providerId: 'anthropic', modelId: 'claude-sonnet-5', apiKey: 'sk-ant-123' })
    expect('baseUrl' in cfg).toBe(false)
  })

  it('maps an official openai snapshot to openai-native', () => {
    const cfg = toModelConfig(snap({ providerId: 'openai', modelId: 'gpt-5', apiKey: 'sk-oa' }))
    expect(cfg.providerId).toBe('openai-native')
    expect(cfg.modelId).toBe('gpt-5')
  })

  it('maps an official Gemini snapshot to the native gemini provider', () => {
    const cfg = toModelConfig(snap({ providerId: 'gemini', modelId: 'gemini-2.5-pro', apiKey: 'google-key' }))
    expect(cfg).toEqual({ providerId: 'gemini', modelId: 'gemini-2.5-pro', apiKey: 'google-key' })
  })

  it('normalises a bare openai-compatible base URL and passes the key + headers', () => {
    const cfg = toModelConfig(snap({
      providerId: 'openai-compatible', modelId: 'local', baseUrl: 'http://127.0.0.1:1234', apiKey: 'sk-x', headers: { 'x-a': '1' },
    }))
    expect(cfg).toEqual({
      providerId: 'openai-compatible', modelId: 'local', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'sk-x', headers: { 'x-a': '1' },
    })
  })

  it('omits apiKey for a keyless cloud profile', () => {
    const cfg = toModelConfig(snap({ providerId: 'anthropic', apiKey: null }))
    expect('apiKey' in cfg).toBe(false)
  })

  it('supplies a placeholder key for a keyless openai-compatible endpoint (LM Studio)', () => {
    // The SDK openai-compatible provider requires a non-empty apiKey string.
    const cfg = toModelConfig(snap({ providerId: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: null }))
    expect(cfg.apiKey).toBe('not-needed')
    expect(cfg.baseUrl).toBe('http://127.0.0.1:1234/v1')
  })
})

describe('agentStorageEnv', () => {
  it('points CLINE_DATA_DIR at the sessions/ dir under the app data root', () => {
    expect(agentStorageEnv('/data/root')).toEqual({ CLINE_DATA_DIR: path.join('/data/root', 'sessions') })
  })
})
