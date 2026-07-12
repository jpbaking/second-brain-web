import { randomBytes, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import fastifyMultipart from '@fastify/multipart'
import { openCoreDb } from '../db.js'
import { vaultWorkspacePath } from './config.js'
import { acquireLock, releaseLock } from './lock.js'
import { WorkflowNotFoundError, expandWorkflow } from '../agent/workflows.js'
import type { AgentSessionService } from '../agent/session.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

const MAX_FILES = 100

export interface StoredUpload {
  originalName: string
  path: string
  bytes: number
}

export interface IntakeMetadata {
  description?: string
  date?: string
  people?: string
  projects?: string
  urgency?: 'low' | 'normal' | 'high' | 'urgent'
  workflow?: 'process-inbox' | 'create-report' | 'prep-meeting' | 'file-later'
  notes?: string
}

export function registerUploadRoutes (app: FastifyInstance, config: AppConfig, service: AgentSessionService): void {
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
    const metadata: Record<string, string> = {}

    try {
      await mkdir(path.dirname(destinationRoot), { recursive: true })
      await mkdir(destinationRoot, { recursive: false })

      for await (const part of req.parts()) {
        if (part.type === 'field') {
          if (typeof part.value !== 'string') throw new IntakeValidationError(`Invalid intake field: ${part.fieldname}`)
          metadata[part.fieldname] = part.value
          continue
        }
        const relativeName = safeUploadPath(part.filename)
        if (relativeName.toLowerCase() === '_intake.md') {
          throw new UnsafeUploadPathError('The filename _intake.md is reserved for intake metadata.')
        }
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

      const intake = parseIntakeMetadata(metadata)
      const intakePath = path.posix.join(relativeRoot, '_intake.md')
      await writeFile(
        path.join(destinationRoot, '_intake.md'),
        buildIntakeMarkdown(intake, stored, new Date()),
        { encoding: 'utf8', flag: 'wx', mode: 0o600 }
      )

      return await reply.code(201).send({ uploadId, path: relativeRoot, intakePath, files: stored })
    } catch (error) {
      await rm(destinationRoot, { recursive: true, force: true })
      if (isUploadLimitError(error)) {
        return await reply.code(413).send({ error: `Upload exceeds the ${config.uploadMaxBytes}-byte per-file limit.` })
      }
      if (error instanceof UnsafeUploadPathError || error instanceof IntakeValidationError) {
        return await reply.code(400).send({ error: error.message })
      }
      throw error
    } finally {
      releaseLock(db, lock.lock.lockId)
      db.close()
    }
  })

  app.post('/api/uploads/:uploadId/process', async (req, reply) => {
    const uploadId = (req.params as { uploadId: string }).uploadId
    if (!/^\d{4}-\d{2}-\d{2}_\d{6}_[a-f0-9]{6}$/.test(uploadId)) {
      return await reply.code(400).send({ error: 'Invalid upload identifier.' })
    }

    const relativeRoot = path.posix.join('inbox', 'uploads', uploadId)
    const destinationRoot = path.join(vaultWorkspacePath(config.dataDir), ...relativeRoot.split('/'))
    try {
      if (!(await stat(destinationRoot)).isDirectory()) throw new Error('not a directory')
    } catch {
      return await reply.code(404).send({ error: 'Upload not found.' })
    }

    let prompt: string
    try {
      prompt = expandWorkflow(vaultWorkspacePath(config.dataDir), 'inbox')
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return await reply.code(409).send({ error: 'The vault inbox workflow is unavailable.' })
      }
      throw error
    }
    prompt += `\n\nProcess the newly uploaded intake at \`${relativeRoot}\`. Read its \`_intake.md\` companion for context and keep every original unchanged except for moves and renames allowed by the vault rules.`

    let session
    try {
      session = service.create({ title: `Inbox: ${uploadId}`, approvalPreset: 'auto' })
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not start inbox processing.' })
    }

    try {
      await service.sendMessage(session.id, prompt)
      return await reply.code(202).send({ ok: true, sessionId: session.id })
    } catch (error) {
      return await reply.code(502).send({
        error: error instanceof Error ? error.message : 'Agent dispatch failed.',
        sessionId: session.id,
      })
    }
  })
}

export class UnsafeUploadPathError extends Error {}
export class IntakeValidationError extends Error {}
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

export function parseIntakeMetadata (fields: Record<string, string>): IntakeMetadata {
  const allowed = new Set(['description', 'date', 'people', 'projects', 'urgency', 'workflow', 'notes'])
  const unknown = Object.keys(fields).find(field => !allowed.has(field))
  if (unknown !== undefined) throw new IntakeValidationError(`Unknown intake field: ${unknown}`)

  const value = (name: string, max: number): string | undefined => {
    const trimmed = fields[name]?.trim()
    if (trimmed === undefined || trimmed === '') return undefined
    if (trimmed.length > max) throw new IntakeValidationError(`Intake field is too long: ${name}`)
    return trimmed
  }

  const date = value('date', 10)
  if (date !== undefined) {
    const parsed = new Date(`${date}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new IntakeValidationError('Invalid intake date.')
    }
  }
  const urgency = value('urgency', 10)
  if (urgency !== undefined && !['low', 'normal', 'high', 'urgent'].includes(urgency)) {
    throw new IntakeValidationError('Invalid intake urgency.')
  }
  const workflow = value('workflow', 30)
  if (workflow !== undefined && !['process-inbox', 'create-report', 'prep-meeting', 'file-later'].includes(workflow)) {
    throw new IntakeValidationError('Invalid desired handling.')
  }

  const result: IntakeMetadata = {}
  const description = value('description', 1000)
  const people = value('people', 1000)
  const projects = value('projects', 1000)
  const notes = value('notes', 4000)
  if (description !== undefined) result.description = description
  if (date !== undefined) result.date = date
  if (people !== undefined) result.people = people
  if (projects !== undefined) result.projects = projects
  if (urgency !== undefined) result.urgency = urgency as NonNullable<IntakeMetadata['urgency']>
  if (workflow !== undefined) result.workflow = workflow as NonNullable<IntakeMetadata['workflow']>
  if (notes !== undefined) result.notes = notes
  return result
}

export function buildIntakeMarkdown (metadata: IntakeMetadata, files: StoredUpload[], createdAt: Date): string {
  const lines = [
    '# Inbox intake',
    '',
    `- Uploaded: ${createdAt.toISOString()}`,
    `- Files: ${files.length}`,
  ]
  appendListValue(lines, 'Date received or created', metadata.date)
  appendListValue(lines, 'Urgency', metadata.urgency)
  appendListValue(lines, 'Related people', metadata.people)
  appendListValue(lines, 'Related projects', metadata.projects)
  appendListValue(lines, 'Desired handling', metadata.workflow)
  lines.push('', '## Uploaded files', '', ...files.map(file => `- \`${inlineCode(file.path.split('/').slice(3).join('/'))}\``))
  appendSection(lines, 'Description', metadata.description)
  appendSection(lines, 'Notes for the secretary', metadata.notes)
  return `${lines.join('\n')}\n`
}

function inlineCode (value: string): string {
  return value.replaceAll('`', "'").replaceAll('\n', ' ')
}

function appendListValue (lines: string[], label: string, value: string | undefined): void {
  if (value !== undefined) lines.push(`- ${label}: ${value.replaceAll('\n', ' ')}`)
}

function appendSection (lines: string[], heading: string, value: string | undefined): void {
  if (value !== undefined) lines.push('', `## ${heading}`, '', value)
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
