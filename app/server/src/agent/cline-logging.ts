import { getAppLogger, type AppLogger, type LogFields } from '../logging.js'
import type { BasicLogger, BasicLogMetadata } from '@cline/shared'

const SDK_METADATA_FIELDS = [
  'sessionId', 'runId', 'providerId', 'modelId', 'toolName', 'durationMs',
  'severity', 'stage', 'status', 'operation', 'requestId',
] as const

/** Runtime allow-list for SDK metadata, whose upstream type permits any key. */
export function sanitiseClineMetadata (metadata?: BasicLogMetadata): LogFields {
  if (metadata === undefined) return {}
  const safe: LogFields = {}
  for (const field of SDK_METADATA_FIELDS) {
    const value = metadata[field]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') safe[field] = value
  }
  const error = metadata.error
  if (error instanceof Error) safe.errorName = error.name
  return safe
}

export function createClineSdkLogger (logger: AppLogger = getAppLogger('cline.sdk')): BasicLogger {
  return {
    debug: (message: string, metadata?: BasicLogMetadata) => logger.debug(message, sanitiseClineMetadata(metadata)),
    log: (message: string, metadata?: BasicLogMetadata) => {
      const fields = sanitiseClineMetadata(metadata)
      if (metadata?.severity === 'warn') logger.warn(message, fields)
      else if (metadata?.severity === 'error') logger.error(message, undefined, fields)
      else logger.info(message, fields)
    },
    error: (message: string, metadata?: BasicLogMetadata & { error?: unknown }) => logger.error(message, undefined, sanitiseClineMetadata(metadata)),
  }
}

interface SafeProviderRequest {
  method: string
  host?: string
  path?: string
}

function safeProviderRequest (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): SafeProviderRequest {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const raw = input instanceof Request ? input.url : input instanceof URL ? input.toString() : input
  try {
    const url = new URL(raw)
    return { method, host: url.host, path: url.pathname }
  } catch {
    return { method }
  }
}

function providerRequestId (response: Response): string | undefined {
  for (const header of ['x-request-id', 'request-id', 'x-goog-request-id', 'cf-ray']) {
    const value = response.headers.get(header)
    if (value !== null && value !== '') return value
  }
  return undefined
}

/** Trace provider HTTP timing/status without logging query strings, headers, or bodies. */
export function createTracedProviderFetch (
  baseFetch: typeof fetch = fetch,
  logger: AppLogger = getAppLogger('cline.provider')
): typeof fetch {
  return async (input, init) => {
    const request = safeProviderRequest(input, init)
    const started = performance.now()
    logger.trace('provider request started', { ...request })
    try {
      const response = await baseFetch(input, init)
      const requestId = providerRequestId(response)
      logger.trace('provider response received', {
        ...request,
        status: response.status,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        ...(requestId === undefined ? {} : { requestId }),
      })
      return response
    } catch (error) {
      logger.trace('provider request failed', {
        ...request,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      throw error
    }
  }
}
