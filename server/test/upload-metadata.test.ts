import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
import { parseIntakeMetadata } from '../src/vault/upload.js'
import type { FastifyInstance } from 'fastify'

const scratch: string[] = []
const apps: FastifyInstance[] = []

function cookieValue (header: string | string[] | undefined, name: string): string | undefined {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header]
  return values.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0]
}

async function authedApp (): Promise<{ app: FastifyInstance, cookie: string, dataDir: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'sbw-intake-'))
  scratch.push(root)
  const config = loadConfig({ SECOND_BRAIN_WEB_DATA_DIR: path.join(root, 'data') })
  prepareDatabases(config.dataDir)
  const { password, state } = await generateOwnerAuth()
  writeOwnerAuth(config.dataDir, state)
  const app = buildApp(config)
  apps.push(app)
  const passwordResponse = await app.inject({ method: 'POST', url: '/api/auth/password', payload: { password } })
  const challenge = cookieValue(passwordResponse.headers['set-cookie'], CHALLENGE_COOKIE)
  const code = totpCode(state.totp.secretBase32, { digits: state.totp.digits, period: state.totp.period })
  const totp = await app.inject({
    method: 'POST', url: '/api/auth/totp', headers: { cookie: `${CHALLENGE_COOKIE}=${challenge}` }, payload: { code },
  })
  return { app, dataDir: config.dataDir, cookie: `${SESSION_COOKIE}=${cookieValue(totp.headers['set-cookie'], SESSION_COOKIE)}` }
}

function multipart (fields: Record<string, string>, filename = 'source.txt'): { payload: Buffer, contentType: string } {
  const boundary = '----second-brain-intake-test'
  const chunks: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ))
  }
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    'Content-Type: text/plain\r\n\r\noriginal bytes\r\n' +
    `--${boundary}--\r\n`
  ))
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('upload intake metadata', () => {
  it('writes validated context to a companion markdown file', async () => {
    const { app, cookie, dataDir } = await authedApp()
    const body = multipart({
      description: 'Architecture notes from the planning workshop.',
      date: '2026-07-09',
      people: 'Maya Chen, Alex Smith',
      projects: 'Atlas',
      urgency: 'high',
      workflow: 'create-report',
      notes: 'Compare this with the June proposal.\nKeep the diagrams.',
    })
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })

    expect(response.statusCode).toBe(201)
    const result = response.json()
    expect(result.intakePath).toBe(`${result.path}/_intake.md`)
    const intake = readFileSync(path.join(vaultWorkspacePath(dataDir), result.intakePath), 'utf8')
    expect(intake).toContain('# Inbox intake')
    expect(intake).toContain('- Date received or created: 2026-07-09')
    expect(intake).toContain('- Urgency: high')
    expect(intake).toContain('- Related people: Maya Chen, Alex Smith')
    expect(intake).toContain('- Related projects: Atlas')
    expect(intake).toContain('- Desired handling: create-report')
    expect(intake).toContain('## Description\n\nArchitecture notes')
    expect(intake).toContain('## Notes for the secretary\n\nCompare this with the June proposal.\nKeep the diagrams.')
    expect(readFileSync(path.join(vaultWorkspacePath(dataDir), result.path, 'source.txt'), 'utf8')).toBe('original bytes')
  })

  it('creates a minimal companion when all optional fields are omitted', async () => {
    const { app, cookie, dataDir } = await authedApp()
    const body = multipart({})
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })
    expect(response.statusCode).toBe(201)
    const result = response.json()
    const intake = readFileSync(path.join(vaultWorkspacePath(dataDir), result.intakePath), 'utf8')
    expect(intake).toContain('- Files: 1')
    expect(intake).toContain('- `source.txt`')
  })

  it('rejects invalid dates, enums, unknown fields, and overlong text', () => {
    expect(() => parseIntakeMetadata({ date: '2026-02-30' })).toThrow(/date/i)
    expect(() => parseIntakeMetadata({ urgency: 'whenever' })).toThrow(/urgency/i)
    expect(() => parseIntakeMetadata({ workflow: 'delete-everything' })).toThrow(/handling/i)
    expect(() => parseIntakeMetadata({ surprise: 'value' })).toThrow(/unknown/i)
    expect(() => parseIntakeMetadata({ notes: 'x'.repeat(4001) })).toThrow(/too long/i)
  })

  it('reserves the companion filename for app-authored metadata', async () => {
    const { app, cookie } = await authedApp()
    const body = multipart({}, '_intake.md')
    const response = await app.inject({
      method: 'POST', url: '/api/uploads', headers: { cookie, 'content-type': body.contentType }, payload: body.payload,
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toMatch(/reserved/i)
  })
})
