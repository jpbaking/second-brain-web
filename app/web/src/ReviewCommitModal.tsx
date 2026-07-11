import { useState, useEffect } from 'react'

export interface ReviewCommitModalProps {
  onClose: () => void
  onSuccess: () => void
}

interface ReviewData {
  git: {
    dirty: boolean
    changedFiles: string[]
    diffSummary: string | null
  }
  health: {
    available: boolean
    issueCount: number | null
    message?: string
  }
}

function getNewPath (fileStr: string): string {
  const parts = fileStr.split(' -> ')
  return parts.length === 2 ? (parts[1] as string) : (parts[0] as string)
}

function getSemanticGroup (path: string): string {
  if (path.startsWith('memory/')) return 'Memory Logs'
  if (path.startsWith('inbox/')) return 'Inbox'
  if (path.startsWith('reports/')) return 'Reports'
  if (path.startsWith('docs/')) return 'Documentation'
  return 'Other'
}

export function ReviewCommitModal ({ onClose, onSuccess }: ReviewCommitModalProps) {
  const [review, setReview] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    fetch('/api/vault/review', { credentials: 'same-origin' })
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load review')
        return await r.json() as ReviewData
      })
      .then(setReview)
      .catch(e => setError(e.message))
  }, [])

  async function handleCommit () {
    setCommitting(true)
    try {
      const res = await fetch('/api/vault/commit', {
        method: 'POST',
        credentials: 'same-origin'
      })
      const body = await res.json().catch(() => ({})) as { message?: string, error?: string, stage?: string }
      if (!res.ok) {
        const prefix = body.stage === undefined ? '' : `${body.stage}: `
        throw new Error(prefix + (body.message ?? body.error ?? 'Commit and push failed.'))
      }
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Commit and push failed.')
      setCommitting(false)
    }
  }

  const healthPasses = review?.health.available === true && review.health.issueCount === 0
  const canSubmit = review !== null && (!review.git.dirty || healthPasses)

  const groups: Record<string, string[]> = {}
  if (review) {
    for (const file of review.git.changedFiles) {
      const newPath = getNewPath(file)
      const group = getSemanticGroup(newPath)
      if (!groups[group]) groups[group] = []
      groups[group].push(file)
    }
  }

  return (
    <div className='review-backdrop' role='dialog' aria-modal='true' aria-labelledby='review-title'>
      <div className='action-card review-dialog'>
        <h2 id='review-title' className='card-title'>Review and commit</h2>

        {error && (
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Error</span>
            <span>{error}</span>
          </div>
        )}

        {review
          ? (
            <div className='stack-2'>
              <div>
                <strong>Changed files ({review.git.changedFiles.length})</strong>
                <div className='review-output' style={{ padding: '0.5rem', backgroundColor: 'var(--bg-inset)', borderRadius: '4px' }}>
                  {Object.entries(groups).map(([group, files]) => (
                    <div key={group} style={{ marginBottom: '0.5rem' }}>
                      <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{group}</strong>
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {files.map(f => <li key={f}><code>{f}</code></li>)}
                      </ul>
                    </div>
                  ))}
                  {Object.keys(groups).length === 0 && <p style={{ margin: 0 }}>No files changed.</p>}
                </div>
              </div>

              {review.git.diffSummary && (
                <div>
                  <strong>Diff summary</strong>
                  <pre className='review-output'>
                    {review.git.diffSummary}
                  </pre>
                </div>
              )}

              <div>
                <strong>Health check</strong>
                {review.health.available
                  ? (
                    <p>Issues: {review.health.issueCount ?? 'unknown'}</p>
                    )
                  : (
                    <p>Not available</p>
                    )}
                {review.git.dirty && !healthPasses && (
                  <p className='field-error'>Commit and push are blocked until the vault health check passes.</p>
                )}
              </div>
            </div>
            )
          : (
            <p>Loading review…</p>
            )}

        <div className='form-actions'>
          <button
            className='btn btn-primary'
            onClick={handleCommit}
            disabled={!canSubmit || committing}
          >
            {committing ? 'Committing…' : review?.git.dirty === false ? 'Retry push' : 'Commit and push'}
          </button>
          <button
            className='btn btn-secondary'
            onClick={onClose}
            disabled={committing}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
