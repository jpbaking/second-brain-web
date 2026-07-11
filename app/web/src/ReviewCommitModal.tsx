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
    fileDiffs?: Record<string, string>
    fileContents?: Record<string, string>
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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [previewMode, setPreviewMode] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/vault/review', { credentials: 'same-origin' })
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load review')
        return await r.json() as ReviewData
      })
      .then(data => {
        setReview(data)
        setSelectedFiles(new Set(data.git.changedFiles))
      })
      .catch(e => setError(e.message))
  }, [])

  async function handleCommit () {
    setCommitting(true)
    try {
      const res = await fetch('/api/vault/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: Array.from(selectedFiles) }),
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

  async function handleDiscard () {
    const files = Array.from(selectedFiles)
    if (files.length === 0) return
    if (!window.confirm(`Are you sure you want to discard changes in ${files.length} file(s)?`)) return
    setCommitting(true)
    try {
      const res = await fetch('/api/vault/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
        credentials: 'same-origin'
      })
      const body = await res.json().catch(() => ({})) as { message?: string, error?: string }
      if (!res.ok) throw new Error(body.message ?? body.error ?? 'Discard failed.')
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Discard failed.')
      setCommitting(false)
    }
  }

  function toggleSelect (f: string) {
    const next = new Set(selectedFiles)
    if (next.has(f)) next.delete(f)
    else next.add(f)
    setSelectedFiles(next)
  }

  function toggleExpand (f: string) {
    const next = new Set(expandedFiles)
    if (next.has(f)) next.delete(f)
    else next.add(f)
    setExpandedFiles(next)
  }

  function togglePreviewMode (f: string) {
    const next = new Set(previewMode)
    if (next.has(f)) next.delete(f)
    else next.add(f)
    setPreviewMode(next)
  }

  const healthPasses = review?.health.available === true && review.health.issueCount === 0
  const canSubmit = review !== null && (!review.git.dirty || healthPasses) && selectedFiles.size > 0

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
                      <ul style={{ margin: 0, paddingLeft: '0', listStyle: 'none' }}>
                        {files.map(f => (
                          <li key={f} style={{ display: 'flex', flexDirection: 'column', marginBottom: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input type='checkbox' checked={selectedFiles.has(f)} onChange={() => toggleSelect(f)} disabled={committing} />
                              <code>{f}</code>
                              <button type='button' className='btn' style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }} onClick={() => toggleExpand(f)}>
                                {expandedFiles.has(f) ? 'Hide diff' : 'Show diff'}
                              </button>
                              {expandedFiles.has(f) && review?.git.fileContents?.[f] !== undefined && (
                                <button type='button' className='btn' style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }} onClick={() => togglePreviewMode(f)}>
                                  {previewMode.has(f) ? 'View diff' : 'Preview file'}
                                </button>
                              )}
                            </div>
                            {expandedFiles.has(f) && (
                              previewMode.has(f) && review?.git.fileContents?.[f] !== undefined
                                ? (
                                  <pre className='review-output' style={{ marginTop: '0.25rem', fontSize: '0.85em', padding: '0.5rem', backgroundColor: 'var(--bg-card)', whiteSpace: 'pre-wrap' }}>
                                    {review.git.fileContents[f]}
                                  </pre>
                                  )
                                : review?.git.fileDiffs?.[f] && (
                                  <pre className='review-output' style={{ marginTop: '0.25rem', fontSize: '0.85em', padding: '0.5rem', backgroundColor: 'var(--bg-card)' }}>
                                    {review.git.fileDiffs[f]}
                                  </pre>
                                )
                            )}
                          </li>
                        ))}
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
            {committing ? 'Committing…' : review?.git.dirty === false ? 'Retry push' : `Commit ${selectedFiles.size} file(s)`}
          </button>
          <button
            className='btn btn-danger'
            onClick={handleDiscard}
            disabled={selectedFiles.size === 0 || committing}
          >
            Discard selected
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
