import { useEffect, useMemo, useState } from 'react'
import { AppHero } from './AppHero.js'

type ReportType = 'html' | 'pdf' | 'markdown'

interface ReportMetadata {
  path: string
  title: string
  type: ReportType
  year: number | null
  date: string
  mtime: string
  bytes: number
  provenance?: {
    sessionId: string
    prompt: string | null
    providerProfileId: string | null
    vaultCommit: string | null
    createdAt: string
  }
}

export function ReportsScreen () {
  const [reports, setReports] = useState<ReportMetadata[]>([])
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [type, setType] = useState<'all' | ReportType>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)

  const regenerate = async (path: string) => {
    setRegenerating(path)
    try {
      const response = await fetch(`/api/reports/regenerate/${encodeReportPath(path)}`, { method: 'POST' })
      if (response.status === 401) return window.location.assign('/login')
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to regenerate report.')
      }
      const data = await response.json() as { sessionId: string }
      window.location.assign(`/chat/${data.sessionId}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error regenerating report')
      setRegenerating(null)
    }
  }

  useEffect(() => {
    fetch('/api/reports')
      .then(async response => {
        if (response.status === 401) return window.location.assign('/login')
        if (!response.ok) throw new Error('Could not load reports.')
        const body = await response.json() as { reports: ReportMetadata[] }
        setReports(body.reports)
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load reports.'))
      .finally(() => setLoading(false))
  }, [])

  const years = useMemo(() => Array.from(new Set(reports.flatMap(report => report.year === null ? [] : [report.year]))).sort((a, b) => b - a), [reports])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return reports.filter(report => {
      if (year !== 'all' && report.year !== Number(year)) return false
      if (type !== 'all' && report.type !== type) return false
      return needle === '' || report.title.toLocaleLowerCase().includes(needle) || report.path.toLocaleLowerCase().includes(needle)
    })
  }, [query, reports, type, year])

  return (
    <div className='app-page'>
      <AppHero title='Reports' tagline='Generated reviews and briefings from your vault.' />

      <main className='action-card stack-3'>
        <div className='report-toolbar'>
          <div className='field report-search'>
            <label className='label' htmlFor='report-search'>Search</label>
            <input id='report-search' className='input' type='search' value={query} onChange={event => setQuery(event.target.value)} />
          </div>
          <div className='field'>
            <label className='label' htmlFor='report-year'>Year</label>
            <select id='report-year' className='select' value={year} onChange={event => setYear(event.target.value)}>
              <option value='all'>All years</option>
              {years.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className='field'>
            <label className='label' htmlFor='report-type'>Type</label>
            <select id='report-type' className='select' value={type} onChange={event => setType(event.target.value as 'all' | ReportType)}>
              <option value='all'>All types</option>
              <option value='html'>HTML</option>
              <option value='pdf'>PDF</option>
              <option value='markdown'>Markdown</option>
            </select>
          </div>
        </div>

        {error !== null && <div className='alert alert-danger' role='alert'><span>{error}</span></div>}
        {loading && <p role='status'>Loading reports…</p>}
        {!loading && error === null && filtered.length === 0 && <p className='report-empty'>No reports match the current filters.</p>}
        {filtered.length > 0 && (
          <ul className='report-list' aria-label={`${filtered.length} reports`}>
            {filtered.map(report => (
              <li key={report.path} className='report-row'>
                <div className='report-main'>
                  <span className='report-title'>{report.title}</span>
                  <span className='report-path'>{report.path}</span>
                </div>
                <span className='badge'>{labelFor(report.type)}</span>
                <time dateTime={report.date}>{report.date}</time>
                <span className='report-size'>{formatBytes(report.bytes)}</span>
                <a
                  className='btn btn-secondary btn-sm report-action'
                  href={`/api/reports/content/${encodeReportPath(report.path)}`}
                  target={report.type === 'html' ? '_blank' : undefined}
                  rel={report.type === 'html' ? 'noreferrer' : undefined}
                  download={report.type === 'html' ? undefined : ''}
                >
                  {report.type === 'html' ? 'Open' : 'Download'}
                </a>
                {report.provenance !== undefined && (
                  <button
                    className='btn btn-primary btn-sm report-action'
                    disabled={regenerating === report.path}
                    onClick={() => regenerate(report.path)}
                  >
                    {regenerating === report.path ? '...' : 'Regenerate'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function encodeReportPath (value: string): string {
  return value.split('/').map(encodeURIComponent).join('/')
}

function labelFor (type: ReportType): string {
  return type === 'markdown' ? 'MD' : type.toUpperCase()
}

function formatBytes (bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
