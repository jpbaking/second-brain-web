import { useEffect, useRef, useState } from 'react'

type SearchKind = 'memory' | 'catalog' | 'report'

interface SearchHit {
  path: string
  kind: SearchKind
  title: string
  mtime: string
  snippet: string
}

const KINDS: Array<{ id: 'all' | SearchKind, label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'memory', label: 'Memory' },
  { id: 'report', label: 'Reports' },
  { id: 'catalog', label: 'Catalogue' },
]

export function SearchScreen () {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | SearchKind>('all')
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const debounced = useDebounced(query.trim(), 250)

  useEffect(() => {
    if (debounced === '') {
      setResults([])
      setSearched(false)
      setError(null)
      return
    }
    let active = true
    setLoading(true)
    const params = new URLSearchParams({ q: debounced })
    if (kind !== 'all') params.set('kind', kind)
    fetch(`/api/search?${params.toString()}`)
      .then(async response => {
        if (response.status === 401) return window.location.assign('/login')
        if (!response.ok) throw new Error('Search failed.')
        const body = await response.json() as { results: SearchHit[] }
        if (!active) return
        setResults(body.results)
        setError(null)
        setSearched(true)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Search failed.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debounced, kind])

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <h1 className='app-title'>Search</h1>
        <p className='app-tagline'>Look across your memory, catalogue, and reports.</p>
      </header>

      <main className='action-card stack-3'>
        <div className='report-toolbar'>
          <div className='field report-search'>
            <label className='label' htmlFor='search-q'>Search</label>
            <input id='search-q' className='input' type='search' autoFocus value={query} placeholder='Search the vault…' onChange={event => setQuery(event.target.value)} />
          </div>
          <div className='field'>
            <label className='label' htmlFor='search-kind'>In</label>
            <select id='search-kind' className='select' value={kind} onChange={event => setKind(event.target.value as 'all' | SearchKind)}>
              {KINDS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>
        </div>

        {error !== null && <div className='alert alert-danger' role='alert'><span>{error}</span></div>}
        {loading && <p role='status'>Searching…</p>}
        {!loading && error === null && searched && results.length === 0 && (
          <p className='followup-empty'>No matches for “{debounced}”.</p>
        )}
        {!loading && !searched && query.trim() === '' && (
          <p className='followup-empty'>Type to search across your vault.</p>
        )}
        {results.length > 0 && (
          <ul className='search-list' aria-label={`${results.length} results`}>
            {results.map(hit => (
              <li key={hit.path} className='search-row'>
                <div className='search-main'>
                  <a className='search-title' href={hitHref(hit)} target={hit.kind === 'report' ? '_blank' : undefined} rel={hit.kind === 'report' ? 'noreferrer' : undefined}>
                    {hit.title}
                  </a>
                  <p className='search-snippet'>{renderSnippet(hit.snippet)}</p>
                  <span className='search-path'>{hit.path}</span>
                </div>
                <div className='search-meta'>
                  <span className='badge'>{kindLabel(hit.kind)}</span>
                  <time dateTime={hit.mtime}>{hit.mtime.slice(0, 10)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

/** A report hit opens through the authenticated report endpoint; others just point at their path. */
function hitHref (hit: SearchHit): string {
  if (hit.kind === 'report') {
    const relative = hit.path.replace(/^reports\//, '')
    return `/api/reports/content/${relative.split('/').map(encodeURIComponent).join('/')}`
  }
  return `/search?path=${encodeURIComponent(hit.path)}`
}

/** Split the `[...]`-marked snippet from the API into plain + highlighted spans. */
function renderSnippet (snippet: string) {
  const parts = snippet.split(/\[([^\]]*)\]/)
  return parts.map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>))
}

function kindLabel (kind: SearchKind): string {
  if (kind === 'memory') return 'Memory'
  if (kind === 'report') return 'Report'
  return 'Catalogue'
}

/** Debounce a changing value so we do not fire a request on every keystroke. */
function useDebounced<T> (value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay)
    return () => { if (timer.current !== null) clearTimeout(timer.current) }
  }, [value, delay])
  return debounced
}
