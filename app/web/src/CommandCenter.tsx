import { useEffect, useState } from 'react'
import { ReviewCommitModal } from './ReviewCommitModal.js'
import { AppHero } from './AppHero.js'

interface GitStatus {
  isRepo: boolean
  branch: string | null
  commit: string | null
  subject: string | null
  dirty: boolean
  changedFiles: string[]
}
interface LockState { held: boolean, stale: boolean, lock: { operation: string | null } | null }
interface HealthSummary { available: boolean, issueCount: number | null, ranAt: string }
interface RecentReport { path: string, title: string, type: 'html' | 'pdf' | 'markdown', date: string }
interface RadarItem { path: string, title: string, mtime?: string }
interface RadarData { staleProjects: RadarItem[], stalePeople: RadarItem[], warnings: RadarItem[] }

interface CommandCenterData {
  vault: { configured: boolean, cloned: boolean, branch: string, commit: string | null }
  git: GitStatus
  health: HealthSummary | null
  lock: LockState
  inboxBacklog: number
  recentReports: RecentReport[]
  reminders: never[]
  commitments: never[]
  radar: RadarData
}

async function getJson (url: string): Promise<Response> {
  return await fetch(url, { credentials: 'same-origin' })
}

export function CommandCenter () {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [healthMsg, setHealthMsg] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [showReview, setShowReview] = useState(false)

  async function load () {
    const res = await getJson('/api/command-center')
    if (res.status === 401) { window.location.assign('/login'); return }
    if (!res.ok) { setError('Could not load the command centre.'); return }
    setData(await res.json() as CommandCenterData)
  }

  useEffect(() => { load().catch(() => setError('Could not load the command centre.')) }, [])

  async function runHealth () {
    setRunning(true)
    setHealthMsg(null)
    try {
      const res = await fetch('/api/vault/health', { method: 'POST', credentials: 'same-origin' })
      if (res.status === 401) { window.location.assign('/login'); return }
      const body = await res.json().catch(() => ({})) as { available?: boolean, issueCount?: number | null }
      if (!res.ok || body.available === false) setHealthMsg('Health check unavailable — is the vault cloned with scripts/health.py?')
      else setHealthMsg(body.issueCount === null ? 'Health check ran. See the vault for details.' : `Health check ran: ${body.issueCount} issue(s).`)
      await load()
    } catch {
      setHealthMsg('Could not reach the server.')
    } finally {
      setRunning(false)
    }
  }

  const git = data?.git
  return (
    <div className='app-page'>
      <AppHero title='Command centre' tagline='Your vault at a glance before you type anything.' />

      <main className='action-card' aria-live='polite'>
        {error !== null && (
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Command centre</span>
            <span>{error}</span>
          </div>
        )}
        {healthMsg !== null && (
          <div className='alert alert-info' role='status'>
            <span className='alert-title'>Health</span>
            <span data-testid='health-message'>{healthMsg}</span>
          </div>
        )}

        {data !== null && (
          <>
            <div className='form-actions'>
              <button className='btn btn-primary' type='button' onClick={() => { runHealth().catch(() => {}) }} disabled={running || !data.vault.cloned}>
                {running ? 'Running…' : 'Run health check'}
              </button>
              {git?.dirty && (
                <button className='btn btn-primary' type='button' onClick={() => setShowReview(true)}>
                  Review & Commit
                </button>
              )}
              <a className='btn btn-secondary' href='/vault'>Vault settings</a>
            </div>

            {showReview && (
              <ReviewCommitModal
                onClose={() => setShowReview(false)}
                onSuccess={() => { setShowReview(false); load().catch(() => {}) }}
              />
            )}

            <section className='stack-2' aria-label='Vault' data-testid='cc-vault'>
              <h2 className='card-title'>Vault</h2>
              <dl className='data-list'>
                <Row label='Checkout' value={data.vault.cloned ? 'cloned' : 'not cloned'} />
                <Row label='Branch' value={git?.branch ?? data.vault.branch} />
                <Row label='Commit' value={git?.commit === undefined || git?.commit === null ? '—' : git.commit.slice(0, 10)} />
                <Row label='Working tree' value={git?.dirty === true ? `dirty (${git.changedFiles.length})` : 'clean'} />
                <Row label='Write lock' value={data.lock.held ? 'held' : 'free'} />
              </dl>
            </section>

            <section className='stack-2' aria-label='Queues'>
              <h2 className='card-title'>Queues</h2>
              <dl className='data-list'>
                <Row label='Inbox backlog' value={String(data.inboxBacklog)} />
                <Row label='Health issues' value={data.health === null ? 'not run' : String(data.health.issueCount ?? 'unknown')} />
                <Row label='Recent reports' value={data.recentReports.length === 0 ? 'none' : String(data.recentReports.length)} />
              </dl>
            </section>

            <section className='stack-2' aria-label='Radar'>
              <h2 className='card-title'>Radar</h2>
              <dl className='data-list'>
                <Row label='Stale projects (60+ days)' value={data.radar ? String(data.radar.staleProjects.length) : '0'} />
                <Row label='Stale people (60+ days)' value={data.radar ? String(data.radar.stalePeople.length) : '0'} />
                <Row label='Pages with warnings' value={data.radar ? String(data.radar.warnings.length) : '0'} />
              </dl>
            </section>

            {data.recentReports.length > 0 && (
              <section className='stack-2' aria-labelledby='recent-reports-title'>
                <div className='section-head'>
                  <h2 id='recent-reports-title' className='card-title'>Recent reports</h2>
                  <a href='/reports'>View all</a>
                </div>
                <ul className='report-list'>
                  {data.recentReports.slice(0, 3).map(report => (
                    <li className='report-row recent-report-row' key={report.path}>
                      <div className='report-main'>
                        <span className='report-title'>{report.title}</span>
                        <span className='report-path'>{report.path}</span>
                      </div>
                      <span className='badge'>{report.type === 'markdown' ? 'MD' : report.type.toUpperCase()}</span>
                      <time dateTime={report.date}>{report.date}</time>
                      <a
                        className='btn btn-secondary btn-sm report-action'
                        href={`/api/reports/content/${report.path.split('/').map(encodeURIComponent).join('/')}`}
                        target={report.type === 'html' ? '_blank' : undefined}
                        rel={report.type === 'html' ? 'noreferrer' : undefined}
                      >
                        {report.type === 'html' ? 'Open' : 'Download'}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
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
