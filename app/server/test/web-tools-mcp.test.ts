import { describe, expect, it } from 'vitest'
import { FETCH_CHAR_CAP, extractText, formatSearchResults, runFetch, runSearch } from '../src/agent/web-tools-mcp.js'
import type { FetchLike } from '../src/agent/web-tools-mcp.js'

function fakeResponse (body: string, init?: { status?: number, contentType?: string }): Awaited<ReturnType<FetchLike>> {
  const status = init?.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? init?.contentType ?? null : null) },
    text: async () => body,
  }
}

describe('formatSearchResults', () => {
  it('renders a numbered list with title, url and collapsed snippet', () => {
    const out = formatSearchResults({
      results: [
        { title: 'One', url: 'https://a.example', content: 'first  \n snippet' },
        { title: 'Two', url: 'https://b.example', content: '' },
      ],
    }, 8)
    expect(out).toBe('1. One\n   https://a.example\n   first snippet\n2. Two\n   https://b.example')
  })

  it('caps the number of results', () => {
    const results = Array.from({ length: 5 }, (_, i) => ({ title: `R${i}`, url: `https://e/${i}` }))
    const out = formatSearchResults({ results }, 2)
    expect(out).toContain('R1')
    expect(out).not.toContain('R2')
  })

  it('handles empty and malformed payloads', () => {
    expect(formatSearchResults({ results: [] }, 8)).toBe('No results.')
    expect(formatSearchResults({}, 8)).toBe('No results.')
    expect(formatSearchResults(null, 8)).toBe('No results.')
  })
})

describe('extractText', () => {
  it('drops scripts/styles, keeps text, decodes entities', () => {
    const html = '<html><head><title>T</title><style>a{}</style></head><body>' +
      '<script>var x = "<p>hi</p>"</script><h1>Header &amp; more</h1><p>Body &#233; text</p></body></html>'
    const out = extractText(html)
    expect(out).toContain('Header & more')
    expect(out).toContain('Body é text')
    expect(out).not.toContain('var x')
    expect(out).not.toContain('a{}')
  })

  it('keeps link labels with their targets and formats list items', () => {
    const out = extractText('<ul><li><a href="https://x.example/page">Docs</a></li><li>plain</li></ul>')
    expect(out).toContain('Docs (https://x.example/page)')
    expect(out).toContain('- plain')
  })

  it('drops fragment and javascript links but keeps the label', () => {
    const out = extractText('<a href="#top">Back</a> and <a href="javascript:void(0)">Click</a>')
    expect(out).toContain('Back')
    expect(out).toContain('Click')
    expect(out).not.toContain('#top')
    expect(out).not.toContain('javascript:')
  })

  it('turns block boundaries into newlines and collapses blank runs', () => {
    const out = extractText('<p>one</p><div>two</div>\n\n\n<p>three</p>')
    expect(out.split('\n').filter((l) => l !== '')).toEqual(['one', 'two', 'three'])
    expect(out).not.toMatch(/\n{3,}/)
  })
})

describe('runSearch', () => {
  it('queries the JSON API and formats results', async () => {
    let seen = ''
    const fetchImpl: FetchLike = async (url) => {
      seen = url
      return fakeResponse(JSON.stringify({ results: [{ title: 'Hit', url: 'https://h.example', content: 'snip' }] }))
    }
    const out = await runSearch('http://searxng:8080/', 'hello world', 8, fetchImpl)
    expect(seen).toBe('http://searxng:8080/search?q=hello%20world&format=json')
    expect(out).toContain('Hit')
  })

  it('throws on non-2xx responses', async () => {
    const fetchImpl: FetchLike = async () => fakeResponse('nope', { status: 429 })
    await expect(runSearch('http://searxng:8080', 'q', 8, fetchImpl)).rejects.toThrow('HTTP 429')
  })
})

describe('runFetch', () => {
  it('extracts text from HTML responses', async () => {
    const fetchImpl: FetchLike = async () => fakeResponse('<p>Hello <b>web</b></p>', { contentType: 'text/html; charset=utf-8' })
    expect(await runFetch('https://x.example/a', fetchImpl)).toBe('Hello web')
  })

  it('passes plain text and JSON through unchanged', async () => {
    const fetchImpl: FetchLike = async () => fakeResponse('{"a":1}', { contentType: 'application/json' })
    expect(await runFetch('https://x.example/a.json', fetchImpl)).toBe('{"a":1}')
  })

  it('rejects non-http(s) URLs and unsupported content types', async () => {
    await expect(runFetch('ftp://x.example/f')).rejects.toThrow('http/https')
    await expect(runFetch('not a url')).rejects.toThrow('valid URL')
    const fetchImpl: FetchLike = async () => fakeResponse('...', { contentType: 'application/pdf' })
    await expect(runFetch('https://x.example/f.pdf', fetchImpl)).rejects.toThrow('content-type')
  })

  it('truncates oversized pages', async () => {
    const fetchImpl: FetchLike = async () => fakeResponse('x'.repeat(FETCH_CHAR_CAP + 100), { contentType: 'text/plain' })
    const out = await runFetch('https://x.example/big', fetchImpl)
    expect(out.length).toBeLessThan(FETCH_CHAR_CAP + 100)
    expect(out).toContain('[truncated')
  })
})
