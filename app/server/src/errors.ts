import { extendError } from 'error-extender'

/** Root of every application-defined exception hierarchy. */
export const AppError = extendError('AppError', {
  defaultMessage: 'An application error occurred.',
})

/** Convert JavaScript's unknown catch binding into a chainable Error cause. */
export function asError (value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
