import { useEffect, useState } from 'react'

type FollowUpKind = 'reminder' | 'commitment'
type CommitmentDirection = 'i-owe' | 'waiting-on'
type FollowUpFilter = 'active' | 'overdue' | 'today' | 'week' | 'waiting-on' | 'i-owe' | 'completed'

interface FollowUpItem {
  id: string
  kind: FollowUpKind
  direction: CommitmentDirection | null
  text: string
  dueDate: string | null
  completed: boolean
  sourceFile: string
  sourceLine: number
  linkedSource: string | null
}

interface FollowUpResponse {
  filter: FollowUpFilter
  today: string
  items: FollowUpItem[]
  counts: Record<FollowUpFilter, number>
}

const TABS: Array<{ id: FollowUpFilter, label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'waiting-on', label: 'Waiting on' },
  { id: 'i-owe', label: 'I owe' },
  { id: 'completed', label: 'Completed' },
]

export function FollowUpsScreen () {
  const [filter, setFilter] = useState<FollowUpFilter>('active')
  const [items, setItems] = useState<FollowUpItem[]>([])
  const [counts, setCounts] = useState<Record<FollowUpFilter, number> | null>(null)
  const [today, setToday] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string, text: string } | null>(null)

  async function act (item: FollowUpItem, action: 'complete' | 'edit', text?: string) {
    setBusyId(item.id)
    setNotice(null)
    try {
      // `complete` has no body; setting a JSON content-type without one makes
      // Fastify reject the request, so only send the header/body for `edit`.
      const init: RequestInit = action === 'edit'
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }
        : { method: 'POST' }
      const response = await fetch(`/api/follow-ups/${item.id}/${action}`, init)
      if (response.status === 401) { window.location.assign('/login'); return }
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'The action could not be filed.')
      setEditing(null)
      setNotice(action === 'complete'
        ? 'Marked done — the secretary is filing the change in your vault.'
        : 'Edit sent — the secretary is updating your vault.')
      // The write happens asynchronously through the agent, so refresh shortly.
      setTimeout(() => setReload(value => value + 1), 400)
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : 'The action could not be filed.')
    } finally {
      setBusyId(null)
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/follow-ups?filter=${filter}`)
      .then(async response => {
        if (response.status === 401) return window.location.assign('/login')
        if (!response.ok) throw new Error('Could not load follow-ups.')
        const body = await response.json() as FollowUpResponse
        if (!active) return
        setItems(body.items)
        setCounts(body.counts)
        setToday(body.today)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Could not load follow-ups.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [filter, reload])

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <h1 className='app-title'>Follow-ups</h1>
        <p className='app-tagline'>Reminders and commitments the secretary is keeping watch on.</p>
      </header>

      <main className='action-card stack-3'>
        <div className='followup-tabs' role='tablist' aria-label='Follow-up filters'>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type='button'
              role='tab'
              aria-selected={filter === tab.id}
              className={`followup-tab${filter === tab.id ? ' is-active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              <span>{tab.label}</span>
              {counts !== null && <span className='followup-tab-count'>{counts[tab.id]}</span>}
            </button>
          ))}
        </div>

        {notice !== null && <div className='alert alert-info' role='status'><span>{notice}</span></div>}
        {error !== null && <div className='alert alert-danger' role='alert'><span>{error}</span></div>}
        {loading && <p role='status'>Loading follow-ups…</p>}
        {!loading && error === null && items.length === 0 && <p className='followup-empty'>Nothing in this queue.</p>}
        {items.length > 0 && (
          <ul className='followup-list' aria-label={`${items.length} follow-ups`}>
            {items.map(item => {
              const displayText = followUpDisplayText(item.text)
              return (
                <li key={item.id} className='followup-row'>
                  <div className='followup-main'>
                    <span className='followup-text'>{displayText}</span>
                    <span className='followup-source'>
                      <span className='followup-origin'>{item.sourceFile}:{item.sourceLine}</span>
                      {item.linkedSource !== null && (
                        <span className='followup-link'>→ {item.linkedSource}</span>
                      )}
                    </span>
                    {editing?.id === item.id && (
                      <form
                        className='followup-edit'
                        onSubmit={event => { event.preventDefault(); act(item, 'edit', editing.text.trim()).catch(() => {}) }}
                      >
                        <input
                          className='input'
                          aria-label='Edit follow-up text'
                          value={editing.text}
                          onChange={event => setEditing({ id: item.id, text: event.target.value })}
                        />
                        <div className='followup-edit-actions'>
                          <button type='submit' className='btn btn-primary btn-sm' disabled={busyId === item.id || editing.text.trim() === ''}>Save</button>
                          <button type='button' className='btn btn-ghost btn-sm' onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </form>
                    )}
                  </div>
                  <div className='followup-meta'>
                    <span className='badge'>{labelForKind(item)}</span>
                    {item.dueDate !== null && (
                      <time className={`followup-due ${dueClass(item, today)}`} dateTime={item.dueDate}>
                        {dueLabel(item.dueDate, today)}
                      </time>
                    )}
                    {!item.completed && editing?.id !== item.id && (
                      <div className='followup-actions'>
                        <button type='button' className='btn btn-primary btn-sm' disabled={busyId === item.id} onClick={() => { act(item, 'complete').catch(() => {}) }}>
                          {busyId === item.id ? 'Filing…' : 'Mark done'}
                        </button>
                        <button type='button' className='btn btn-secondary btn-sm' disabled={busyId === item.id} onClick={() => setEditing({ id: item.id, text: displayText })}>
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}

export function followUpDisplayText (text: string): string {
  return text.replace(/\s+—\s*source:\s*\[[^\]]+\]\([^)]+\)\s*$/i, '').trim()
}

function labelForKind (item: FollowUpItem): string {
  if (item.direction === 'i-owe') return 'I owe'
  if (item.direction === 'waiting-on') return 'Waiting on'
  return 'Reminder'
}

function dueClass (item: FollowUpItem, today: string): string {
  if (item.completed || item.dueDate === null) return ''
  if (item.dueDate < today) return 'is-overdue'
  if (item.dueDate === today) return 'is-today'
  return ''
}

function dueLabel (dueDate: string, today: string): string {
  if (dueDate < today) return `Overdue · ${dueDate}`
  if (dueDate === today) return `Today · ${dueDate}`
  return `Due ${dueDate}`
}
