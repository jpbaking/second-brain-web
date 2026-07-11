import { parse, stringify } from 'yaml'

/**
 * Pure helpers for the interactive `configure` CLI (milestone 34). Kept free of
 * I/O and prompts so they can be unit-tested: `.env` and `providers.yaml` are
 * parsed into plain objects, edited, and serialised back — preserving unknown
 * `.env` keys and untouched provider entries by value.
 */

// ---- providers --------------------------------------------------------------

export const KNOWN_PROVIDERS = ['anthropic', 'gemini', 'openai', 'openai-compatible'] as const

/** One provider profile, mirroring the fields provisioning.ts accepts. */
export interface ProviderEntry {
  display_name?: string
  provider: string
  model: string
  base_url?: string
  /** `v1:` ciphertext produced by encryptSecret; never plaintext. */
  key?: string
  enabled?: boolean
}

export type ProviderMap = Record<string, ProviderEntry>

/** Parse a providers.yaml document into its provider map (empty when absent). */
export function parseProviders (text: string): ProviderMap {
  if (text.trim() === '') return {}
  const doc = parse(text) as unknown
  if (doc === null || typeof doc !== 'object') return {}
  const providers = (doc as { providers?: unknown }).providers
  if (providers === null || providers === undefined || typeof providers !== 'object') return {}
  return providers as ProviderMap
}

/** Serialise a provider map back into a providers.yaml document. */
export function serializeProviders (map: ProviderMap): string {
  if (Object.keys(map).length === 0) return 'providers:\n  {}\n'
  // Re-emit each entry's fields in the documented order for a tidy, stable file.
  const ordered: ProviderMap = {}
  for (const [id, entry] of Object.entries(map)) {
    ordered[id] = {
      ...(entry.display_name !== undefined ? { display_name: entry.display_name } : {}),
      provider: entry.provider,
      model: entry.model,
      ...(entry.base_url !== undefined ? { base_url: entry.base_url } : {}),
      ...(entry.key !== undefined ? { key: entry.key } : {}),
      ...(entry.enabled !== undefined ? { enabled: entry.enabled } : {}),
    }
  }
  return stringify({ providers: ordered })
}

/** Short one-line description of a provider for menus. */
export function providerSummary (id: string, entry: ProviderEntry): string {
  const parts = [entry.provider, entry.model]
  return `${id}  (${parts.join(' / ')})`
}

export function isValidProviderId (id: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(id)
}

export function isValidProvider (provider: string): boolean {
  return (KNOWN_PROVIDERS as readonly string[]).includes(provider)
}

/** Lowercase, hyphenate, and trim a string into a valid-ish config key. */
export function slugify (value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---- .env -------------------------------------------------------------------

export interface EnvEntry { key: string, value: string }

/**
 * Parse a `.env` into ordered KEY=VALUE entries. Comments and blank lines are
 * dropped (we do not round-trip comments); unknown keys are preserved. On a
 * duplicate key the last value wins but the first position is kept.
 */
export function parseEnv (text: string): EnvEntry[] {
  const order: string[] = []
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (m === null) continue
    const [, key, value] = m
    if (key === undefined || value === undefined) continue
    if (!values.has(key)) order.push(key)
    values.set(key, value)
  }
  return order.map(key => ({ key, value: values.get(key) as string }))
}

export function getEnv (entries: EnvEntry[], key: string): string | undefined {
  return entries.find(e => e.key === key)?.value
}

/** Set a key (updating in place, or appending when new). Mutates and returns. */
export function setEnv (entries: EnvEntry[], key: string, value: string): EnvEntry[] {
  const existing = entries.find(e => e.key === key)
  if (existing !== undefined) existing.value = value
  else entries.push({ key, value })
  return entries
}

export function serializeEnv (entries: EnvEntry[]): string {
  return entries.map(e => `${e.key}=${e.value}`).join('\n') + '\n'
}

// ---- runtime settings -------------------------------------------------------

export const DEFAULT_BIND = '127.0.0.1'
export const DEFAULT_PORT = '8722'

export function isValidPort (value: string): boolean {
  if (!/^\d+$/.test(value)) return false
  const n = Number(value)
  return n >= 1 && n <= 65535
}
