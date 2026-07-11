import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Keep the "web" MCP server (web-tools-mcp.ts) registered in the Cline SDK's
 * MCP settings file (milestone 48). The SDK loads this file on every session
 * start when tools are enabled, spawning the stdio server and exposing its
 * tools as web__search / web__fetch.
 *
 * Called once from ClineAgentRunner.ensureCore, after CLINE_DATA_DIR is set —
 * the file lives at `<CLINE_DATA_DIR>/settings/cline_mcp_settings.json`. A
 * single writer at startup needs no locking. With no SearXNG URL configured
 * the entry is removed so a previously written registration does not linger.
 */
export function applyWebToolsRegistration (input: {
  settingsPath: string
  /** Absolute path to the compiled web-tools-mcp.js. */
  scriptPath: string
  /** SECOND_BRAIN_WEB_SEARXNG_URL; undefined/empty disables the tools. */
  searxngUrl: string | undefined
}): void {
  let settings: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(input.settingsPath, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed as Record<string, unknown>
  } catch {
    // Missing or corrupt file: start from scratch.
  }
  const rawServers = settings.mcpServers
  const servers: Record<string, unknown> =
    rawServers !== null && typeof rawServers === 'object' && !Array.isArray(rawServers)
      ? rawServers as Record<string, unknown>
      : {}

  const url = input.searxngUrl?.trim()
  if (url === undefined || url === '') {
    if (!('web' in servers)) return
    delete servers.web
  } else {
    servers.web = {
      transport: {
        type: 'stdio',
        command: process.execPath,
        args: [input.scriptPath],
        env: { SEARXNG_URL: url },
      },
    }
  }
  settings.mcpServers = servers
  mkdirSync(path.dirname(input.settingsPath), { recursive: true })
  writeFileSync(input.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}
