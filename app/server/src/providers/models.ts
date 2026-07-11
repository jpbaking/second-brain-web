/**
 * List the models a provider offers (used by the `configure` helper's model
 * picker). Hits the same read-only endpoints as the connectivity Test
 * (`providers/test.ts`) and parses the model ids out of each provider's
 * response shape. The API key is only sent to the provider, never returned.
 */

export interface ListModelsInput {
  providerId: string
  baseUrl: string | null
  apiKey?: string
}

export interface ListModelsResult {
  ok: boolean
  status: number | null
  models: string[]
  message: string
}

function stripSlash (url: string): string {
  return url.replace(/\/+$/, '')
}

/** Pull a string array of model ids out of an arbitrary JSON body. */
function parseModels (providerId: string, body: unknown): string[] {
  if (body === null || typeof body !== 'object') return []

  if (providerId === 'gemini') {
    const models = (body as { models?: unknown }).models
    if (!Array.isArray(models)) return []
    return models
      .map(m => (m !== null && typeof m === 'object' ? (m as { name?: unknown }).name : undefined))
      .filter((n): n is string => typeof n === 'string')
      // Gemini reports `models/gemini-...`; the config expects the bare id.
      .map(n => n.replace(/^models\//, ''))
  }

  // anthropic and the OpenAI shape both return { data: [{ id }] }.
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  return data
    .map(m => (m !== null && typeof m === 'object' ? (m as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string')
}

export async function listModels (input: ListModelsInput, timeoutMs = 10_000): Promise<ListModelsResult> {
  let url: string
  const headers: Record<string, string> = {}

  if (input.providerId === 'anthropic') {
    url = `${stripSlash(input.baseUrl ?? 'https://api.anthropic.com')}/v1/models?limit=1000`
    if (input.apiKey !== undefined) {
      headers['x-api-key'] = input.apiKey
      headers['anthropic-version'] = '2023-06-01'
    }
  } else if (input.providerId === 'gemini') {
    url = `${stripSlash(input.baseUrl ?? 'https://generativelanguage.googleapis.com')}/v1beta/models?pageSize=1000`
    if (input.apiKey !== undefined) headers['x-goog-api-key'] = input.apiKey
  } else {
    // openai and openai-compatible both speak the OpenAI REST shape.
    url = `${stripSlash(input.baseUrl ?? 'https://api.openai.com/v1')}/models`
    if (input.apiKey !== undefined) headers.authorization = `Bearer ${input.apiKey}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, models: [], message: 'Provider rejected the API key (unauthorised).' }
      }
      return { ok: false, status: res.status, models: [], message: `Provider returned HTTP ${res.status}.` }
    }
    const body = await res.json().catch(() => null)
    const models = parseModels(input.providerId, body)
    if (models.length === 0) {
      return { ok: false, status: res.status, models: [], message: 'Provider returned no models.' }
    }
    return { ok: true, status: res.status, models, message: `Found ${models.length} model(s).` }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error'
    return { ok: false, status: null, models: [], message: `Could not reach the provider: ${detail}` }
  } finally {
    clearTimeout(timer)
  }
}
