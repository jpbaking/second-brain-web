import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyWebToolsRegistration } from '../src/agent/web-tools-registration.js'

describe('applyWebToolsRegistration', () => {
  let dir: string
  let settingsPath: string
  const scriptPath = '/opt/app/server/dist/agent/web-tools-mcp.js'

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sbw-mcp-'))
    settingsPath = path.join(dir, 'settings', 'cline_mcp_settings.json')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  const read = (): Record<string, any> => JSON.parse(readFileSync(settingsPath, 'utf8'))

  it('creates the settings file with a stdio registration', () => {
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: 'http://searxng:8080' })
    const servers = read().mcpServers
    expect(servers.web.transport).toEqual({
      type: 'stdio',
      command: process.execPath,
      args: [scriptPath],
      env: { SEARXNG_URL: 'http://searxng:8080' },
    })
  })

  it('preserves other registered servers and unrelated settings', () => {
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: 'http://a' })
    const before = read()
    before.mcpServers.other = { transport: { type: 'sse', url: 'https://x.example/sse' } }
    before.extra = { keep: true }
    writeFileSync(settingsPath, JSON.stringify(before))
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: 'http://b' })
    const after = read()
    expect(after.mcpServers.other.transport.url).toBe('https://x.example/sse')
    expect(after.extra).toEqual({ keep: true })
    expect(after.mcpServers.web.transport.env.SEARXNG_URL).toBe('http://b')
  })

  it('removes a stale registration when the URL is unset', () => {
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: 'http://searxng:8080' })
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: undefined })
    expect(read().mcpServers).toEqual({})
  })

  it('writes nothing when the URL is unset and no file exists', () => {
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: '' })
    expect(() => readFileSync(settingsPath)).toThrow()
  })

  it('recovers from a corrupt settings file', () => {
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: 'http://a' })
    writeFileSync(settingsPath, 'not json {')
    applyWebToolsRegistration({ settingsPath, scriptPath, searxngUrl: 'http://a' })
    expect(read().mcpServers.web.transport.env.SEARXNG_URL).toBe('http://a')
  })
})
