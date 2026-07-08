import { useEffect, useState } from 'react'

export function App () {
  const [health, setHealth] = useState<string>('checking…')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<{ status: string }>)
      .then((body) => setHealth(body.status))
      .catch(() => setHealth('unreachable'))
  }, [])

  return (
    <div className='app-page'>
      <main className='container-narrow stack-3'>
        <header className='stack-1'>
          <p className='kicker'>Second Brain</p>
          <h1 className='headline'>Console</h1>
          <p className='lead muted'>Private console for the second-brain vault.</p>
        </header>
        <section className='action-card'>
          <h2 className='card-title'>Server</h2>
          <dl className='data-list'>
            <div className='data-row'>
              <dt className='data-key'>Health</dt>
              <dd className='data-value'>
                <span className={health === 'ok' ? 'badge badge-live' : 'badge badge-danger'} data-testid='health'>
                  {health}
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  )
}
