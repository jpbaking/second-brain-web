import { useEffect, useState } from 'react'
import { AppHero } from './AppHero.js'

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
}

interface DatabaseStatus {
  path: string
  exists: boolean
  state: 'ready' | 'missing' | 'error'
  integrity: 'ok' | 'missing' | 'error'
  schemaVersion: number | null
}

export function BackupScreen () {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/status', { credentials: 'same-origin' })
      .then(async (res) => {
        if (res.status === 401) { window.location.assign('/login'); return }
        if (!res.ok) throw new Error(`status endpoint returned ${res.status}`)
        return await res.json() as SystemStatus
      })
      .then(status => { if (status !== undefined) setStatus(status) })
      .catch((err: unknown) => { if (err !== undefined) setError(err instanceof Error ? err.message : 'unreachable') })
  }, [])

  return (
    <div className='app-page'>
      <AppHero title='System Backup' tagline='Download database snapshots and view operational status.' />

      <main className='action-card'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span>{error}</span>
          </div>
        )}

        {status !== null && (
          <>
            <section className='stack-2'>
              <h2 className='card-title'>Core Database</h2>
              <dl className='data-list'>
                <div className='data-row'>
                  <dt className='data-key'>Integrity</dt>
                  <dd className='data-value'>{status.databases.core.integrity}</dd>
                </div>
                <div className='data-row'>
                  <dt className='data-key'>Schema Version</dt>
                  <dd className='data-value'>{status.databases.core.schemaVersion}</dd>
                </div>
              </dl>
              <div className='form-actions'>
                <a className='btn btn-primary' href='/api/backup/core' download>
                  Download Core Backup
                </a>
              </div>
            </section>

            <section className='stack-2' style={{ marginTop: '2rem' }}>
              <h2 className='card-title'>Search &amp; Link Index (Sidecar)</h2>
              <dl className='data-list'>
                <div className='data-row'>
                  <dt className='data-key'>Integrity</dt>
                  <dd className='data-value'>{status.databases.sidecar.integrity}</dd>
                </div>
                <div className='data-row'>
                  <dt className='data-key'>Schema Version</dt>
                  <dd className='data-value'>{status.databases.sidecar.schemaVersion}</dd>
                </div>
              </dl>
              <div className='form-actions'>
                <a className='btn btn-secondary' href='/api/backup/sidecar' download>
                  Download Sidecar Backup
                </a>
              </div>
            </section>

            <section className='stack-2' style={{ marginTop: '2rem' }}>
              <p className='app-tagline' style={{ fontSize: '0.9rem' }}>
                Note: The Git repository (vault) is best backed up by ensuring it is pushed to a remote URL.
                Check the <a href='/command-centre'>Command centre</a> to ensure your workspace is clean.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
