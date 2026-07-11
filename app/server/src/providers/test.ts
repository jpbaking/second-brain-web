import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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

const execFileAsync = promisify(execFile)

interface ClaudeAuthStatus { loggedIn?: unknown, authMethod?: unknown, subscriptionType?: unknown }

async function testClaudeCodeAuth (timeoutMs: number): Promise<ProviderTestResult> {
  try {
    const { stdout } = await execFileAsync('claude', ['auth', 'status', '--json'], {
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
    })
    const status = JSON.parse(stdout) as ClaudeAuthStatus
    if (status.loggedIn === true) {
      const plan = typeof status.subscriptionType === 'string' ? ` (${status.subscriptionType})` : ''
      return { ok: true, status: null, message: `Claude Code is authenticated${plan}.` }
    }
    return { ok: false, status: null, message: 'Claude Code is not authenticated. Run ./compose-helper.sh claude-auth.' }
  } catch {
    return { ok: false, status: null, message: 'Claude Code authentication could not be verified. Run ./compose-helper.sh claude-auth.' }
  }
}

function stripSlash (url: string): string {
  return url.replace(/\/+$/, '')
}

export async function testProvider (input: ProviderTestInput, timeoutMs = 10_000): Promise<ProviderTestResult> {
  if (input.providerId === 'claude-code') return await testClaudeCodeAuth(timeoutMs)

  let url: string
  const headers: Record<string, string> = {}

  if (input.providerId === 'anthropic') {
    url = `${stripSlash(input.baseUrl ?? 'https://api.anthropic.com')}/v1/models`
    if (input.apiKey !== undefined) {
      headers['x-api-key'] = input.apiKey
      headers['anthropic-version'] = '2023-06-01'
    }
  } else if (input.providerId === 'gemini') {
    url = `${stripSlash(input.baseUrl ?? 'https://generativelanguage.googleapis.com')}/v1beta/models`
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
