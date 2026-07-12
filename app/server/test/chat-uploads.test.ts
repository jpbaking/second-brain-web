import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { attachmentKind, deleteSessionUploads, imageDataUri, resolveAttachments, safeAttachmentName, sessionUploadsDir, UnsafeAttachmentNameError } from '../src/chat/uploads.js'
import type { AppConfig } from '../src/config.js'
import type { AgentRunner, AgentStartInput, AgentStartResult } from '../src/agent/runner.js'
import type { FastifyInstance } from 'fastify'
import { seedDefaultProvider } from './helpers/seed-provider.js'

const scratch: string[] = []
const apps: FastifyInstance[] = []

class FakeRunner implements AgentRunner {
  starts: AgentStartInput[] = []
  private n = 0
  async start (input: AgentStartInput): Promise<AgentStartResult> {
    this.starts.push(input)
    return { sessionId: `sdk-${++this.n}` }
  }

  async send (): Promise<void> {}
  subscribe (): () => void { return () => {} }
  async readMessages (): Promise<unknown[]> { return [] }
  async stop (): Promise<void> {}
}

function cookieValue (h: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(h) ? h : h === undefined ? [] : [h]
  return list.find(x => x.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string, config: AppConfig, runner: FakeRunner }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-chat-uploads-'))
  scratch.push(root)
  const config = loadConfig({
    SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data'),
    SECOND_BRAIN_WEB_SECRETS_KEY: 'k',
    SECOND_BRAIN_WEB_UPLOAD_MAX_BYTES: '64',
  })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const runner = new FakeRunner()
  const app = buildApp(config, { agentRunner: runner })
  apps.push(app)
  const pw = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(pw.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST',
    url: '/api/auth/totp',
    headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
    payload: { code },
  })
  const cookie = `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}`
  seedDefaultProvider(config.dataDir)
  return { app, cookie, config, runner }
}

async function createSession (app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/chat/sessions', headers: { cookie }, payload: { title: 'Attachments' } })
  expect(res.statusCode).toBe(201)
  return (res.json() as { id: string }).id
}

function multipart (files: Array<{ name: string, content: string, type?: string }>): { payload: Buffer, contentType: string } {
  const boundary = '----second-brain-chat-uploads'
  const parts = files.map(f =>
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\n` +
    `Content-Type: ${f.type ?? 'text/plain'}\r\n\r\n${f.content}\r\n`
  ).join('')
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.from(`${parts}--${boundary}--\r\n`),
  }
}

interface UploadResponse { attachments: Array<{ id: string, name: string, bytes: number, kind: string }> }

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('chat attachment uploads', () => {
  it('stores files under chat-uploads/<sessionId>/<attachmentId>/ and reports kind', async () => {
    const { app, cookie, config } = await authedApp()
    const id = await createSession(app, cookie)
    const body = multipart([
      { name: 'notes.txt', content: 'hello attachments' },
      { name: 'photo.PNG', content: 'not-really-a-png', type: 'image/png' },
    ])
    const res = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/uploads`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    expect(res.statusCode).toBe(201)
    const { attachments } = res.json() as UploadResponse
    expect(attachments).toHaveLength(2)
    expect(attachments[0]).toMatchObject({ name: 'notes.txt', bytes: 17, kind: 'file' })
    expect(attachments[1]).toMatchObject({ name: 'photo.PNG', kind: 'image' })
    for (const attachment of attachments) {
      expect(existsSync(path.join(sessionUploadsDir(config.dataDir, id), attachment.id, attachment.name))).toBe(true)
    }
  })

  it('rejects an upload for an unknown session', async () => {
    const { app, cookie } = await authedApp()
    const body = multipart([{ name: 'notes.txt', content: 'x' }])
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/sessions/nope/uploads',
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    expect(res.statusCode).toBe(404)
  })

  it('rejects an empty upload', async () => {
    const { app, cookie } = await authedApp()
    const id = await createSession(app, cookie)
    const body = multipart([])
    const res = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/uploads`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a file over the per-file limit and stores nothing', async () => {
    const { app, cookie, config } = await authedApp()
    const id = await createSession(app, cookie)
    const body = multipart([{ name: 'big.txt', content: 'x'.repeat(100) }])
    const res = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/uploads`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    expect(res.statusCode).toBe(413)
    expect(readdirSync(sessionUploadsDir(config.dataDir, id), { recursive: false }).length).toBe(0)
  })

  it('requires authentication', async () => {
    const { app } = await authedApp()
    const body = multipart([{ name: 'notes.txt', content: 'x' }])
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/sessions/whatever/uploads',
      headers: { 'content-type': body.contentType },
      payload: body.payload,
    })
    expect(res.statusCode).toBe(401)
  })

  it('deletes a pending attachment', async () => {
    const { app, cookie, config } = await authedApp()
    const id = await createSession(app, cookie)
    const body = multipart([{ name: 'notes.txt', content: 'x' }])
    const upload = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/uploads`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    const attachment = (upload.json() as UploadResponse).attachments[0]!
    const del = await app.inject({ method: 'DELETE', url: `/api/chat/sessions/${id}/uploads/${attachment.id}`, headers: { cookie } })
    expect(del.statusCode).toBe(200)
    expect(existsSync(path.join(sessionUploadsDir(config.dataDir, id), attachment.id))).toBe(false)
    const again = await app.inject({ method: 'DELETE', url: `/api/chat/sessions/${id}/uploads/${attachment.id}`, headers: { cookie } })
    expect(again.statusCode).toBe(404)
  })
})

describe('messages with attachments', () => {
  it('passes images as data URIs and files as paths to the runner, and records names on the user_message event', async () => {
    const { app, cookie, config, runner } = await authedApp()
    const id = await createSession(app, cookie)
    const body = multipart([
      { name: 'notes.txt', content: 'hello' },
      { name: 'pixel.png', content: 'PNGDATA', type: 'image/png' },
    ])
    const upload = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/uploads`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    const { attachments } = upload.json() as UploadResponse

    const send = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/messages`,
      headers: { cookie },
      payload: { text: 'look at these', attachmentIds: attachments.map(a => a.id) },
    })
    expect(send.statusCode).toBe(202)
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(runner.starts).toHaveLength(1)
    const start = runner.starts[0]!
    expect(start.prompt).toBe('look at these')
    expect(start.userImages).toEqual([`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`])
    expect(start.userFiles).toEqual([path.join(sessionUploadsDir(config.dataDir, id), attachments[0]!.id, 'notes.txt')])

    const events = await app.inject({ method: 'GET', url: `/api/chat/sessions/${id}`, headers: { cookie } })
    const userMessage = (events.json() as { events: Array<{ type: string, payload: unknown }> }).events.find(e => e.type === 'user_message')
    expect(userMessage?.payload).toMatchObject({
      text: 'look at these',
      attachments: [{ name: 'notes.txt', kind: 'file' }, { name: 'pixel.png', kind: 'image' }],
    })
  })

  it('rejects a message referencing an unknown attachment', async () => {
    const { app, cookie } = await authedApp()
    const id = await createSession(app, cookie)
    const res = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/messages`,
      headers: { cookie },
      payload: { text: 'hi', attachmentIds: ['0123456789abcdef'] },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('attachment cleanup', () => {
  async function uploadOne (app: FastifyInstance, cookie: string, id: string): Promise<void> {
    const body = multipart([{ name: 'notes.txt', content: 'x' }])
    const res = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/uploads`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    expect(res.statusCode).toBe(201)
  }

  it('removes the session uploads directory when a session is deleted', async () => {
    const { app, cookie, config } = await authedApp()
    const id = await createSession(app, cookie)
    await uploadOne(app, cookie, id)
    expect(existsSync(sessionUploadsDir(config.dataDir, id))).toBe(true)
    const res = await app.inject({ method: 'DELETE', url: `/api/chat/sessions/${id}`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(existsSync(sessionUploadsDir(config.dataDir, id))).toBe(false)
  })

  it('clear-all removes upload directories but preserves pinned sessions', async () => {
    const { app, cookie, config } = await authedApp()
    const keep = await createSession(app, cookie)
    const drop = await createSession(app, cookie)
    await uploadOne(app, cookie, keep)
    await uploadOne(app, cookie, drop)
    const pin = await app.inject({ method: 'PATCH', url: `/api/chat/sessions/${keep}`, headers: { cookie }, payload: { pinned: true } })
    expect(pin.statusCode).toBe(200)
    const res = await app.inject({ method: 'DELETE', url: '/api/chat/sessions?preservePinned=true', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(existsSync(sessionUploadsDir(config.dataDir, drop))).toBe(false)
    expect(existsSync(sessionUploadsDir(config.dataDir, keep))).toBe(true)
  })
})

describe('attachment helpers', () => {
  it('sanitises names and refuses traversal', () => {
    expect(safeAttachmentName('dir/sub/file.txt')).toBe('file.txt')
    expect(safeAttachmentName('withbell.md')).toBe('with_bell.md')
    expect(() => safeAttachmentName('..')).toThrow(UnsafeAttachmentNameError)
    expect(() => safeAttachmentName('')).toThrow(UnsafeAttachmentNameError)
  })

  it('classifies image extensions case-insensitively', () => {
    expect(attachmentKind('a.PNG')).toBe('image')
    expect(attachmentKind('a.webp')).toBe('image')
    expect(attachmentKind('a.pdf')).toBe('file')
  })

  it('resolves stored attachments, builds data URIs, and cleans up per session', async () => {
    const { app, cookie, config } = await authedApp()
    const id = await createSession(app, cookie)
    const body = multipart([
      { name: 'notes.txt', content: 'hello' },
      { name: 'pixel.png', content: 'PNGDATA', type: 'image/png' },
    ])
    const upload = await app.inject({
      method: 'POST',
      url: `/api/chat/sessions/${id}/uploads`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    })
    const { attachments } = upload.json() as UploadResponse
    const resolved = await resolveAttachments(config.dataDir, id, attachments.map(a => a.id))
    expect(resolved.map(r => r.name)).toEqual(['notes.txt', 'pixel.png'])
    expect(resolved[1]!.kind).toBe('image')
    const uri = await imageDataUri(resolved[1]!)
    expect(uri).toBe(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`)
    await expect(resolveAttachments(config.dataDir, id, ['0123456789abcdef'])).rejects.toThrow(/unknown attachment/)
    await expect(resolveAttachments(config.dataDir, id, ['../escape'])).rejects.toThrow(/invalid attachment id/)
    await deleteSessionUploads(config.dataDir, id)
    expect(existsSync(sessionUploadsDir(config.dataDir, id))).toBe(false)
  })
})
