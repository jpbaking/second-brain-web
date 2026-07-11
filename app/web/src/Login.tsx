import { useState } from 'react'

type Step = 'password' | 'totp'

async function postJson (url: string, body: unknown): Promise<Response> {
  return await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
}

export function Login () {
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submitPassword (event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await postJson('/api/auth/password', { password })
      if (res.ok) {
        setStep('totp')
        return
      }
      if (res.status === 429) setError('Too many attempts. Wait a moment, then try again.')
      else if (res.status === 503) setError('Owner login is not set up yet. Run the reset script on the host.')
      else setError('That password was not recognised.')
    } catch {
      setError('Could not reach the server. Check it is running and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submitTotp (event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await postJson('/api/auth/totp', { code })
      if (res.ok) {
        window.location.assign('/')
        return
      }
      if (res.status === 429) {
        setError('Too many attempts. Wait a moment, then try again.')
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string }
        if (body.error === 'no pending challenge') {
          setStep('password')
          setCode('')
          setError('Your login timed out. Please enter your password again.')
        } else {
          setError('That code was not correct. Check your authenticator app.')
        }
      }
    } catch {
      setError('Could not reach the server. Check it is running and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='app-page'>
      <header className='app-hero narrow'>
        <a className='app-brand' href='/' aria-label='Second Brain home'>
          <img src='/design/assets/logo-mark-invert.svg' alt='' />
          <span className='app-wordmark'>Second Brain</span>
        </a>
        <p className='app-kicker'>Private console</p>
        <h1 className='app-title'>Sign in</h1>
        <p className='app-tagline'>Owner access needs your password and a one-time code.</p>
      </header>

      <main className='action-card narrow'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Sign in</span>
            <span data-testid='login-error'>{error}</span>
          </div>
        )}

        {step === 'password' && (
          <form onSubmit={submitPassword} aria-label='Password' data-testid='password-step'>
            <div className='field'>
              <label className='label' htmlFor='password'>Password</label>
              <input
                id='password'
                className='input'
                type='password'
                autoComplete='current-password'
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className='form-actions'>
              <button className='btn btn-primary' type='submit' disabled={busy || password === ''}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={submitTotp} aria-label='One-time code' data-testid='totp-step'>
            <div className='field'>
              <label className='label' htmlFor='code'>One-time code</label>
              <input
                id='code'
                className='input'
                type='text'
                inputMode='numeric'
                autoComplete='one-time-code'
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <span className='field-hint'>From your authenticator app.</span>
            </div>
            <div className='form-actions'>
              <button className='btn btn-primary' type='submit' disabled={busy || code === ''}>
                {busy ? 'Verifying…' : 'Sign in'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
