import { useEffect, useState } from 'react'

interface VaultMarker { path: string, present: boolean }
interface VaultDetection { present: boolean, markers: VaultMarker[], missing: string[] }

interface VaultStatus {
  configured: boolean
  cloned: boolean
  displayName: string | null
  remoteUrl: string | null
  branch: string
  commit: string | null
  lastPullAt: string | null
  detection: VaultDetection
}

async function getJson (url: string): Promise<Response> {
  return await fetch(url, { credentials: 'same-origin' })
}
async function sendJson (method: string, url: string, body?: unknown): Promise<Response> {
  // Only declare a JSON content-type when there is a body — Fastify rejects an
  // empty body sent with content-type application/json (FST_ERR_CTP_EMPTY_JSON_BODY).
  return await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function VaultSettings () {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)

  async function load () {
    const res = await getJson('/api/vault/status')
    if (res.status === 401) {
      window.location.assign('/login')
      return
    }
    if (!res.ok) {
      setError('Could not load vault status.')
      return
    }
    const body = await res.json() as VaultStatus
    setStatus(body)
    setRemoteUrl(body.remoteUrl ?? '')
    setBranch(body.branch)
    setDisplayName(body.displayName ?? '')
  }

  useEffect(() => { load().catch(() => setError('Could not load vault status.')) }, [])

  async function saveConfig (event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await sendJson('PUT', '/api/vault/config', { remoteUrl, branch, displayName })
      if (res.ok) {
        setNotice('Vault settings saved.')
        await load()
      } else if (res.status === 401) {
        window.location.assign('/login')
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? 'Could not save vault settings.')
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  async function sync () {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const res = await sendJson('POST', '/api/vault/sync')
      if (res.status === 401) {
        window.location.assign('/login')
        return
      }
      const body = await res.json().catch(() => ({})) as { state?: string, message?: string }
      if (res.ok && body.state === 'ready') setNotice(body.message ?? 'Vault synced.')
      else setError(body.message ?? 'Sync failed.')
      await load()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <a className='app-brand' href='/' aria-label='Second Brain home'>
          <img src='/design/assets/logo-mark-invert.svg' alt='' />
          <span className='app-wordmark'>Second Brain</span>
        </a>
        <p className='app-kicker'>Private console</p>
        <h1 className='app-title'>Vault settings</h1>
        <p className='app-tagline'>Point the console at your vault repository and clone it locally.</p>
      </header>

      <main className='action-card'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Vault</span>
            <span data-testid='vault-error'>{error}</span>
          </div>
        )}
        {notice !== null && (
          <div className='alert alert-success' role='status'>
            <span className='alert-title'>Vault</span>
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={saveConfig} aria-label='Vault repository' data-testid='vault-form'>
          <div className='field'>
            <label className='label' htmlFor='remote'>Git remote URL</label>
            <input
              id='remote' className='input' type='text' autoComplete='off'
              placeholder='git@github.com:owner/second-brain.git'
              value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)}
            />
          </div>
          <div className='input-row'>
            <div className='field'>
              <label className='label' htmlFor='branch'>Branch</label>
              <input id='branch' className='input' type='text' value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <div className='field'>
              <label className='label' htmlFor='name'>Display name</label>
              <input id='name' className='input' type='text' value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>
          <div className='form-actions'>
            <button className='btn btn-primary' type='submit' disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
            <button className='btn btn-secondary' type='button' onClick={() => { sync().catch(() => {}) }} disabled={syncing || remoteUrl === ''}>
              {syncing ? 'Syncing…' : 'Clone / sync now'}
            </button>
          </div>
        </form>

        {status !== null && (
          <section className='stack-2' aria-label='Vault status'>
            <h2 className='card-title'>Status</h2>
            <dl className='data-list'>
              <Row label='Checkout' value={status.cloned ? 'cloned' : 'not cloned'} />
              <Row label='Branch' value={status.branch} />
              <Row label='Commit' value={status.commit === null ? '—' : status.commit.slice(0, 10)} />
              <Row label='Last pull' value={status.lastPullAt ?? '—'} />
              <Row
                label='Vault files'
                value={status.detection.present ? 'all present' : `${status.detection.missing.length} missing`}
              />
            </dl>
          </section>
        )}
      </main>
    </div>
  )
}

function Row ({ label, value }: { label: string, value: string }) {
  return (
    <div className='data-row'>
      <dt className='data-key'>{label}</dt>
      <dd className='data-value'>{value}</dd>
    </div>
  )
}
