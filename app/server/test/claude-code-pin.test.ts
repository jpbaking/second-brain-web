import { describe, expect, it } from 'vitest'
import { hasRegisteredHandler, isRegisteredHandlerAsync } from '@cline/llms'
import { pinnedClaudeCodeConfig, registerClaudeCodeInferencePin } from '../src/agent/claude-code-pin.js'

describe('pinnedClaudeCodeConfig', () => {
  it('routes to the builtin under a non-registered id with CLI tools pinned off', () => {
    const pinned = pinnedClaudeCodeConfig({ providerId: 'claude-code', modelId: 'sonnet', apiKey: undefined })
    expect(pinned.providerId).not.toBe('claude-code')
    expect(pinned.routingProviderId).toBe('claude-code')
    expect(pinned.claudeCode).toEqual({ defaultSettings: { tools: [], settingSources: [] } })
    expect(pinned.modelId).toBe('sonnet')
  })

  it('overrides any incoming claudeCode settings rather than merging them in', () => {
    const pinned = pinnedClaudeCodeConfig({
      providerId: 'claude-code',
      claudeCode: { defaultSettings: { tools: ['Write'], settingSources: ['project'] } },
    })
    expect(pinned.claudeCode.defaultSettings.tools).toEqual([])
    expect(pinned.claudeCode.defaultSettings.settingSources).toEqual([])
  })
})

describe('registerClaudeCodeInferencePin', () => {
  it('registers an async claude-code handler exactly once', () => {
    expect(hasRegisteredHandler('claude-code')).toBe(false)
    registerClaudeCodeInferencePin()
    expect(hasRegisteredHandler('claude-code')).toBe(true)
    expect(isRegisteredHandlerAsync('claude-code')).toBe(true)
    // Idempotent: a second call must not throw on duplicate registration.
    registerClaudeCodeInferencePin()
    expect(hasRegisteredHandler('claude-code')).toBe(true)
  })
})
