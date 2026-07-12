import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AppHero } from './AppHero.js'

interface ExplorerEntry { name: string, path: string, kind: 'dir' | 'file', size: number }
interface ExplorerTree { path: string, entries: ExplorerEntry[] }
interface ExplorerFile {
  path: string
  title: string
  size: number
  kind: 'markdown' | 'text' | 'binary'
  content: string
  truncated: boolean
}

export function ExplorerScreen () {
  const [dir, setDir] = useState('')
  const [tree, setTree] = useState<ExplorerTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [file, setFile] = useState<ExplorerFile | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = dir === '' ? '' : `?path=${encodeURIComponent(dir)}`
    fetch(`/api/explorer/tree${params}`)
      .then(async response => {
        if (response.status === 401) return window.location.assign('/login')
        if (!response.ok) throw new Error('Could not load that folder.')
        const body = await response.json() as ExplorerTree
        if (!active) return
        setTree(body)
        setError(null)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load that folder.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [dir])

  useEffect(() => {
    if (selected === null) { setFile(null); return }
    let active = true
    setFile(null)
    fetch(`/api/explorer/file?path=${encodeURIComponent(selected)}`)
      .then(async response => {
        if (response.status === 401) return window.location.assign('/login')
        if (!response.ok) throw new Error('Could not load that file.')
        const body = await response.json() as ExplorerFile
        if (active) setFile(body)
      })
      .catch(() => { if (active) setFile(null) })
    return () => { active = false }
  }, [selected])

  const openDir = (path: string) => { setDir(path); setSelected(null) }
  const crumbs = dir === '' ? [] : dir.split('/')

  return (
    <div className='app-page'>
      <AppHero title='Explorer' tagline='Browse the files and folders of your vault.' />

      <main className='action-card stack-3'>
        <nav className='explorer-crumbs' aria-label='Current folder'>
          <button type='button' className='explorer-crumb' onClick={() => openDir('')}>Vault</button>
          {crumbs.map((segment, index) => (
            <span key={crumbs.slice(0, index + 1).join('/')}>
              <span className='explorer-crumb-sep' aria-hidden='true'>/</span>
              <button type='button' className='explorer-crumb' onClick={() => openDir(crumbs.slice(0, index + 1).join('/'))}>{segment}</button>
            </span>
          ))}
        </nav>

        {error !== null && <div className='alert alert-danger' role='alert'><span>{error}</span></div>}
        {loading && <p role='status'>Loading folder…</p>}
        {!loading && error === null && tree !== null && tree.entries.length === 0 && (
          <p className='followup-empty'>This folder is empty.</p>
        )}
        {!loading && error === null && tree !== null && tree.entries.length > 0 && (
          <ul className='explorer-list' aria-label={`${tree.entries.length} entries`}>
            {tree.entries.map(entry => (
              <li key={entry.path} className='explorer-row'>
                <button
                  type='button'
                  className='explorer-entry'
                  aria-current={entry.path === selected ? 'true' : undefined}
                  onClick={() => { entry.kind === 'dir' ? openDir(entry.path) : setSelected(entry.path) }}
                >
                  <span className='explorer-entry-icon' aria-hidden='true'>{entry.kind === 'dir' ? '📁' : '📄'}</span>
                  <span className='explorer-entry-name'>{entry.name}</span>
                  {entry.kind === 'file' && <span className='explorer-entry-size'>{formatSize(entry.size)}</span>}
                </button>
                {entry.kind === 'file' && (
                  <a
                    className='explorer-download'
                    href={`/api/explorer/download?path=${encodeURIComponent(entry.path)}`}
                    download={entry.name}
                    aria-label={`Download ${entry.name}`}
                    title={`Download ${entry.name}`}
                  >
                    <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                      <path d='M12 4v11M7 10l5 5 5-5M5 20h14' />
                    </svg>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {selected !== null && (
          <section className='explorer-file' aria-label='File preview'>
            {file === null
              ? <p role='status'>Loading file…</p>
              : (
                <>
                  <div className='explorer-file-head'>
                    <div>
                      <span className='explorer-file-title'>{file.title}</span>
                      <span className='explorer-path'>{file.path} · {formatSize(file.size)}</span>
                    </div>
                    <button type='button' className='btn btn-quiet btn-sm' onClick={() => setSelected(null)}>Close</button>
                  </div>
                  {file.kind === 'binary' && <p className='explorer-missing'>This file is not a text file, so it cannot be previewed.</p>}
                  {file.truncated && <p className='explorer-missing'>Showing the first part of a large file.</p>}
                  {file.kind === 'markdown' && (
                    <div className='prose'>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content}</ReactMarkdown>
                    </div>
                  )}
                  {file.kind === 'text' && <pre className='explorer-text'>{file.content}</pre>}
                </>
                )}
          </section>
        )}
      </main>
    </div>
  )
}

/** A compact human-readable size: bytes, KB, or MB. */
function formatSize (bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
