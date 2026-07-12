import { useEffect, useMemo, useState } from 'react'
import { AppHero } from './AppHero.js'

interface ExplorerEdge { from: string, to: string, label: string }
interface ExplorerNode { path: string, area: string, degree: number }
interface ExplorerGraph { areas: string[], nodes: ExplorerNode[], edges: ExplorerEdge[] }
interface ExplorerNodeDetail {
  path: string
  area: string
  title: string
  exists: boolean
  preview: string
  outgoing: Array<{ to: string, label: string }>
  incoming: Array<{ from: string, label: string }>
}

export function ExplorerScreen () {
  const [graph, setGraph] = useState<ExplorerGraph>({ areas: [], nodes: [], edges: [] })
  const [area, setArea] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<ExplorerNodeDetail | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = area === 'all' ? '' : `?area=${encodeURIComponent(area)}`
    fetch(`/api/explorer${params}`)
      .then(async response => {
        if (response.status === 401) return window.location.assign('/login')
        if (!response.ok) throw new Error('Could not load the explorer.')
        const body = await response.json() as ExplorerGraph
        if (!active) return
        setGraph(body)
        setError(null)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the explorer.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [area])

  useEffect(() => {
    if (selected === null) { setDetail(null); return }
    let active = true
    setDetail(null)
    fetch(`/api/explorer/node?path=${encodeURIComponent(selected)}`)
      .then(async response => {
        if (response.status === 401) return window.location.assign('/login')
        if (!response.ok) throw new Error('Could not load that page.')
        const body = await response.json() as ExplorerNodeDetail
        if (active) setDetail(body)
      })
      .catch(() => { if (active) setDetail(null) })
    return () => { active = false }
  }, [selected])

  // Outgoing links per node, so each node shows what it points at.
  const outgoing = useMemo(() => {
    const map = new Map<string, ExplorerEdge[]>()
    for (const edge of graph.edges) {
      const list = map.get(edge.from) ?? []
      list.push(edge)
      map.set(edge.from, list)
    }
    return map
  }, [graph.edges])

  // Most-connected first, so the hubs of the vault surface at the top.
  const nodes = useMemo(() => [...graph.nodes].sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path)), [graph.nodes])

  return (
    <div className='app-page'>
      <AppHero title='Explorer' tagline='How the pages in your vault link to one another.' />

      <main className='action-card stack-3'>
        <div className='report-toolbar'>
          <div className='field report-search'>
            <label className='label' htmlFor='explorer-area'>Area</label>
            <select id='explorer-area' className='select' value={area} onChange={event => setArea(event.target.value)}>
              <option value='all'>All areas</option>
              {graph.areas.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <p className='explorer-summary'>{graph.nodes.length} pages · {graph.edges.length} links</p>
        </div>

        {selected !== null && (
          <section className='explorer-detail' aria-label='Page detail'>
            {detail === null
              ? <p role='status'>Loading page…</p>
              : (
                <>
                  <div className='explorer-detail-head'>
                    <div>
                      <span className='explorer-detail-title'>{detail.title}</span>
                      <span className='explorer-path'>{detail.path}</span>
                    </div>
                    <button type='button' className='btn btn-quiet btn-sm' onClick={() => setSelected(null)}>Close</button>
                  </div>
                  {!detail.exists && <p className='explorer-missing'>This page is linked but does not exist yet.</p>}
                  {detail.preview !== '' && <p className='explorer-detail-preview'>{detail.preview}</p>}
                  <div className='explorer-detail-links'>
                    <div>
                      <h3 className='explorer-detail-heading'>Links to ({detail.outgoing.length})</h3>
                      {detail.outgoing.length === 0
                        ? <p className='explorer-missing'>Nothing.</p>
                        : (
                          <ul className='explorer-links'>
                            {detail.outgoing.map(edge => (
                              <li key={`out:${edge.to}:${edge.label}`} className='explorer-link'>
                                → <button type='button' className='explorer-jump' onClick={() => setSelected(edge.to)}>{titleOf(edge.to)}</button> <span className='explorer-link-label'>{edge.label}</span>
                              </li>
                            ))}
                          </ul>
                          )}
                    </div>
                    <div>
                      <h3 className='explorer-detail-heading'>Linked from ({detail.incoming.length})</h3>
                      {detail.incoming.length === 0
                        ? <p className='explorer-missing'>Nothing.</p>
                        : (
                          <ul className='explorer-links'>
                            {detail.incoming.map(edge => (
                              <li key={`in:${edge.from}:${edge.label}`} className='explorer-link'>
                                ← <button type='button' className='explorer-jump' onClick={() => setSelected(edge.from)}>{titleOf(edge.from)}</button> <span className='explorer-link-label'>{edge.label}</span>
                              </li>
                            ))}
                          </ul>
                          )}
                    </div>
                  </div>
                </>
                )}
          </section>
        )}

        {error !== null && <div className='alert alert-danger' role='alert'><span>{error}</span></div>}
        {loading && <p role='status'>Loading explorer…</p>}
        {!loading && error === null && nodes.length === 0 && (
          <p className='followup-empty'>No links found yet. Reindex from Search after adding linked notes.</p>
        )}
        {nodes.length > 0 && (
          <ul className='explorer-list' aria-label={`${nodes.length} pages`}>
            {nodes.map(node => (
              <li key={node.path} className='explorer-row'>
                <div className='explorer-main'>
                  <button type='button' className='explorer-title' onClick={() => setSelected(node.path)}>{titleOf(node.path)}</button>
                  <span className='explorer-path'>{node.path}</span>
                  {(outgoing.get(node.path) ?? []).length > 0 && (
                    <ul className='explorer-links'>
                      {(outgoing.get(node.path) ?? []).map(edge => (
                        <li key={`${edge.to}:${edge.label}`} className='explorer-link'>
                          → <span className='explorer-link-target'>{titleOf(edge.to)}</span> <span className='explorer-link-label'>{edge.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className='explorer-meta'>
                  <span className='badge'>{node.area}</span>
                  <span className='explorer-degree'>{node.degree} link{node.degree === 1 ? '' : 's'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

/** A readable title from a vault path: the file name without extension, spaced. */
function titleOf (filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.[^.]+$/, '').replaceAll(/[-_]+/g, ' ')
}
