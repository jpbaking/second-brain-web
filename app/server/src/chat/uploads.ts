import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { openCoreDb } from '../db.js'
import { getSession } from '../agent/chat-store.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

/**
 * Chat-scoped attachments (milestone 49). Files attached to a chat message
 * never touch the vault inbox: they live under `dataDir/chat-uploads/
 * <chatSessionId>/<attachmentId>/<name>` and exist only for that chat's
 * context. Images are later sent to the SDK as data URIs (`userImages`);
 * everything else goes by filesystem path (`userFiles`, whose text content
 * the local runtime reads into the conversation). The directory is removed
 * when the session is deleted.
 *
 * The multipart parser (per-file size cap, file-count cap) is registered
 * globally by the vault upload routes (`registerUploadRoutes`).
 */

/** Attachments per message — a chat turn, not a bulk intake. */
const MAX_ATTACHMENTS = 10

export interface ChatAttachment {
  id: string
  name: string
  bytes: number
  kind: 'image' | 'file'
}

/** An attachment resolved to its stored file for an agent turn (m49-02). */
export interface ResolvedAttachment extends ChatAttachment {
  absolutePath: string
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

export function chatUploadsRoot (dataDir: string): string {
  return path.join(dataDir, 'chat-uploads')
}

export function sessionUploadsDir (dataDir: string, chatSessionId: string): string {
  return path.join(chatUploadsRoot(dataDir), chatSessionId)
}

export function attachmentKind (name: string): 'image' | 'file' {
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()) ? 'image' : 'file'
}

export class UnsafeAttachmentNameError extends Error {}

/**
 * Attachments are single files: keep only the basename, strip control
 * characters, and refuse anything that could traverse out of the store.
 */
export function safeAttachmentName (filename: string): string {
  const base = path.basename(filename.replaceAll('\\', '/'))
  if (base === '' || base === '.' || base === '..' || base.includes('\0')) {
    throw new UnsafeAttachmentNameError('Unsafe attachment name.')
  }
  const safe = Array.from(base, character => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127 ? '_' : character
  }).join('').slice(0, 180)
  if (safe === '' || safe === '.' || safe === '..') throw new UnsafeAttachmentNameError('Unsafe attachment name.')
  return safe
}

function createAttachmentId (): string {
  return randomBytes(8).toString('hex')
}

const ATTACHMENT_ID_PATTERN = /^[a-f0-9]{16}$/

/**
 * Resolve pending attachment ids to their stored files, in the order given.
 * Unknown ids throw — the message send must fail loudly rather than silently
 * drop a file the user attached.
 */
export async function resolveAttachments (dataDir: string, chatSessionId: string, ids: string[]): Promise<ResolvedAttachment[]> {
  const resolved: ResolvedAttachment[] = []
  for (const id of ids) {
    if (!ATTACHMENT_ID_PATTERN.test(id)) throw new Error(`invalid attachment id: ${id}`)
    const dir = path.join(sessionUploadsDir(dataDir, chatSessionId), id)
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      throw new Error(`unknown attachment: ${id}`)
    }
    const name = entries[0]
    if (name === undefined) throw new Error(`unknown attachment: ${id}`)
    const absolutePath = path.join(dir, name)
    const info = await stat(absolutePath)
    resolved.push({ id, name, bytes: info.size, kind: attachmentKind(name), absolutePath })
  }
  return resolved
}

/** Encode a stored image attachment as a data URI for the SDK's userImages. */
export async function imageDataUri (attachment: ResolvedAttachment): Promise<string> {
  const mime = IMAGE_MIME[path.extname(attachment.name).toLowerCase()] ?? 'application/octet-stream'
  const content = await readFile(attachment.absolutePath)
  return `data:${mime};base64,${content.toString('base64')}`
}

/** Remove every attachment stored for a chat session (session delete/clear). */
export async function deleteSessionUploads (dataDir: string, chatSessionId: string): Promise<void> {
  await rm(sessionUploadsDir(dataDir, chatSessionId), { recursive: true, force: true })
}

export function registerChatUploadRoutes (app: FastifyInstance, config: AppConfig): void {
  app.post('/api/chat/sessions/:id/uploads', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const db = openCoreDb(config.dataDir)
    const exists = getSession(db, id) !== undefined
    db.close()
    if (!exists) return await reply.code(404).send({ error: 'session not found' })

    const stored: ChatAttachment[] = []
    const storedDirs: string[] = []
    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') continue
        if (stored.length >= MAX_ATTACHMENTS) throw new AttachmentLimitError(`At most ${MAX_ATTACHMENTS} attachments per message.`)
        const name = safeAttachmentName(part.filename)
        const attachmentId = createAttachmentId()
        const dir = path.join(sessionUploadsDir(config.dataDir, id), attachmentId)
        await mkdir(dir, { recursive: true, mode: 0o700 })
        storedDirs.push(dir)
        const destination = path.join(dir, name)
        await pipeline(part.file, createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
        if (part.file.truncated) throw new FileTooLargeError()
        stored.push({ id: attachmentId, name, bytes: part.file.bytesRead, kind: attachmentKind(name) })
      }
      if (stored.length === 0) return await reply.code(400).send({ error: 'At least one file is required.' })
      return await reply.code(201).send({ attachments: stored })
    } catch (error) {
      await Promise.all(storedDirs.map(async dir => await rm(dir, { recursive: true, force: true })))
      if (error instanceof FileTooLargeError || (isErrorWithCode(error) && error.code === 'FST_REQ_FILE_TOO_LARGE')) {
        return await reply.code(413).send({ error: `Attachment exceeds the ${config.uploadMaxBytes}-byte per-file limit.` })
      }
      if (error instanceof AttachmentLimitError || (isErrorWithCode(error) && error.code === 'FST_FILES_LIMIT')) {
        return await reply.code(400).send({ error: error instanceof AttachmentLimitError ? error.message : 'Too many files.' })
      }
      if (error instanceof UnsafeAttachmentNameError) {
        return await reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  app.delete('/api/chat/sessions/:id/uploads/:attachmentId', async (req, reply) => {
    const { id, attachmentId } = req.params as { id: string, attachmentId: string }
    if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) return await reply.code(400).send({ error: 'Invalid attachment id.' })
    const dir = path.join(sessionUploadsDir(config.dataDir, id), attachmentId)
    try {
      if (!(await stat(dir)).isDirectory()) throw new Error('not a directory')
    } catch {
      return await reply.code(404).send({ error: 'attachment not found' })
    }
    await rm(dir, { recursive: true, force: true })
    return { ok: true }
  })
}

class FileTooLargeError extends Error {}
class AttachmentLimitError extends Error {}

function isErrorWithCode (error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}
