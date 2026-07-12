import { getValidOpenAICodexCredentials } from '@cline/core'
import { extendError } from 'error-extender'
import { AppError, asError, safeErrorData } from '../errors.js'
import { decryptSecret, encryptSecret } from '../secrets/crypto.js'
import { parseChatGptCredentials, type ChatGptCredentials } from '../agent/runner.js'
import { getProfileSecret, rotateProfileSecret } from './store.js'
import type { DatabaseSync } from 'node:sqlite'

/**
 * ChatGPT (openai-codex) OAuth token refresh (milestone 73). The profile
 * secret holds the encrypted OAuth blob; access tokens expire, so a session
 * start must first run the blob through the SDK's refresh helper and persist
 * any rotated tokens back to the profile. Tokens stay in memory and in
 * ciphertext — never logged, never returned to the browser.
 */

export const ChatGptAuthError = extendError('ChatGptAuthError', {
  parent: AppError,
  defaultData: safeErrorData({ code: 'CHATGPT_AUTH_ERROR' }),
})

/** SDK-shaped credentials; `getValidOpenAICodexCredentials` is injectable for tests. */
export type ChatGptCredentialRefresher = (
  current: ChatGptCredentials & { accountId?: string }
) => Promise<(ChatGptCredentials & { accountId?: string }) | null>

const sdkRefresher: ChatGptCredentialRefresher = async current =>
  await getValidOpenAICodexCredentials(current)

/** Serialise credentials into the stored blob shape (stable field order). */
export function chatGptCredentialsBlob (credentials: ChatGptCredentials): string {
  return JSON.stringify({
    access: credentials.access,
    refresh: credentials.refresh,
    expires: credentials.expires,
    ...(credentials.accountId !== undefined ? { accountId: credentials.accountId } : {}),
  })
}

/**
 * Refresh a chatgpt profile's OAuth credentials if stale, persisting rotated
 * tokens. Throws a typed error when the profile has no secret, the blob is
 * malformed, or the refresh token itself has expired (re-login required).
 */
export async function freshenChatGptProfileSecret (
  db: DatabaseSync,
  profileId: string,
  env: NodeJS.ProcessEnv = process.env,
  refresh: ChatGptCredentialRefresher = sdkRefresher
): Promise<void> {
  const secret = getProfileSecret(db, profileId)
  if (secret === undefined) {
    throw new ChatGptAuthError({
      message: 'chatgpt profile has no stored credentials; run ./configure to log in.',
      data: safeErrorData({ code: 'CHATGPT_AUTH_ERROR', operation: 'freshen', resourceId: profileId }),
    })
  }
  const current = parseChatGptCredentials(decryptSecret(secret.ciphertext, env))

  let fresh: (ChatGptCredentials & { accountId?: string }) | null
  try {
    fresh = await refresh(current)
  } catch (err) {
    throw new ChatGptAuthError({
      message: 'could not refresh the ChatGPT access token.',
      data: safeErrorData({ code: 'CHATGPT_AUTH_ERROR', operation: 'freshen', resourceId: profileId }),
      cause: asError(err),
    })
  }
  if (fresh === null) {
    throw new ChatGptAuthError({
      message: 'the ChatGPT login has expired; run ./configure to log in again.',
      data: safeErrorData({ code: 'CHATGPT_AUTH_ERROR', operation: 'freshen', resourceId: profileId }),
    })
  }
  if (fresh.access !== current.access || fresh.refresh !== current.refresh) {
    rotateProfileSecret(db, profileId, encryptSecret(chatGptCredentialsBlob(fresh), env))
  }
}
