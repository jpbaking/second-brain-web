import type { DatabaseSync } from 'node:sqlite'

export interface ReportProvenance {
  reportPath: string
  sessionId: string
  prompt: string | null
  providerProfileId: string | null
  vaultCommit: string | null
  createdAt: string
}

interface ProvenanceRow {
  report_path: string
  session_id: string
  prompt: string | null
  provider_profile_id: string | null
  vault_commit: string | null
  created_at: string
}

function toProvenance (row: ProvenanceRow): ReportProvenance {
  return {
    reportPath: row.report_path,
    sessionId: row.session_id,
    prompt: row.prompt,
    providerProfileId: row.provider_profile_id,
    vaultCommit: row.vault_commit,
    createdAt: row.created_at,
  }
}

export function saveReportProvenance (db: DatabaseSync, provenance: Omit<ReportProvenance, 'createdAt'>, now: Date = new Date()): void {
  db.prepare(`
    INSERT INTO report_provenance (report_path, session_id, prompt, provider_profile_id, vault_commit, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (report_path) DO UPDATE SET
      session_id = excluded.session_id,
      prompt = excluded.prompt,
      provider_profile_id = excluded.provider_profile_id,
      vault_commit = excluded.vault_commit,
      created_at = excluded.created_at
  `).run(
    provenance.reportPath,
    provenance.sessionId,
    provenance.prompt ?? null,
    provenance.providerProfileId ?? null,
    provenance.vaultCommit ?? null,
    now.toISOString()
  )
}

export function getReportProvenance (db: DatabaseSync, reportPath: string): ReportProvenance | undefined {
  const row = db.prepare('SELECT * FROM report_provenance WHERE report_path = ?').get(reportPath) as ProvenanceRow | undefined
  return row === undefined ? undefined : toProvenance(row)
}

export function deleteReportProvenance (db: DatabaseSync, reportPath: string): boolean {
  const changes = db.prepare('DELETE FROM report_provenance WHERE report_path = ?').run(reportPath).changes
  return Number(changes) > 0
}
