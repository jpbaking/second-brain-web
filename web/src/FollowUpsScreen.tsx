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
  }, [filter])

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

        {error !== null && <div className='alert alert-danger' role='alert'><span>{error}</span></div>}
        {loading && <p role='status'>Loading follow-ups…</p>}
        {!loading && error === null && items.length === 0 && <p className='followup-empty'>Nothing in this queue.</p>}
        {items.length > 0 && (
          <ul className='followup-list' aria-label={`${items.length} follow-ups`}>
            {items.map(item => (
              <li key={item.id} className='followup-row'>
                <div className='followup-main'>
                  <span className='followup-text'>{item.text}</span>
                  <span className='followup-source'>
                    <span className='followup-origin'>{item.sourceFile}:{item.sourceLine}</span>
                    {item.linkedSource !== null && (
                      <span className='followup-link'>→ {item.linkedSource}</span>
                    )}
                  </span>
                </div>
                <div className='followup-meta'>
                  <span className='badge'>{labelForKind(item)}</span>
                  {item.dueDate !== null && (
                    <time className={`followup-due ${dueClass(item, today)}`} dateTime={item.dueDate}>
                      {dueLabel(item.dueDate, today)}
                    </time>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
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
