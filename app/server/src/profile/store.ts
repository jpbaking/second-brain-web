import type { DatabaseSync } from 'node:sqlite'

export interface PrincipalProfile {
  themeMode?: 'light' | 'dark' | 'system'
  defaultReportStyle?: string
  timezone?: string
  workWeek?: string
}

export function getProfile (db: DatabaseSync): PrincipalProfile {
  const row = db.prepare('SELECT preferences_json FROM principal_profile WHERE id = ?').get('default') as { preferences_json: string } | undefined
  if (!row) {
    return {}
  }
  try {
    return JSON.parse(row.preferences_json) as PrincipalProfile
  } catch (err) {
    return {}
  }
}

export function updateProfile (db: DatabaseSync, updates: Partial<PrincipalProfile>): PrincipalProfile {
  const current = getProfile(db)
  const next: PrincipalProfile = { ...current, ...updates }

  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO principal_profile (id, preferences_json, updated_at)
    VALUES ('default', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      preferences_json = excluded.preferences_json,
      updated_at = excluded.updated_at
  `).run(JSON.stringify(next), now)

  return next
}
