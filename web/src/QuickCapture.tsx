import { useState } from 'react'

export function QuickCapture () {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit (e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return

    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })

      if (res.status === 401) {
        window.location.assign('/login')
        return
      }

      if (!res.ok) {
        throw new Error('Failed to save capture.')
      }

      setContent('')
      setMessage('Captured successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <h1 className='app-title'>Quick capture</h1>
        <p className='app-tagline'>Jot down a thought to process later.</p>
      </header>

      <main className='action-card' aria-live='polite'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Error</span>
            <span>{error}</span>
          </div>
        )}
        {message !== null && (
          <div className='alert alert-success' role='status'>
            <span className='alert-title'>Success</span>
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={(e) => { handleSubmit(e).catch(() => {}) }} className='stack-2'>
          <div className='field'>
            <label htmlFor='capture-content' className='label'>Note</label>
            <textarea
              id='capture-content'
              className='input'
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              required
              disabled={saving}
              placeholder="What's on your mind?"
            />
          </div>
          <div className='form-actions'>
            <button type='submit' className='btn btn-primary' disabled={saving || !content.trim()}>
              {saving ? 'Saving…' : 'Capture'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
