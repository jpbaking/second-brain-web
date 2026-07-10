import { randomBytes, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import fastifyMultipart from '@fastify/multipart'
import { openCoreDb } from '../db.js'
import { vaultWorkspacePath } from './config.js'
import { acquireLock, releaseLock } from './lock.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

const MAX_FILES = 100

export interface StoredUpload {
  originalName: string
  path: string
  bytes: number
}

export function registerUploadRoutes (app: FastifyInstance, config: AppConfig): void {
  app.register(fastifyMultipart, {
    limits: { fileSize: config.uploadMaxBytes, files: MAX_FILES },
    preservePath: true,
  })

  app.post('/api/uploads', async (req, reply) => {
    const db = openCoreDb(config.dataDir)
    const lock = acquireLock(db, {
      sessionId: req.sessionId,
      operation: 'upload',
    })
    if (!lock.acquired || lock.lock === null) {
      db.close()
      return await reply.code(409).send({ error: 'Another session holds the vault write lock; try again shortly.' })
    }

    const workspace = vaultWorkspacePath(config.dataDir)
    const uploadId = createUploadId()
    const relativeRoot = path.posix.join('inbox', 'uploads', uploadId)
    const destinationRoot = path.join(workspace, ...relativeRoot.split('/'))
    const stored: StoredUpload[] = []

    try {
      await mkdir(path.dirname(destinationRoot), { recursive: true })
      await mkdir(destinationRoot, { recursive: false })

      for await (const part of req.parts()) {
        if (part.type !== 'file') continue
        const relativeName = safeUploadPath(part.filename)
        if (stored.some(file => file.path === path.posix.join(relativeRoot, relativeName))) {
          throw new UnsafeUploadPathError(`Duplicate upload path: ${relativeName}`)
        }
        const destination = path.join(destinationRoot, ...relativeName.split('/'))
        await mkdir(path.dirname(destination), { recursive: true })
        const temporary = `${destination}.uploading-${randomUUID()}`

        try {
          await pipeline(part.file, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
          if (part.file.truncated) throw new UploadLimitError()
          await rename(temporary, destination)
        } catch (error) {
          await rm(temporary, { force: true })
          throw error
        }

        stored.push({
          originalName: part.filename,
          path: path.posix.join(relativeRoot, relativeName),
          bytes: part.file.bytesRead,
        })
      }

      if (stored.length === 0) {
        await rm(destinationRoot, { recursive: true, force: true })
        return await reply.code(400).send({ error: 'At least one file is required.' })
      }

      return await reply.code(201).send({ uploadId, path: relativeRoot, files: stored })
    } catch (error) {
      await rm(destinationRoot, { recursive: true, force: true })
      if (isUploadLimitError(error)) {
        return await reply.code(413).send({ error: `Upload exceeds the ${config.uploadMaxBytes}-byte per-file limit.` })
      }
      if (error instanceof UnsafeUploadPathError) {
        return await reply.code(400).send({ error: error.message })
      }
      throw error
    } finally {
      releaseLock(db, lock.lock.lockId)
      db.close()
    }
  })
}

export class UnsafeUploadPathError extends Error {}
class UploadLimitError extends Error {}

export function safeUploadPath (filename: string): string {
  if (filename === '' || filename.includes('\0') || path.posix.isAbsolute(filename) || path.win32.isAbsolute(filename)) {
    throw new UnsafeUploadPathError('Unsafe upload path.')
  }

  const segments = filename.replaceAll('\\', '/').split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new UnsafeUploadPathError('Unsafe upload path.')
  }

  const safe = segments.map(sanitiseSegment)
  if (safe.some(segment => segment === '')) throw new UnsafeUploadPathError('Unsafe upload path.')
  return safe.join('/')
}

function sanitiseSegment (segment: string): string {
  return Array.from(segment, character => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127 ? '_' : character
  }).join('').slice(0, 180)
}

function createUploadId (now: Date = new Date()): string {
  const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '')
  return `${timestamp}_${randomBytes(3).toString('hex')}`
}

function isUploadLimitError (error: unknown): boolean {
  if (error instanceof UploadLimitError) return true
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  return error.code === 'FST_REQ_FILE_TOO_LARGE' || error.code === 'FST_FILES_LIMIT'
}
