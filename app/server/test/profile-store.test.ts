import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getProfile, updateProfile } from '../src/profile/store.js'

describe('profile store', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE principal_profile (
        id TEXT PRIMARY KEY CHECK (id = 'default'),
        preferences_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('returns empty object when no profile exists', () => {
    expect(getProfile(db)).toEqual({})
  })

  it('creates new profile on first update', () => {
    const updated = updateProfile(db, { timezone: 'Europe/London' })
    expect(updated).toEqual({ timezone: 'Europe/London' })
    expect(getProfile(db)).toEqual({ timezone: 'Europe/London' })
  })

  it('merges updates with existing profile', () => {
    updateProfile(db, { timezone: 'Europe/London', workWeek: 'Mon-Fri' })
    
    const updated = updateProfile(db, { timezone: 'UTC' })
    expect(updated).toEqual({ timezone: 'UTC', workWeek: 'Mon-Fri' })
    expect(getProfile(db)).toEqual({ timezone: 'UTC', workWeek: 'Mon-Fri' })
  })

  it('returns empty object if preferences_json is malformed', () => {
    db.prepare("INSERT INTO principal_profile (id, preferences_json, updated_at) VALUES ('default', 'invalid-json', '2026-01-01T00:00:00Z')").run()
    expect(getProfile(db)).toEqual({})
  })
})
