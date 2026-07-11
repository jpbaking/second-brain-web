import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { prepareDatabases } from '../src/migrations.js'
import { generateOwnerAuth, writeOwnerAuth } from '../src/auth/bootstrap.js'
import { totpCode } from '../src/auth/totp.js'
import { CHALLENGE_COOKIE, SESSION_COOKIE } from '../src/auth/cookies.js'
import { vaultWorkspacePath } from '../src/vault/config.js'
import type { AppConfig } from '../src/config.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  const cookie = values.find(value => value.startsWith(`${name}=`))
  return cookie?.slice(name.length + 1).split(';')[0]
}

async function authedApp (uploadMaxBytes?: number): Promise<{ app: FastifyInstance, cookie: string, config: AppConfig }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-upload-'))
  scratch.push(root)
  const env: NodeJS.ProcessEnv = { SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') }
  if (uploadMaxBytes !== undefined) env.SECOND_BRAIN_WEB_UPLOAD_MAX_BYTES = String(uploadMaxBytes)
  const config = loadConfig(env)
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state, { SECOND_BRAIN_WEB_SECRETS_KEY: config.secretsKey })
  const app = buildApp(config)
  apps.push(app)

  const passwordResponse = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(passwordResponse.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST',
    url: '/api/auth/totp',
    headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` },
    payload: { code },
  })
  return { app, config, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}` }
}

function multipart (files: Array<{ name: string, content: Buffer }>): { payload: Buffer, contentType: string } {
  const boundary = '----second-brain-upload-test'
  const chunks: Buffer[] = []
  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${file.name}"\r\n` +
      'Content-Type: application/octet-stream\r\n\r\n'
    ))
    chunks.push(file.content, Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('file upload', () => {
  it('requires authentication', async () => {
    const { app } = await authedApp()
    const body = multipart([{ name: 'note.txt', content: Buffer.from('private') }])
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { 'content-type': body.contentType }, payload: body.payload,
    })
    expect(response.statusCode).toBe(401)
  })

  it('preserves file bytes and safe folder structure under inbox/uploads', async () => {
    const { app, cookie, config } = await authedApp()
    const binary = Buffer.from([0, 1, 2, 253, 254, 255])
    const body = multipart([
      { name: 'notes/readme.txt', content: Buffer.from('hello') },
      { name: 'images/raw.bin', content: binary },
    ])
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })

    expect(response.statusCode).toBe(201)
    const result = response.json()
    expect(result.path).toMatch(/^inbox\/uploads\/\d{4}-\d{2}-\d{2}_\d{6}_[a-f0-9]{6}$/)
    expect(result.files.map((file: { path: string }) => file.path)).toEqual([
      `${result.path}/notes/readme.txt`, `${result.path}/images/raw.bin`,
    ])
    const root = vaultWorkspacePath(config.dataDir)
    expect(readFileSync(path.join(root, result.path, 'notes/readme.txt'), 'utf8')).toBe('hello')
    expect(readFileSync(path.join(root, result.path, 'images/raw.bin'))).toEqual(binary)
  })

  it('rejects traversal and cleans the partial upload directory', async () => {
    const { app, cookie, config } = await authedApp()
    const body = multipart([{ name: '../escape.txt', content: Buffer.from('no') }])
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })
    expect(response.statusCode).toBe(400)
    expect(existsSync(path.join(vaultWorkspacePath(config.dataDir), 'escape.txt'))).toBe(false)
  })

  it('rejects duplicate relative paths instead of overwriting an earlier file', async () => {
    const { app, cookie, config } = await authedApp()
    const body = multipart([
      { name: 'same.txt', content: Buffer.from('first') },
      { name: 'same.txt', content: Buffer.from('second') },
    ])
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })
    expect(response.statusCode).toBe(400)
    expect(readdirSync(path.join(vaultWorkspacePath(config.dataDir), 'inbox', 'uploads'))).toEqual([])
  })

  it('enforces the configured per-file size limit and leaves no file behind', async () => {
    const { app, cookie, config } = await authedApp(4)
    const body = multipart([{ name: 'large.txt', content: Buffer.from('12345') }])
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })
    expect(response.statusCode).toBe(413)
    expect(existsSync(path.join(vaultWorkspacePath(config.dataDir), 'inbox', 'uploads'))).toBe(true)
    expect(readdirSync(path.join(vaultWorkspacePath(config.dataDir), 'inbox', 'uploads'))).toEqual([])
  })
})
