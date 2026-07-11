import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export type ReportType = 'html' | 'pdf' | 'markdown'

export interface ReportMetadata {
  path: string
  title: string
  type: ReportType
  year: number | null
  date: string
  mtime: string
  bytes: number
  provenance?: {
    sessionId: string
    prompt: string | null
    providerProfileId: string | null
    vaultCommit: string | null
    createdAt: string
  }
}

const TYPES: Record<string, ReportType | undefined> = {
  '.html': 'html',
  '.pdf': 'pdf',
  '.md': 'markdown',
}

export function scanReports (workspace: string): ReportMetadata[] {
  const root = path.join(workspace, 'reports')
  if (!existsSync(root)) return []
  const reports: ReportMetadata[] = []

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const type = TYPES[path.extname(entry.name).toLowerCase()]
      if (type === undefined) continue
      const stats = statSync(full)
      const relative = path.relative(root, full).split(path.sep).join('/')
      const yearPart = relative.split('/')[0] ?? ''
      const year = /^\d{4}$/.test(yearPart) ? Number(yearPart) : null
      const filenameDate = /(\d{4}-\d{2}-\d{2})/.exec(entry.name)?.[1]
      reports.push({
        path: relative,
        title: reportTitle(full, type, entry.name),
        type,
        year,
        date: filenameDate ?? stats.mtime.toISOString().slice(0, 10),
        mtime: stats.mtime.toISOString(),
        bytes: stats.size,
      })
    }
  }
  walk(root)
  return reports.sort((a, b) => b.mtime.localeCompare(a.mtime) || a.path.localeCompare(b.path))
}

function reportTitle (fullPath: string, type: ReportType, filename: string): string {
  if (type === 'html') {
    const source = readFileSync(fullPath, 'utf8').slice(0, 256 * 1024)
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1]
    if (title !== undefined) return decodeBasicEntities(title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
  }
  if (type === 'markdown') {
    const source = readFileSync(fullPath, 'utf8').slice(0, 256 * 1024)
    const heading = /^#\s+(.+?)\s*$/m.exec(source)?.[1]
    if (heading !== undefined) return heading.trim()
  }
  return path.basename(filename, path.extname(filename)).replaceAll(/[-_]+/g, ' ').trim()
}

function decodeBasicEntities (value: string): string {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
}
