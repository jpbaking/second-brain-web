import { useEffect, useState } from 'react'
import { AppHero } from './AppHero.js'

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
      <AppHero title='Scheduled Briefs' tagline='Configure background agent workflows that run periodically.' />

      <main className='stack-3'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span>{error}</span>
          </div>
        )}

        <section className='action-card'>
          <h2 className='card-title'>Create Schedule</h2>
          <form className='stack-2' onSubmit={(e) => { handleCreate(e).catch(console.error) }}>
            <div className='field'>
              <label htmlFor='sched-name' className='label'>Name</label>
              <input
                id='sched-name'
                className='input'
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder='e.g. Morning Brief'
              />
            </div>

            <div className='field'>
              <label htmlFor='sched-workflow' className='label'>Workflow File</label>
              <input
                id='sched-workflow'
                className='input'
                value={workflow}
                onChange={e => setWorkflow(e.target.value)}
                required
                placeholder='e.g. brief (maps to .clinerules/workflows/brief.md)'
              />
            </div>

            <div className='field'>
              <label htmlFor='sched-frequency' className='label'>Frequency</label>
              <select
                id='sched-frequency'
                className='select'
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

        <section className='action-card'>
          <h2 className='card-title'>Active Schedules</h2>
          {schedules.length === 0
            ? (
              <p className='empty-state'>
                No schedules configured.
              </p>
              )
            : (
              <ul className='stack-2' style={{ listStyle: 'none', padding: 0 }}>
                {schedules.map(job => (
                  <li key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className='stack-1'>
                      <h3>{job.name}</h3>
                      <p className='text-secondary'>
                        Workflow: <strong>{job.workflow}</strong> &bull; Frequency: <strong>{job.frequency}</strong>
                      </p>
                      {job.last_run_at !== null && (
                        <p className='text-secondary' style={{ fontSize: '0.9em' }}>
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
