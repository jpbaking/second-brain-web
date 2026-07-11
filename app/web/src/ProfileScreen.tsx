import React, { useState, useEffect } from 'react'

interface PrincipalProfile {
  themeMode?: 'light' | 'dark' | 'system'
  defaultReportStyle?: string
  timezone?: string
  workWeek?: string
}

export function ProfileScreen () {
  const [profile, setProfile] = useState<PrincipalProfile>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetch('/api/profile')
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load profile')
        return r.json()
      })
      .then(data => {
        setProfile(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      })
      if (!res.ok) throw new Error('Failed to save profile')
      const updated = await res.json()
      setProfile(updated)
      setSuccess('Profile saved successfully.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className='app-page'>
        <main className='action-card'>
          <div className='spinner' />
        </main>
      </div>
    )
  }

  return (
    <div className='app-page'>
      <header className='app-hero'>
        <h1 className='app-title'>Principal Profile</h1>
        <p className='app-tagline'>Private settings for your working preferences.</p>
      </header>

      <main className='action-card'>
        {error && <div className='alert alert-danger'>{error}</div>}
        {success && <div className='alert alert-success'>{success}</div>}

        <form onSubmit={handleSave} className='stack-3'>
          <div className='field'>
            <label htmlFor='themeMode' className='label'>Theme Mode</label>
            <select
              id='themeMode'
              className='select'
              value={profile.themeMode || 'system'}
              onChange={e => setProfile({ ...profile, themeMode: e.target.value as any })}
            >
              <option value='system'>System</option>
              <option value='light'>Light</option>
              <option value='dark'>Dark</option>
            </select>
          </div>

          <div className='field'>
            <label htmlFor='timezone' className='label'>Timezone</label>
            <input
              id='timezone'
              type='text'
              className='input'
              placeholder='e.g. Europe/London'
              value={profile.timezone || ''}
              onChange={e => setProfile({ ...profile, timezone: e.target.value })}
            />
          </div>

          <div className='field'>
            <label htmlFor='workWeek' className='label'>Work Week</label>
            <input
              id='workWeek'
              type='text'
              className='input'
              placeholder='e.g. Mon-Fri'
              value={profile.workWeek || ''}
              onChange={e => setProfile({ ...profile, workWeek: e.target.value })}
            />
          </div>

          <div className='field'>
            <label htmlFor='defaultReportStyle' className='label'>Default Report Style</label>
            <input
              id='defaultReportStyle'
              type='text'
              className='input'
              placeholder='e.g. Executive Summary'
              value={profile.defaultReportStyle || ''}
              onChange={e => setProfile({ ...profile, defaultReportStyle: e.target.value })}
            />
          </div>

          <div className='form-actions'>
            <button type='submit' className='btn btn-primary' disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
