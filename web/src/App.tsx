import { useEffect, useState } from 'react'
import { Login } from './Login.js'

interface SystemStatus {
  dataDir: {
    path: string
    exists: boolean
    mode: string | null
    private: boolean
    state: 'ready' | 'missing' | 'unsafe'
  }
  databases: {
    core: DatabaseStatus
    sidecar: DatabaseStatus
  }
  auth: {
    configured: boolean
    message: string
  }
}

interface DatabaseStatus {
  path: string
  exists: boolean
  state: 'ready' | 'missing' | 'error'
  integrity: 'ok' | 'missing' | 'error'
  schemaVersion: number | null
}

export function App () {
  const path = typeof window === 'undefined' ? '/' : window.location.pathname
  if (path === '/login') return <Login />
  return <StatusPage />
}

function StatusPage () {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/status')
      .then((res) => {
        if (!res.ok) throw new Error(`status endpoint returned ${res.status}`)
        return res.json() as Promise<SystemStatus>
      })
      .then((body) => {
        setStatus(body)
        setError(null)
      })
      .catch((err: unknown) => {
        setStatus(null)
        setError(err instanceof Error ? err.message : 'status endpoint unreachable')
      })
  }, [])

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <a className='app-brand' href='/' aria-label='Second Brain home'>
          <img src='/design/assets/logo-mark-invert.svg' alt='' />
          <span className='app-wordmark'>Second Brain</span>
        </a>
        <p className='app-kicker'>Private console</p>
        <h1 className='app-title'>Setup status</h1>
        <p className='app-tagline'>Local service checks before vault operations are enabled.</p>
      </header>

      <main className='action-card' aria-live='polite'>
        {error !== null && (
          <div className='alert alert-danger' role='status'>
            <span className='alert-title'>Status</span>
            <span>{error}</span>
          </div>
        )}

        {status === null && error === null && (
          <div className='alert alert-info' role='status'>
            <span className='alert-title'>Status</span>
            <span>Checking local setup.</span>
          </div>
        )}

        {status !== null && (
          <>
            <div className={status.auth.configured ? 'alert alert-success' : 'alert alert-warn'} role='status'>
              <span className='alert-title'>Setup</span>
              <span data-testid='auth-message'>{status.auth.message}</span>
            </div>

            <section className='stack-2' aria-labelledby='data-dir-title'>
              <h2 id='data-dir-title' className='card-title'>Data directory</h2>
              <dl className='data-list'>
                <StatusRow label='State' value={status.dataDir.state} badge={badgeFor(status.dataDir.state)} />
                <StatusRow label='Path' value={status.dataDir.path} />
                <StatusRow label='Mode' value={status.dataDir.mode ?? 'missing'} />
                <StatusRow label='Private' value={status.dataDir.private ? 'yes' : 'no'} />
              </dl>
            </section>

            <section className='grid-2' aria-label='Database state'>
              <DatabasePanel title='Core database' database={status.databases.core} />
              <DatabasePanel title='Vault index sidecar' database={status.databases.sidecar} />
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function DatabasePanel ({ title, database }: { title: string, database: DatabaseStatus }) {
  return (
    <section className='stack-2' aria-labelledby={`${title.replaceAll(' ', '-').toLowerCase()}-title`}>
      <h2 id={`${title.replaceAll(' ', '-').toLowerCase()}-title`} className='card-title'>{title}</h2>
      <dl className='data-list'>
        <StatusRow label='State' value={database.state} badge={badgeFor(database.state)} />
        <StatusRow label='Integrity' value={database.integrity} badge={badgeFor(database.integrity)} />
        <StatusRow label='Schema' value={database.schemaVersion === null ? 'missing' : String(database.schemaVersion)} />
        <StatusRow label='Path' value={database.path} />
      </dl>
    </section>
  )
}

function StatusRow ({ label, value, badge }: { label: string, value: string, badge?: string }) {
  return (
    <div className='data-row'>
      <dt className='data-key'>{label}</dt>
      <dd className='data-value'>
        {badge === undefined ? value : <span className={`badge ${badge}`}>{value}</span>}
      </dd>
    </div>
  )
}

function badgeFor (state: string): string {
  if (state === 'ready' || state === 'ok') return 'badge-live'
  if (state === 'missing') return 'badge-planned'
  return 'badge-danger'
}
