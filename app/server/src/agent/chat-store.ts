import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Chat session + event store (milestone 5A). A chat session maps 1:1 to a live
 * SDK session while the process lives; the mapping (`sdkSessionId`) plus the
 * append-only `chat_events` log are what let the app rehydrate after a restart
 * (findings m00-10: app-side rehydration is the primary continuity path).
 *
 * `chat_events.seq` is a per-session monotonic cursor — the SSE replay key
 * (`Last-Event-ID`) in m5a-06.
 */

export type ChatSessionStatus = 'active' | 'closed'
/**
 * Approval modes (m53). Manual: only vault reads + safe commands auto-run.
 * Normal: vault operations auto-run, destructive/outside ask. Auto includes
 * destructive filesystem work, while vault invariants and Git-history
 * protections remain absolute. Chat: no vault access without asking. Legacy
 * values map via {@link normalisePreset}.
 */
export type ApprovalPreset = 'manual' | 'normal' | 'auto' | 'chat'
export const APPROVAL_PRESETS = ['manual', 'normal', 'auto', 'chat'] as const

/** Accept current or legacy preset names ('read-only'→manual, 'high-trust'→auto). */
export function normalisePreset (value: unknown): ApprovalPreset | undefined {
  if (value === 'read-only') return 'manual'
  if (value === 'high-trust') return 'auto'
  return (APPROVAL_PRESETS as readonly string[]).includes(value as string) ? value as ApprovalPreset : undefined
}
/** SDK reasoning-effort levels (@cline/shared REASONING_EFFORT_RATIOS). */
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = typeof REASONING_EFFORTS[number]

export interface ChatSession {
  id: string
  title: string
  providerProfileId: string | null
  sdkSessionId: string | null
  status: ChatSessionStatus
  approvalPreset: ApprovalPreset
  thinking: boolean
  reasoningEffort: ReasoningEffort | null
  pinned: boolean
  compactionSummary: string | null
  compactedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatEvent {
  id: number
  sessionId: string
  seq: number
  type: string
  payload: unknown
  createdAt: string
}

export interface CreateSessionInput {
  title: string
  providerProfileId?: string | null
  approvalPreset?: ApprovalPreset
}

interface SessionRow {
  id: string
  title: string
  provider_profile_id: string | null
  sdk_session_id: string | null
  status: string
  approval_preset: string
  thinking: number
  reasoning_effort: string | null
  pinned: number
  compaction_summary: string | null
  compacted_at: string | null
  created_at: string
  updated_at: string
}

interface EventRow {
  id: number
  session_id: string
  seq: number
  type: string
  payload_json: string | null
  created_at: string
}

function toSession (row: SessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    providerProfileId: row.provider_profile_id,
    sdkSessionId: row.sdk_session_id,
    status: row.status === 'closed' ? 'closed' : 'active',
    approvalPreset: normalisePreset(row.approval_preset) ?? 'normal',
    thinking: row.thinking === 1,
    reasoningEffort: (row.reasoning_effort as ReasoningEffort | null) ?? null,
    pinned: row.pinned === 1,
    compactionSummary: row.compaction_summary,
    compactedAt: row.compacted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toEvent (row: EventRow): ChatEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    seq: row.seq,
    type: row.type,
    payload: row.payload_json === null ? null : JSON.parse(row.payload_json),
    createdAt: row.created_at,
  }
}

function sessionRow (db: DatabaseSync, id: string): SessionRow | undefined {
  return db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as SessionRow | undefined
}

export function createSession (db: DatabaseSync, input: CreateSessionInput, now: Date = new Date()): ChatSession {
  const id = randomUUID()
  const iso = now.toISOString()
  const preset = input.approvalPreset ?? 'normal'
  db.prepare(`
    INSERT INTO chat_sessions (id, title, provider_profile_id, sdk_session_id, status, approval_preset, compaction_summary, compacted_at, created_at, updated_at)
    VALUES (?, ?, ?, NULL, 'active', ?, NULL, NULL, ?, ?)
  `).run(id, input.title, input.providerProfileId ?? null, preset, iso, iso)
  return toSession(sessionRow(db, id) as SessionRow)
}

export function listSessions (db: DatabaseSync): ChatSession[] {
  const rows = db.prepare("SELECT * FROM chat_sessions WHERE status = 'active' ORDER BY pinned DESC, updated_at DESC").all() as unknown as SessionRow[]
  return rows.map(toSession)
}

/**
 * Sessions whose title or message bodies match `query` (m62-03). Bodies are
 * the user_message and assistant chunk events; matching runs over the raw
 * payload JSON, which is where the text lives. Empty query = all sessions.
 */
export function searchSessions (db: DatabaseSync, query: string): ChatSession[] {
  const trimmed = query.trim()
  if (trimmed === '') return listSessions(db)
  const like = `%${trimmed.replace(/[\\%_]/g, ch => `\\${ch}`)}%`
  const rows = db.prepare(`
    SELECT * FROM chat_sessions
    WHERE status = 'active' AND (
      title LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM chat_events e
        WHERE e.session_id = chat_sessions.id
          AND e.type IN ('user_message', 'chunk')
          AND e.payload_json LIKE ? ESCAPE '\\'
      )
    )
    ORDER BY pinned DESC, updated_at DESC
  `).all(like, like) as unknown as SessionRow[]
  return rows.map(toSession)
}

export function setSessionPinned (db: DatabaseSync, id: string, pinned: boolean): boolean {
  return db.prepare('UPDATE chat_sessions SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id).changes > 0
}

export function deleteSessions (db: DatabaseSync, preservePinned: boolean): number {
  const result = preservePinned
    ? db.prepare('DELETE FROM chat_sessions WHERE pinned = 0').run()
    : db.prepare('DELETE FROM chat_sessions').run()
  return Number(result.changes)
}

export function getSession (db: DatabaseSync, id: string): ChatSession | undefined {
  const row = sessionRow(db, id)
  return row === undefined ? undefined : toSession(row)
}

/** Look a session up by its live SDK session id (for event routing / rehydrate). */
export function getSessionBySdkId (db: DatabaseSync, sdkSessionId: string): ChatSession | undefined {
  const row = db.prepare('SELECT * FROM chat_sessions WHERE sdk_session_id = ?').get(sdkSessionId) as SessionRow | undefined
  return row === undefined ? undefined : toSession(row)
}

export function renameSession (db: DatabaseSync, id: string, title: string, now: Date = new Date()): boolean {
  return db.prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, now.toISOString(), id).changes > 0
}

export function updateSessionConfig (db: DatabaseSync, id: string, providerProfileId: string, approvalPreset: ApprovalPreset, now: Date = new Date()): boolean {
  return db.prepare('UPDATE chat_sessions SET provider_profile_id = ?, approval_preset = ?, updated_at = ? WHERE id = ?')
    .run(providerProfileId, approvalPreset, now.toISOString(), id).changes > 0
}

/** Update the per-session reasoning tuning (m50). Effort null = provider default. */
export function updateSessionTuning (db: DatabaseSync, id: string, thinking: boolean, reasoningEffort: ReasoningEffort | null, now: Date = new Date()): boolean {
  return db.prepare('UPDATE chat_sessions SET thinking = ?, reasoning_effort = ?, updated_at = ? WHERE id = ?')
    .run(thinking ? 1 : 0, reasoningEffort, now.toISOString(), id).changes > 0
}

export function saveCompaction (db: DatabaseSync, id: string, summary: string, now: Date = new Date()): boolean {
  const iso = now.toISOString()
  return db.prepare('UPDATE chat_sessions SET compaction_summary = ?, compacted_at = ?, updated_at = ? WHERE id = ?').run(summary, iso, iso, id).changes > 0
}

export function closeSession (db: DatabaseSync, id: string, now: Date = new Date()): boolean {
  const changes = db.prepare("UPDATE chat_sessions SET status = 'closed', updated_at = ? WHERE id = ?")
    .run(now.toISOString(), id).changes
  return Number(changes) > 0
}

/** Bind (or rebind, on rehydration) the chat session to an SDK session id. */
export function setSdkSessionId (db: DatabaseSync, id: string, sdkSessionId: string | null, now: Date = new Date()): boolean {
  const changes = db.prepare('UPDATE chat_sessions SET sdk_session_id = ?, updated_at = ? WHERE id = ?')
    .run(sdkSessionId, now.toISOString(), id).changes
  return Number(changes) > 0
}

/** Append an event; seq is the next per-session value. Throws if the session is gone. */
export function appendEvent (
  db: DatabaseSync,
  sessionId: string,
  type: string,
  payload: unknown = null,
  now: Date = new Date()
): ChatEvent {
  if (sessionRow(db, sessionId) === undefined) throw new Error(`unknown chat session: ${sessionId}`)
  const next = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM chat_events WHERE session_id = ?')
    .get(sessionId) as { seq: number }
  const info = db.prepare(`
    INSERT INTO chat_events (session_id, seq, type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, next.seq, type, payload === undefined ? null : JSON.stringify(payload ?? null), now.toISOString())
  // Activity bumps the session so listSessions (updated_at DESC) reflects the
  // truly last-active chat — the landing page depends on this ordering.
  db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(now.toISOString(), sessionId)
  return {
    id: Number(info.lastInsertRowid),
    sessionId,
    seq: next.seq,
    type,
    payload: payload ?? null,
    createdAt: now.toISOString(),
  }
}

/** Events with seq strictly greater than `afterSeq` (0 replays everything). */
export function readEventsSince (db: DatabaseSync, sessionId: string, afterSeq = 0): ChatEvent[] {
  const rows = db.prepare('SELECT * FROM chat_events WHERE session_id = ? AND seq > ? ORDER BY seq')
    .all(sessionId, afterSeq) as unknown as EventRow[]
  return rows.map(toEvent)
}
