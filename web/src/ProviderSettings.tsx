import { useEffect, useState } from 'react'

interface ProviderProfile {
  id: string
  displayName: string
  providerId: string
  modelId: string
  baseUrl: string | null
  enabled: boolean
  isDefault: boolean
  hasKey: boolean
  keyLast4: string | null
}

interface ProvidersResponse { profiles: ProviderProfile[], secretStorage: boolean }
interface TestResult { ok: boolean, status: number | null, message: string }

const PROVIDER_TYPES = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'openai-compatible', label: 'OpenAI-compatible (e.g. LM Studio)' },
]

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

const BLANK = { displayName: '', providerId: 'anthropic', modelId: '', baseUrl: '', apiKey: '' }

export function ProviderSettings () {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [secretStorage, setSecretStorage] = useState(true)
  const [form, setForm] = useState({ ...BLANK })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load () {
    const res = await getJson('/api/providers')
    if (res.status === 401) { window.location.assign('/login'); return }
    if (!res.ok) { setError('Could not load providers.'); return }
    const body = await res.json() as ProvidersResponse
    setProfiles(body.profiles)
    setSecretStorage(body.secretStorage)
  }

  useEffect(() => { load().catch(() => setError('Could not load providers.')) }, [])

  function resetForm () {
    setForm({ ...BLANK })
    setEditingId(null)
  }

  function editProfile (p: ProviderProfile) {
    setEditingId(p.id)
    setForm({ displayName: p.displayName, providerId: p.providerId, modelId: p.modelId, baseUrl: p.baseUrl ?? '', apiKey: '' })
    setError(null)
    setNotice(null)
  }

  async function submit (event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const payload: Record<string, unknown> = {
        displayName: form.displayName,
        providerId: form.providerId,
        modelId: form.modelId,
        baseUrl: form.baseUrl.trim() === '' ? undefined : form.baseUrl.trim(),
      }
      if (form.apiKey.trim() !== '') payload.apiKey = form.apiKey.trim()
      const res = editingId === null
        ? await sendJson('POST', '/api/providers', payload)
        : await sendJson('PUT', `/api/providers/${editingId}`, payload)
      if (res.status === 401) { window.location.assign('/login'); return }
      if (res.ok) {
        setNotice(editingId === null ? 'Provider profile added.' : 'Provider profile updated.')
        resetForm()
        await load()
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? 'Could not save the provider profile.')
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  async function act (verb: 'default' | 'test' | 'delete', p: ProviderProfile) {
    setError(null)
    setNotice(null)
    try {
      if (verb === 'delete') {
        const res = await sendJson('DELETE', `/api/providers/${p.id}`)
        if (res.ok) { setNotice(`Deleted ${p.displayName}.`); if (editingId === p.id) resetForm(); await load() } else setError('Could not delete the profile.')
        return
      }
      if (verb === 'default') {
        const res = await sendJson('POST', `/api/providers/${p.id}/default`)
        if (res.ok) { setNotice(`${p.displayName} is now the default.`); await load() } else setError('Could not set the default.')
        return
      }
      const res = await sendJson('POST', `/api/providers/${p.id}/test`)
      const body = await res.json().catch(() => ({})) as TestResult & { error?: string }
      if (!res.ok) setError(body.error ?? 'Test failed.')
      else if (body.ok) setNotice(`${p.displayName}: ${body.message}`)
      else setError(`${p.displayName}: ${body.message}`)
    } catch {
      setError('Could not reach the server.')
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
        <h1 className='app-title'>Provider settings</h1>
        <p className='app-tagline'>Configure the AI providers and models your secretary can run with.</p>
      </header>

      <main className='action-card'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Providers</span>
            <span data-testid='provider-error'>{error}</span>
          </div>
        )}
        {notice !== null && (
          <div className='alert alert-success' role='status'>
            <span className='alert-title'>Providers</span>
            <span>{notice}</span>
          </div>
        )}
        {!secretStorage && (
          <div className='alert alert-warn' role='status'>
            <span className='alert-title'>Key storage disabled</span>
            <span>SECOND_BRAIN_WEB_SECRETS_KEY is not set on the host, so API keys cannot be stored. Set it to add keyed providers.</span>
          </div>
        )}

        <form onSubmit={submit} aria-label='Provider profile' data-testid='provider-form'>
          <div className='input-row'>
            <div className='field'>
              <label className='label' htmlFor='displayName'>Display name</label>
              <input
                id='displayName' className='input' type='text' autoComplete='off' placeholder='Claude Sonnet'
                value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className='field'>
              <label className='label' htmlFor='providerId'>Provider</label>
              <select
                id='providerId' className='input'
                value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              >
                {PROVIDER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className='input-row'>
            <div className='field'>
              <label className='label' htmlFor='modelId'>Model</label>
              <input
                id='modelId' className='input' type='text' autoComplete='off' placeholder='claude-sonnet-5'
                value={form.modelId} onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              />
            </div>
            <div className='field'>
              <label className='label' htmlFor='baseUrl'>Base URL {form.providerId === 'openai-compatible' ? '(required)' : '(optional)'}</label>
              <input
                id='baseUrl' className='input' type='text' autoComplete='off' placeholder='http://127.0.0.1:1234/v1'
                value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
            </div>
          </div>
          <div className='field'>
            <label className='label' htmlFor='apiKey'>
              API key {editingId !== null ? '(leave blank to keep the current key)' : ''}
            </label>
            <input
              id='apiKey' className='input' type='password' autoComplete='off' placeholder='sk-…'
              value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>
          <div className='form-actions'>
            <button className='btn btn-primary' type='submit' disabled={busy}>
              {busy ? 'Saving…' : editingId === null ? 'Add provider' : 'Save changes'}
            </button>
            {editingId !== null && (
              <button className='btn btn-secondary' type='button' onClick={resetForm}>Cancel</button>
            )}
          </div>
        </form>

        <section className='stack-2' aria-label='Configured providers'>
          <h2 className='card-title'>Configured providers</h2>
          {profiles.length === 0
            ? <p className='app-tagline'>No providers yet. Add one above.</p>
            : (
              <ul className='data-list' data-testid='provider-list'>
                {profiles.map((p) => (
                  <li key={p.id} className='data-row' style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span className='data-key'>{p.displayName}</span>{' '}
                      {p.isDefault && <span className='badge badge-live'>default</span>}{' '}
                      {!p.enabled && <span className='badge badge-planned'>disabled</span>}
                      <div className='data-value'>
                        {p.providerId} · {p.modelId}
                        {p.baseUrl !== null ? ` · ${p.baseUrl}` : ''}
                        {p.hasKey ? ` · key ••••${p.keyLast4 ?? ''}` : ' · no key'}
                      </div>
                    </div>
                    <div className='form-actions' style={{ margin: 0 }}>
                      <button className='btn btn-secondary' type='button' onClick={() => { act('test', p).catch(() => {}) }}>Test</button>
                      {!p.isDefault && (
                        <button className='btn btn-secondary' type='button' onClick={() => { act('default', p).catch(() => {}) }}>Set default</button>
                      )}
                      <button className='btn btn-secondary' type='button' onClick={() => editProfile(p)}>Edit</button>
                      <button className='btn btn-secondary' type='button' onClick={() => { act('delete', p).catch(() => {}) }}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
              )}
        </section>
      </main>
    </div>
  )
}
