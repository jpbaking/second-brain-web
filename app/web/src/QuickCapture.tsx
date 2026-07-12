import { useRef, useState } from 'react'
import { AppHero } from './AppHero.js'

export function QuickCapture () {
  const [mode, setMode] = useState<'note' | 'upload'>('note')
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
      <AppHero title='Quick capture' tagline='Jot down a thought to process later.' />

      <main className='action-card' aria-live='polite'>
        <div className='tab-list' role='tablist' aria-label='Capture type'>
          <button
            type='button'
            className={`tab${mode === 'note' ? ' active' : ''}`}
            role='tab'
            aria-selected={mode === 'note'}
            aria-controls='note-capture-panel'
            id='note-capture-tab'
            onClick={() => setMode('note')}
          >
            Note
          </button>
          <button
            type='button'
            className={`tab${mode === 'upload' ? ' active' : ''}`}
            role='tab'
            aria-selected={mode === 'upload'}
            aria-controls='upload-intake-panel'
            id='upload-intake-tab'
            onClick={() => setMode('upload')}
          >
            Upload
          </button>
        </div>

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

        {mode === 'note'
          ? (
            <form
              id='note-capture-panel'
              role='tabpanel'
              aria-labelledby='note-capture-tab'
              onSubmit={(e) => { handleSubmit(e).catch(() => {}) }}
              className='stack-2'
            >
              <div className='field'>
                <label htmlFor='capture-content' className='label'>Note</label>
                <textarea
                  id='capture-content'
                  className='textarea'
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
            )
          : <InboxIntakeFields />}
      </main>
    </div>
  )
}

function InboxIntakeFields () {
  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upload, setUpload] = useState<{ uploadId: string, path: string } | null>(null)
  const [processingSessionId, setProcessingSessionId] = useState<string | null>(null)

  function addFiles (incoming: FileList | File[]) {
    setUpload(null)
    setProcessingSessionId(null)
    setError(null)
    setFiles((current) => {
      const byIdentity = new Map(current.map((file) => [fileIdentity(file), file]))
      for (const file of Array.from(incoming)) byIdentity.set(fileIdentity(file), file)
      return Array.from(byIdentity.values())
    })
  }

  async function submitUpload (event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    setUpload(null)
    setProcessingSessionId(null)
    try {
      const body = new FormData(event.currentTarget)
      body.delete('files')
      for (const file of files) body.append('files', file, file.webkitRelativePath || file.name)
      const response = await fetch('/api/uploads', { method: 'POST', body })
      if (response.status === 401) return window.location.assign('/login')
      const result = await response.json() as { uploadId?: string, path?: string, error?: string }
      if (!response.ok || result.uploadId === undefined || result.path === undefined) {
        throw new Error(result.error ?? 'Upload failed.')
      }
      setUpload({ uploadId: result.uploadId, path: result.path })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function processUpload () {
    if (upload === null) return
    setProcessing(true)
    setError(null)
    try {
      const response = await fetch(`/api/uploads/${encodeURIComponent(upload.uploadId)}/process`, { method: 'POST' })
      if (response.status === 401) return window.location.assign('/login')
      const result = await response.json() as { sessionId?: string, error?: string }
      if (!response.ok || result.sessionId === undefined) throw new Error(result.error ?? 'Could not start inbox processing.')
      setProcessingSessionId(result.sessionId)
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'Could not start inbox processing.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form
      id='upload-intake-panel'
      className='tab-panel stack-3'
      role='tabpanel'
      aria-labelledby='upload-intake-tab'
      onSubmit={(event) => { submitUpload(event).catch(() => {}) }}
    >
      <div>
        <h2 className='card-title'>Intake details</h2>
        <p className='card-description'>Add context for the secretary. All fields are optional.</p>
      </div>

      <div
        className={`upload-dropzone${dragging ? ' is-dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        <input
          ref={fileInput}
          id='intake-files'
          className='sr-only'
          type='file'
          multiple
          onChange={(event) => {
            if (event.target.files !== null) addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <span className='upload-dropzone-title'>Drop files here</span>
        <span className='upload-dropzone-copy'>or choose them from this device</span>
        <button type='button' className='btn btn-secondary btn-sm' onClick={() => fileInput.current?.click()}>
          Choose files
        </button>
      </div>

      {files.length > 0 && (
        <div className='stack-2' aria-live='polite'>
          <h3 className='label'>Selected files ({files.length})</h3>
          <ul className='upload-file-list'>
            {files.map((file) => (
              <li key={fileIdentity(file)} className='upload-file-row'>
                <span className='upload-file-name'>{file.name}</span>
                <span className='upload-file-size'>{formatFileSize(file.size)}</span>
                <button
                  type='button'
                  className='btn btn-quiet btn-sm'
                  aria-label={`Remove ${file.name}`}
                  title={`Remove ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((item) => fileIdentity(item) !== fileIdentity(file)))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error !== null && (
        <div className='alert alert-danger' role='alert'>
          <span className='alert-title'>Upload</span>
          <span>{error}</span>
        </div>
      )}

      {upload !== null && (
        <div className='alert alert-success' role='status'>
          <span className='alert-title'>Uploaded</span>
          <span>{upload.path}</span>
        </div>
      )}

      {processingSessionId !== null && (
        <div className='alert alert-info' role='status'>
          <span className='alert-title'>Inbox processing started</span>
          <a href='/chat'>Open chat</a>
        </div>
      )}

      <div className='field'>
        <label htmlFor='intake-description' className='label'>Short description</label>
        <input id='intake-description' name='description' className='input' type='text' />
      </div>

      <div className='grid-2'>
        <div className='field'>
          <label htmlFor='intake-date' className='label'>Date received or created</label>
          <input id='intake-date' name='date' className='input' type='date' />
        </div>
        <div className='field'>
          <label htmlFor='intake-urgency' className='label'>Urgency</label>
          <select id='intake-urgency' name='urgency' className='select' defaultValue='normal'>
            <option value='low'>Low</option>
            <option value='normal'>Normal</option>
            <option value='high'>High</option>
            <option value='urgent'>Urgent</option>
          </select>
        </div>
      </div>

      <div className='grid-2'>
        <div className='field'>
          <label htmlFor='intake-people' className='label'>Related people</label>
          <input id='intake-people' name='people' className='input' type='text' />
        </div>
        <div className='field'>
          <label htmlFor='intake-projects' className='label'>Related projects</label>
          <input id='intake-projects' name='projects' className='input' type='text' />
        </div>
      </div>

      <div className='field'>
        <label htmlFor='intake-workflow' className='label'>Desired handling</label>
        <select id='intake-workflow' name='workflow' className='select' defaultValue='process-inbox'>
          <option value='process-inbox'>Process inbox</option>
          <option value='create-report'>Create a report</option>
          <option value='prep-meeting'>Prepare for a meeting</option>
          <option value='file-later'>File for later</option>
        </select>
      </div>

      <div className='field'>
        <label htmlFor='intake-notes' className='label'>Notes for the secretary</label>
        <textarea id='intake-notes' name='notes' className='textarea' rows={4} />
      </div>

      <div className='form-actions'>
        <button type='submit' className='btn btn-primary' disabled={uploading || files.length === 0}>
          {uploading ? 'Uploading…' : 'Upload files'}
        </button>
        {upload !== null && processingSessionId === null && (
          <button
            type='button'
            className='btn btn-secondary'
            disabled={processing}
            onClick={() => { processUpload().catch(() => {}) }}
          >
            {processing ? 'Starting…' : 'Process inbox'}
          </button>
        )}
      </div>
    </form>
  )
}

function fileIdentity (file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function formatFileSize (bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
