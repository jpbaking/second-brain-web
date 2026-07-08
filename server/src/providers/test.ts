/**
 * Provider connectivity test (phase-004 Provider Settings UX). Sends a minimal,
 * read-only request to the configured endpoint to confirm the key and base URL
 * work. Never includes the API key in the returned message.
 */

export interface ProviderTestInput {
  providerId: string
  baseUrl: string | null
  modelId: string
  apiKey?: string
}

export interface ProviderTestResult {
  ok: boolean
  status: number | null
  message: string
}

function stripSlash (url: string): string {
  return url.replace(/\/+$/, '')
}

export async function testProvider (input: ProviderTestInput, timeoutMs = 10_000): Promise<ProviderTestResult> {
  let url: string
  const headers: Record<string, string> = {}

  if (input.providerId === 'anthropic') {
    url = `${stripSlash(input.baseUrl ?? 'https://api.anthropic.com')}/v1/models`
    if (input.apiKey !== undefined) {
      headers['x-api-key'] = input.apiKey
      headers['anthropic-version'] = '2023-06-01'
    }
  } else {
    // openai and openai-compatible both speak the OpenAI REST shape.
    url = `${stripSlash(input.baseUrl ?? 'https://api.openai.com/v1')}/models`
    if (input.apiKey !== undefined) headers.authorization = `Bearer ${input.apiKey}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (res.ok) return { ok: true, status: res.status, message: 'Provider responded successfully.' }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: 'Provider rejected the API key (unauthorised).' }
    }
    return { ok: false, status: res.status, message: `Provider returned HTTP ${res.status}.` }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error'
    return { ok: false, status: null, message: `Could not reach the provider: ${detail}` }
  } finally {
    clearTimeout(timer)
  }
}
