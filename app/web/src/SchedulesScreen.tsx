import { useEffect, useState } from 'react'

export interface ScheduledJob {
  id: string
  name: string
  workflow: string
  frequency: string
  last_run_at: string | null
  created_at: string
}

export function SchedulesScreen () {
  const [schedules, setSchedules] = useState<ScheduledJob[]>([])
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [creating, setCreating] = useState(false)

  const loadSchedules = () => {
    fetch('/api/schedules', { credentials: 'same-origin' })
      .then(async res => {
        if (res.status === 401) { window.location.assign('/login'); return }
        if (!res.ok) throw new Error('Failed to load schedules')
        return await res.json() as { schedules: ScheduledJob[] }
      })
      .then(data => { if (data !== undefined) setSchedules(data.schedules) })
      .catch(e => { if (e !== undefined) setError(e instanceof Error ? e.message : 'failed to load schedules') })
  }

  useEffect(() => { loadSchedules() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, workflow, frequency })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to create schedule')
      }
      setName('')
      setWorkflow('')
      setFrequency('daily')
      loadSchedules()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to delete schedule')
      loadSchedules()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <h1 className='app-title'>Scheduled Briefs</h1>
        <p className='app-tagline'>Configure background agent workflows that run periodically.</p>
      </header>

      <main className='stack-3'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span>{error}</span>
          </div>
        )}

        <section className='action-card'>
          <h2 className='card-title'>Create Schedule</h2>
          <form className='stack-2' onSubmit={(e) => { handleCreate(e).catch(console.error) }}>
            <div className='form-group'>
              <label htmlFor='sched-name'>Name</label>
              <input
                id='sched-name'
                className='text-input'
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder='e.g. Morning Brief'
              />
            </div>

            <div className='form-group'>
              <label htmlFor='sched-workflow'>Workflow File</label>
              <input
                id='sched-workflow'
                className='text-input'
                value={workflow}
                onChange={e => setWorkflow(e.target.value)}
                required
                placeholder='e.g. brief (maps to .clinerules/workflows/brief.md)'
              />
            </div>

            <div className='form-group'>
              <label htmlFor='sched-frequency'>Frequency</label>
              <select
                id='sched-frequency'
                className='select-input'
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
              >
                <option value='hourly'>Hourly</option>
                <option value='daily'>Daily</option>
                <option value='weekly'>Weekly</option>
              </select>
            </div>

            <div className='form-actions'>
              <button type='submit' className='btn btn-primary' disabled={creating}>
                {creating ? 'Creating...' : 'Create Schedule'}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className='card-title' style={{ marginBottom: '1rem' }}>Active Schedules</h2>
          {schedules.length === 0
            ? (
              <p className='empty-state' style={{ textAlign: 'left', padding: '1rem', background: 'var(--surface-sunken)', borderRadius: '4px' }}>
                No schedules configured.
              </p>
              )
            : (
              <ul className='stack-1' style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {schedules.map(job => (
                  <li key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '4px' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{job.name}</h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        Workflow: <strong>{job.workflow}</strong> &bull; Frequency: <strong>{job.frequency}</strong>
                      </p>
                      {job.last_run_at !== null && (
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Last run: {new Date(job.last_run_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      className='btn btn-secondary'
                      onClick={() => { handleDelete(job.id).catch(console.error) }}
                      title='Delete schedule'
                    >
                      Delete
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
