import { useEffect, useState } from 'react'
import { AppHero } from './AppHero.js'

interface ProviderProfile {
  id: string
  displayName: string
  providerId: string
  modelId: string
  baseUrl: string | null
  enabled: boolean
  isDefault: boolean
  key: 'configured' | 'none'
}

interface TestResult { ok: boolean, status: number | null, message: string }

export function ProviderSettings () {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/providers', { credentials: 'same-origin' }).then(async res => {
      if (res.status === 401) { window.location.assign('/login'); return }
      if (!res.ok) throw new Error()
      setProfiles((await res.json() as { profiles: ProviderProfile[] }).profiles)
    }).catch(() => setError('Could not load providers.'))
  }, [])

  async function testProfile (profile: ProviderProfile) {
    setTesting(profile.id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/providers/${profile.id}/test`, {
        method: 'POST', credentials: 'same-origin'
      })
      if (res.status === 401) { window.location.assign('/login'); return }
      const body = await res.json().catch(() => ({})) as TestResult & { error?: string }
      if (!res.ok) setError(body.error ?? 'Test failed.')
      else if (body.ok) setNotice(`${profile.displayName}: ${body.message}`)
      else setError(`${profile.displayName}: ${body.message}`)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className='app-page'>
      <AppHero title='Providers' tagline='Provider profiles available to your secretary.' />

      <main className='action-card'>
        <div className='alert alert-info' role='status'>
          <span className='alert-title'>Configuration</span>
          <span>Providers are configured in providers.yaml — run ./configure to make changes, then restart the app.</span>
        </div>
        {error !== null && <div className='alert alert-danger' role='alert'><span className='alert-title'>Providers</span><span data-testid='provider-error'>{error}</span></div>}
        {notice !== null && <div className='alert alert-success' role='status'><span className='alert-title'>Providers</span><span>{notice}</span></div>}

        <section className='stack-2' aria-label='Configured providers'>
          <h2 className='card-title'>Configured providers</h2>
          {profiles.length === 0
            ? <p className='app-tagline'>No providers configured. Run ./configure to add one.</p>
            : (
              <ul className='data-list' data-testid='provider-list'>
                {profiles.map(profile => (
                  <li key={profile.id} className='data-row' style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span className='data-key'>{profile.displayName}</span>{' '}
                      {profile.isDefault && <span className='badge badge-live'>default</span>}{' '}
                      {!profile.enabled && <span className='badge badge-planned'>disabled</span>}
                      <div className='data-value'>
                        {profile.providerId} · {profile.modelId}
                        {profile.baseUrl !== null ? ` · ${profile.baseUrl}` : ''}
                        {profile.providerId === 'chatgpt'
                          ? (profile.key === 'configured' ? ' · OAuth login' : ' · not logged in')
                          : profile.key === 'configured' ? ' · key configured' : ' · no key'}
                      </div>
                    </div>
                    <button className='btn btn-secondary' type='button' disabled={testing === profile.id} onClick={() => { testProfile(profile).catch(() => {}) }}>
                      {testing === profile.id ? 'Testing…' : 'Test'}
                    </button>
                  </li>
                ))}
              </ul>
              )}
        </section>
      </main>
    </div>
  )
}
