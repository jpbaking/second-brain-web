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
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message || 'Commit failed')
      }
      onSuccess()
    } catch (e: any) {
      setError(e.message)
      setCommitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}
    >
      <div className='action-card' style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className='card-title'>Review & Commit</h2>

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
                <strong>Changed Files ({review.git.changedFiles.length})</strong>
                <pre style={{ fontSize: '0.8rem', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                  {review.git.changedFiles.join('\n')}
                </pre>
              </div>

              {review.git.diffSummary && (
                <div>
                  <strong>Diff Summary</strong>
                  <pre style={{ fontSize: '0.8rem', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                    {review.git.diffSummary}
                  </pre>
                </div>
              )}

              <div>
                <strong>Health Check</strong>
                {review.health.available
                  ? (
                    <p>Issues: {review.health.issueCount ?? 'unknown'}</p>
                    )
                  : (
                    <p>Not available</p>
                    )}
              </div>
            </div>
            )
          : (
            <p>Loading review...</p>
            )}

        <div className='form-actions' style={{ marginTop: '24px' }}>
          <button
            className='btn btn-primary'
            onClick={handleCommit}
            disabled={!review || committing}
          >
            {committing ? 'Committing...' : 'Confirm'}
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
