import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { vaultWorkspacePath } from '../vault/config.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Explorer API (milestone 66). A read-only file browser over the vault
 * checkout. `GET /api/explorer/tree` lists one directory (directories first,
 * dotfiles and `.git` hidden); `GET /api/explorer/file` returns a size-capped
 * text or Markdown body for preview. All paths are vault-relative and pass
 * the safe-path guard; symlinks are never followed.
 *
 * Guarded by the m02 auth guard (a non-health/status/auth `/api/` route).
 */

export interface ExplorerEntry { name: string, path: string, kind: 'dir' | 'file', size: number }
export interface ExplorerTree { path: string, entries: ExplorerEntry[] }
export interface ExplorerFile {
  path: string
  title: string
  size: number
  kind: 'markdown' | 'text' | 'binary'
  content: string
  truncated: boolean
}

const CONTENT_CAP = 256 * 1024

export function registerExplorerRoutes (app: FastifyInstance, config: AppConfig): void {
  app.get('/api/explorer/tree', async (req, reply) => {
    const target = (req.query as { path?: string }).path ?? ''
    if (target !== '' && !isSafeVaultPath(target)) {
      return await reply.code(400).send({ error: 'A valid vault path is required.' })
    }
    const ws = vaultWorkspacePath(config.dataDir)
    const full = target === '' ? ws : path.join(ws, ...target.split('/'))
    if (!existsSync(full) || !lstatSync(full).isDirectory()) {
      return await reply.code(404).send({ error: 'No such folder in the vault.' })
    }
    const entries: ExplorerEntry[] = readdirSync(full, { withFileTypes: true })
      .filter(entry => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isFile()))
      .map(entry => {
        const rel = target === '' ? entry.name : `${target}/${entry.name}`
        return {
          name: entry.name,
          path: rel,
          kind: entry.isDirectory() ? 'dir' as const : 'file' as const,
          size: entry.isFile() ? statSync(path.join(full, entry.name)).size : 0,
        }
      })
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
    return { path: target, entries } satisfies ExplorerTree
  })

  app.get('/api/explorer/file', async (req, reply) => {
    const target = (req.query as { path?: string }).path
    if (typeof target !== 'string' || !isSafeVaultPath(target)) {
      return await reply.code(400).send({ error: 'A valid vault path is required.' })
    }
    const full = path.join(vaultWorkspacePath(config.dataDir), ...target.split('/'))
    // Only real (non-symlink) files are readable.
    if (!existsSync(full) || !lstatSync(full).isFile()) {
      return await reply.code(404).send({ error: 'No such file in the vault.' })
    }
    const size = statSync(full).size
    const buffer = readFileSync(full).subarray(0, CONTENT_CAP)
    const kind = buffer.includes(0)
      ? 'binary' as const
      : path.extname(full).toLowerCase() === '.md' ? 'markdown' as const : 'text' as const
    return {
      path: target,
      title: titleOf(target),
      size,
      kind,
      content: kind === 'binary' ? '' : buffer.toString('utf8'),
      truncated: kind !== 'binary' && size > CONTENT_CAP,
    } satisfies ExplorerFile
  })
}

/**
 * A vault-relative path is safe if it has no traversal, absolute, or
 * backslash parts. Dot-prefixed segments (`.git`, dotfiles) are refused too:
 * the browser hides them, so serving them would leak what the UI never shows.
 */
export function isSafeVaultPath (target: string): boolean {
  if (target === '' || target.startsWith('/') || target.includes('\\')) return false
  const segments = target.split('/')
  return segments.every(segment => segment !== '' && !segment.startsWith('.'))
}

/** A readable title from a vault path: the file name without extension, spaced. */
export function titleOf (filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.[^.]+$/, '').replaceAll(/[-_]+/g, ' ').trim()
}
