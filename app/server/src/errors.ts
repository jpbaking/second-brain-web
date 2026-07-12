import { extendError } from 'error-extender'
import type { ExtendedError, ExtendedErrorConstructor } from 'error-extender'

/** Allow-listed diagnostic context that is safe to serialize into logs. */
export interface SafeErrorData {
  code: string
  operation?: string
  stage?: string
  requestId?: string
  sessionId?: string
  resourceId?: string
}

/** Root of every application-defined exception hierarchy. */
export const AppError = extendError('AppError', {
  defaultMessage: 'An application error occurred.',
})

/** Convert JavaScript's unknown catch binding into a chainable Error cause. */
export function asError (value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Copy only the approved diagnostic fields. Besides helping TypeScript callers,
 * the runtime allow-list prevents an accidentally wider object (for example a
 * provider snapshot containing an API key) from reaching structured logs.
 */
export function safeErrorData (data: SafeErrorData): SafeErrorData {
  return {
    code: data.code,
    ...(data.operation === undefined ? {} : { operation: data.operation }),
    ...(data.stage === undefined ? {} : { stage: data.stage }),
    ...(data.requestId === undefined ? {} : { requestId: data.requestId }),
    ...(data.sessionId === undefined ? {} : { sessionId: data.sessionId }),
    ...(data.resourceId === undefined ? {} : { resourceId: data.resourceId }),
  }
}

/** Wrap an unknown lower-level failure once, preserving an existing boundary error. */
export function wrapError<TData> (
  ErrorType: ExtendedErrorConstructor<TData>,
  error: unknown,
  options: { message: string, data?: TData }
): ExtendedError<TData> {
  if (error instanceof ErrorType) return error
  return new ErrorType({
    message: options.message,
    cause: asError(error),
    ...(options.data === undefined ? {} : { data: options.data }),
  })
}
