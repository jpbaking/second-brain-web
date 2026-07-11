import { useState } from 'react'

export function MeetingPrepScreen () {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [attendees, setAttendees] = useState('')
  const [objective, setObjective] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit (e: React.FormEvent) {
    e.preventDefault()
    setRunning(true)
    setError(null)

    try {
      const res = await fetch('/api/chat/workflows/prep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title, date, attendees, objective }),
      })
      if (res.status === 401) { window.location.assign('/login'); return }
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        setError(payload.error ?? 'Could not start prep workflow.')
        setRunning(false)
        return
      }
      const data = await res.json() as { id: string }
      window.location.assign(`/chat/${data.id}`)
    } catch {
      setError('Network error.')
      setRunning(false)
    }
  }

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <h1 className='app-title'>Meeting Prep</h1>
        <p className='app-tagline'>Start a guided prep session with the agent.</p>
      </header>

      <main className='action-card'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span>{error}</span>
          </div>
        )}

        <form className='stack-2' onSubmit={submit}>
          <div className='form-group'>
            <label htmlFor='prep-title' className='form-label'>Meeting title</label>
            <input id='prep-title' className='form-input' value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className='form-group'>
            <label htmlFor='prep-date' className='form-label'>Date / Time</label>
            <input id='prep-date' className='form-input' value={date} onChange={(e) => setDate(e.target.value)} placeholder='e.g., Tomorrow at 2 PM' />
          </div>
          <div className='form-group'>
            <label htmlFor='prep-attendees' className='form-label'>Attendees</label>
            <input id='prep-attendees' className='form-input' value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder='e.g., John, Sarah' />
          </div>
          <div className='form-group'>
            <label htmlFor='prep-objective' className='form-label'>Objective</label>
            <textarea id='prep-objective' className='form-input' value={objective} onChange={(e) => setObjective(e.target.value)} placeholder='What is the goal of this meeting?' rows={3} />
          </div>

          <div className='form-actions'>
            <button className='btn btn-primary' type='submit' disabled={running || title.trim() === ''}>
              {running ? 'Starting...' : 'Start Prep'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
