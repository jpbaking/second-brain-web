import { getGeneratedModelsForProvider } from '@cline/llms'

/**
 * Reasoning capabilities for a profile's model (milestone 50), resolved from
 * the Cline SDK's generated model catalog. `null` means the catalog does not
 * know the model (LM Studio and other openai-compatible gateways are
 * uncatalogued) — the UI treats unknown as "offer the controls anyway".
 */
export interface ReasoningCapabilities {
  /** Model accepts a thinking/reasoning request; null = unknown. */
  supported: boolean | null
  /** Model accepts an explicit reasoning-effort level; null = unknown. */
  effort: boolean | null
}

/** Our m05 provider id → the catalog's provider id. The claude-code CLI runs
 *  Anthropic models, so it resolves against the anthropic catalog. */
const CATALOG_PROVIDER: Record<string, string> = {
  anthropic: 'anthropic',
  'claude-code': 'anthropic',
  gemini: 'gemini',
  openai: 'openai-native',
}

export function modelReasoningCapabilities (providerId: string, modelId: string): ReasoningCapabilities {
  const catalogProvider = CATALOG_PROVIDER[providerId]
  if (catalogProvider === undefined) return { supported: null, effort: null }
  const models = getGeneratedModelsForProvider(catalogProvider)
  const info = models[modelId] as { capabilities?: string[] } | undefined
  if (info === undefined) return { supported: null, effort: null }
  const capabilities = info.capabilities ?? []
  return {
    supported: capabilities.includes('reasoning') || capabilities.includes('reasoning-effort'),
    effort: capabilities.includes('reasoning-effort'),
  }
}
