import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extendError } from 'error-extender'
import { AppError, safeErrorData, wrapError } from '../src/errors.js'
import { ConfigError } from '../src/config.js'
import { getAppLogger } from '../src/logging.js'
import { ProviderProvisioningError, provisionProviderProfiles } from '../src/providers/provisioning.js'

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('application exceptions', () => {
  it('shares one error-extender hierarchy with Java-style cause stacks', () => {
    const root = new Error('socket refused')
    const error = new ProviderProvisioningError({ message: 'provider setup failed', cause: root })

    expect(error).toBeInstanceOf(ProviderProvisioningError)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(Error)
    expect(error.stack).toContain('ProviderProvisioningError: provider setup failed')
    expect(error.stack).toContain('Caused by: Error: socket refused')
    expect(new ConfigError({ message: 'bad config' })).toBeInstanceOf(AppError)
  })

  it('retains the YAML parser failure as the provisioning cause', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sbw-errors-'))
    scratch.push(root)
    const file = path.join(root, 'providers.yaml')
    writeFileSync(file, 'providers: [')

    let thrown: unknown
    try {
      provisionProviderProfiles('/unused', { SECOND_BRAIN_WEB_PROVIDERS_FILE: file }, () => {})
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(ProviderProvisioningError)
    expect((thrown as Error).stack).toContain('Caused by: YAMLParseError:')
  })

  it('writes the complete cause stack through the structured logger', () => {
    const lines: string[] = []
    const logger = getAppLogger('test.errors', { write: line => lines.push(line) })
    const error = new ProviderProvisioningError({
      message: 'outer failure',
      cause: new Error('root failure'),
    })

    logger.error('operation failed', error, { operation: 'test' })

    const record = JSON.parse(lines[0] ?? '{}') as { error?: { stack?: string }, operation?: string }
    expect(record.operation).toBe('test')
    expect(record.error?.stack).toContain('Caused by: Error: root failure')
  })

  it('allow-lists structured context and drops accidental secret fields', () => {
    const wider = {
      code: 'TEST_FAILURE',
      operation: 'connect',
      resourceId: 'provider-one',
      apiKey: 'must-not-survive',
      prompt: 'must-not-survive',
    }

    expect(safeErrorData(wider)).toEqual({
      code: 'TEST_FAILURE',
      operation: 'connect',
      resourceId: 'provider-one',
    })
  })

  it('wraps lower-level failures once and retains their cause stacks', () => {
    const BoundaryError = extendError('BoundaryError', { parent: AppError })
    const wrapped = wrapError(BoundaryError, new Error('low-level failure'), {
      message: 'boundary operation failed',
    })

    expect(wrapped).toBeInstanceOf(BoundaryError)
    expect(wrapped.stack).toContain('Caused by: Error: low-level failure')
    expect(wrapError(BoundaryError, wrapped, { message: 'duplicate wrapper' })).toBe(wrapped)
  })
})
