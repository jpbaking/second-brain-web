import { pathToFileURL } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

/**
 * Stdio MCP server giving the chat agent web access (milestone 48). Runs as a
 * child process of the Cline SDK (registered in cline_mcp_settings.json by
 * cline-runner.ts), so the agent sees two extra tools:
 *
 * - `web__search` — query the compose-internal SearXNG instance (JSON API)
 * - `web__fetch`  — fetch a URL and reduce its HTML to readable text
 *
 * SEARXNG_URL is injected via the registration env. Both tools are read-only
 * network operations; tool-policy.ts auto-approves them.
 */

export const MAX_RESULTS_DEFAULT = 8
export const MAX_RESULTS_CAP = 20
/** Fetched pages are cut to this many characters after extraction. */
export const FETCH_CHAR_CAP = 40_000
const FETCH_TIMEOUT_MS = 20_000

interface SearxResult {
  title?: string
  url?: string
  content?: string
}

/** Render SearXNG's JSON response as a compact numbered list for the model. */
export function formatSearchResults (payload: unknown, maxResults: number): string {
  const results = (payload as { results?: SearxResult[] })?.results
  if (!Array.isArray(results) || results.length === 0) return 'No results.'
  const lines: string[] = []
  for (const [i, r] of results.slice(0, maxResults).entries()) {
    const title = (r.title ?? '').trim() || '(untitled)'
    const url = (r.url ?? '').trim()
    const snippet = (r.content ?? '').replace(/\s+/g, ' ').trim()
    lines.push(`${i + 1}. ${title}\n   ${url}${snippet === '' ? '' : `\n   ${snippet}`}`)
  }
  return lines.join('\n')
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©',
}

function decodeEntities (text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * Reduce an HTML document to readable text without a DOM: drop non-content
 * subtrees (script/style/svg/head…), turn block boundaries into newlines,
 * strip the remaining tags, decode entities, and collapse whitespace.
 */
export function extractText (html: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  // Preserve link targets so the agent can follow references.
  text = text.replace(/<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_whole, _q, dq: string | undefined, sq: string | undefined, label: string) => {
      const href = (dq ?? sq ?? '').trim()
      const inner = label.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (href === '' || href.startsWith('#') || href.startsWith('javascript:')) return ` ${inner} `
      return inner === '' ? ` ${href} ` : ` ${inner} (${href}) `
    })
  text = text
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/blockquote|\/pre)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/t[dh]\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
  text = decodeEntities(text)
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal, redirect?: 'follow', headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  headers: { get: (name: string) => string | null }
  text: () => Promise<string>
}>

export async function runSearch (searxngUrl: string, query: string, maxResults: number, fetchImpl: FetchLike = fetch): Promise<string> {
  const capped = Math.max(1, Math.min(MAX_RESULTS_CAP, Math.floor(maxResults)))
  const url = `${searxngUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`SearXNG returned HTTP ${res.status}`)
  return formatSearchResults(JSON.parse(await res.text()), capped)
}

export async function runFetch (rawUrl: string, fetchImpl: FetchLike = fetch): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http/https URLs are supported (got ${parsed.protocol})`)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'second-brain-web/1.0 (chat web_fetch tool)', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${parsed.toString()}`)
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    const body = await res.text()
    let out: string
    if (contentType.includes('html')) out = extractText(body)
    else if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml') || contentType === '') out = body
    else throw new Error(`Unsupported content-type "${contentType}" — only HTML, text, JSON and XML pages can be fetched`)
    if (out.length > FETCH_CHAR_CAP) out = `${out.slice(0, FETCH_CHAR_CAP)}\n\n[truncated at ${FETCH_CHAR_CAP} characters]`
    return out
  } finally {
    clearTimeout(timer)
  }
}

const TOOLS = [
  {
    name: 'search',
    description: 'Search the web (self-hosted SearXNG metasearch). Returns a numbered list of results with title, URL and snippet. Use web__fetch to read a result.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        max_results: { type: 'number', description: `How many results to return (default ${MAX_RESULTS_DEFAULT}, max ${MAX_RESULTS_CAP})` },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch',
    description: 'Fetch a web page by URL and return its readable text content (HTML is reduced to text; links kept as "label (url)"). Truncated to 40k characters.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The http(s) URL to fetch' },
      },
      required: ['url'],
    },
  },
]

export async function main (): Promise<void> {
  const searxngUrl = process.env.SEARXNG_URL
  const server = new Server({ name: 'web', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>
    try {
      let text: string
      if (req.params.name === 'search') {
        if (searxngUrl === undefined || searxngUrl === '') throw new Error('SEARXNG_URL is not configured')
        const query = typeof args.query === 'string' ? args.query : ''
        if (query.trim() === '') throw new Error('query is required')
        const max = typeof args.max_results === 'number' ? args.max_results : MAX_RESULTS_DEFAULT
        text = await runSearch(searxngUrl, query, max)
      } else if (req.params.name === 'fetch') {
        const url = typeof args.url === 'string' ? args.url : ''
        if (url.trim() === '') throw new Error('url is required')
        text = await runFetch(url)
      } else {
        throw new Error(`Unknown tool: ${req.params.name}`)
      }
      return { content: [{ type: 'text', text }] }
    } catch (err) {
      return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true }
    }
  })
  await server.connect(new StdioServerTransport())
}

// Started as a standalone process by the Cline SDK; never auto-runs on import
// (tests import the pure helpers above).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
