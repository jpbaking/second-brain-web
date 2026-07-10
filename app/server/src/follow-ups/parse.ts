import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type FollowUpKind = 'reminder' | 'commitment'
export type CommitmentDirection = 'i-owe' | 'waiting-on'

export interface FollowUpItem {
  id: string
  kind: FollowUpKind
  direction: CommitmentDirection | null
  text: string
  dueDate: string | null
  completed: boolean
  sourceFile: string
  sourceLine: number
  linkedSource: string | null
}

const NOTES = 'memory/notes'

export function parseFollowUps (workspace: string): FollowUpItem[] {
  return [
    ...parseFile(workspace, 'reminders.md', 'reminder'),
    ...parseFile(workspace, 'commitments.md', 'commitment'),
  ]
}

function parseFile (workspace: string, filename: string, kind: FollowUpKind): FollowUpItem[] {
  const sourceFile = `${NOTES}/${filename}`
  const fullPath = path.join(workspace, ...sourceFile.split('/'))
  if (!existsSync(fullPath)) return []
  const result: FollowUpItem[] = []
  let section = ''
  const lines = readFileSync(fullPath, 'utf8').split('\n')

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1]?.toLocaleLowerCase()
    if (heading !== undefined) { section = heading; continue }
    const item = /^- \[([ xX])\]\s+(.+?)\s*$/.exec(line)
    if (item?.[1] === undefined || item[2] === undefined) continue
    const completed = item[1].toLocaleLowerCase() === 'x' || section === 'done'
    const due = /^(\d{4}-\d{2}-\d{2})\s+due:\s*/i.exec(item[2])
    const dueDate = due?.[1] ?? null
    const text = due === null ? item[2].trim() : item[2].slice(due[0].length).trim()
    const sourceLink = /source:\s*\[[^\]]+\]\(([^)]+)\)/i.exec(text)?.[1] ?? null
    const linkedSource = sourceLink === null ? null : resolveLinkedSource(sourceFile, sourceLink)
    const direction = kind === 'commitment'
      ? section === 'i owe' ? 'i-owe' : section === 'waiting on' ? 'waiting-on' : null
      : null
    const sourceLine = index + 1
    result.push({
      id: createHash('sha256').update(`${sourceFile}:${sourceLine}:${line}`).digest('hex').slice(0, 16),
      kind,
      direction,
      text,
      dueDate,
      completed,
      sourceFile,
      sourceLine,
      linkedSource,
    })
  }
  return result
}

function resolveLinkedSource (sourceFile: string, link: string): string | null {
  if (/^[a-z]+:/i.test(link) || link.startsWith('/') || link.includes('\\')) return null
  const withoutFragment = link.split('#')[0] ?? ''
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), withoutFragment))
  if (resolved === '..' || resolved.startsWith('../')) return null
  return resolved
}
