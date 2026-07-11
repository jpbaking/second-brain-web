import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModels } from '../src/providers/models.js'

function mockFetch (status: number, body: unknown, capture?: (url: string, init: RequestInit) => void) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    capture?.(url, init)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listModels', () => {
  it('parses the OpenAI/data shape and sends a Bearer token', async () => {
    let seenUrl = ''
    let seenHeaders: Record<string, string> = {}
    mockFetch(200, { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }, (url, init) => {
      seenUrl = url
      seenHeaders = init.headers as Record<string, string>
    })
    const res = await listModels({ providerId: 'openai', baseUrl: null, apiKey: 'sk-test' })
    expect(res.ok).toBe(true)
    expect(res.models).toEqual(['gpt-4o', 'gpt-4o-mini'])
    expect(seenUrl).toContain('/models')
    expect(seenHeaders.authorization).toBe('Bearer sk-test')
  })

  it('parses the Anthropic data shape with the version header', async () => {
    let seenHeaders: Record<string, string> = {}
    mockFetch(200, { data: [{ id: 'claude-sonnet-4-5' }] }, (_url, init) => {
      seenHeaders = init.headers as Record<string, string>
    })
    const res = await listModels({ providerId: 'anthropic', baseUrl: null, apiKey: 'k' })
    expect(res.models).toEqual(['claude-sonnet-4-5'])
    expect(seenHeaders['x-api-key']).toBe('k')
    expect(seenHeaders['anthropic-version']).toBe('2023-06-01')
  })

  it('strips the models/ prefix from Gemini names', async () => {
    mockFetch(200, { models: [{ name: 'models/gemini-2.5-pro' }, { name: 'models/gemini-2.5-flash' }] })
    const res = await listModels({ providerId: 'gemini', baseUrl: null, apiKey: 'k' })
    expect(res.models).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash'])
  })

  it('honours a custom base URL for openai-compatible', async () => {
    let seenUrl = ''
    mockFetch(200, { data: [{ id: 'local-model' }] }, (url) => { seenUrl = url })
    const res = await listModels({ providerId: 'openai-compatible', baseUrl: 'https://llm.local/v1/', apiKey: 'k' })
    expect(res.models).toEqual(['local-model'])
    expect(seenUrl).toBe('https://llm.local/v1/models')
  })

  it('reports an unauthorised key', async () => {
    mockFetch(401, {})
    const res = await listModels({ providerId: 'openai', baseUrl: null, apiKey: 'bad' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(401)
    expect(res.message).toMatch(/unauthorised/)
  })

  it('reports an empty model list as not ok', async () => {
    mockFetch(200, { data: [] })
    const res = await listModels({ providerId: 'openai', baseUrl: null, apiKey: 'k' })
    expect(res.ok).toBe(false)
    expect(res.models).toEqual([])
    expect(res.message).toMatch(/no models/)
  })
})
