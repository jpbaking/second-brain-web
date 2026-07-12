import log4js, { type Logger, type LoggingEvent } from 'log4js'
import { extendError } from 'error-extender'

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'off'] as const
export type LogLevel = typeof LOG_LEVELS[number]

export const LoggingConfigError = extendError('LoggingConfigError')

export interface LogStream {
  write: (line: string) => void
}

export type LogFields = Record<string, unknown>

const JSON_LAYOUT = 'second-brain-json'
let layoutRegistered = false

export function isLogLevel (value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value)
}

export function resolveLogLevel (env: NodeJS.ProcessEnv = process.env): LogLevel {
  const value = (env.SECOND_BRAIN_WEB_LOG_LEVEL ?? 'info').trim().toLowerCase()
  if (!isLogLevel(value)) {
    throw new LoggingConfigError({
      message: `SECOND_BRAIN_WEB_LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}; got "${value}".`,
    })
  }
  return value
}

/** Configure the root/default log4js category as newline-delimited JSON. */
export function configureLogging (env: NodeJS.ProcessEnv = process.env): LogLevel {
  const level = resolveLogLevel(env)
  if (!layoutRegistered) {
    log4js.addLayout(JSON_LAYOUT, () => (event: LoggingEvent): string => {
      const record = event.data[0]
      if (record !== null && typeof record === 'object') return JSON.stringify(record)
      return JSON.stringify({
        time: event.startTime.getTime(),
        level: event.level.levelStr.toLowerCase(),
        category: event.categoryName,
        msg: String(record),
      })
    })
    layoutRegistered = true
  }
  log4js.configure({
    appenders: {
      stdout: { type: 'stdout', layout: { type: JSON_LAYOUT } },
    },
    categories: {
      default: { appenders: ['stdout'], level },
    },
  })
  return level
}

/** Small typed facade so every runtime category emits the same JSON schema. */
export class AppLogger {
  constructor (
    readonly category: string,
    private readonly backend: Logger = log4js.getLogger(category),
    private readonly stream?: LogStream
  ) {}

  trace (message: string, fields: LogFields = {}): void { this.write('trace', message, fields) }
  debug (message: string, fields: LogFields = {}): void { this.write('debug', message, fields) }
  info (message: string, fields: LogFields = {}): void { this.write('info', message, fields) }
  warn (message: string, fields: LogFields = {}): void { this.write('warn', message, fields) }
  error (message: string, error?: unknown, fields: LogFields = {}): void {
    this.write('error', message, { ...fields, ...(error === undefined ? {} : { error }) })
  }

  fatal (message: string, error?: unknown, fields: LogFields = {}): void {
    this.write('fatal', message, { ...fields, ...(error === undefined ? {} : { error }) })
  }

  private write (level: Exclude<LogLevel, 'off'>, message: string, fields: LogFields): void {
    const record = serialiseRecord({
      time: Date.now(),
      level,
      category: this.category,
      msg: message,
      ...fields,
    })
    if (this.stream !== undefined) {
      this.stream.write(`${JSON.stringify(record)}\n`)
      return
    }
    this.backend[level](record)
  }
}

export function getAppLogger (category: string, stream?: LogStream): AppLogger {
  return new AppLogger(category, log4js.getLogger(category), stream)
}

function serialiseRecord (record: LogFields): LogFields {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, serialiseValue(value)]))
}

function serialiseValue (value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (Array.isArray(value)) return value.map(serialiseValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialiseValue(child)]))
  }
  return value
}
