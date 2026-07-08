/**
 * Auth cookie names and options (phase-002 Cookie requirements). HttpOnly and
 * SameSite=Lax always; Secure only in production so local HTTP dev still works.
 */

export const SESSION_COOKIE = 'sbw_session'
export const CHALLENGE_COOKIE = 'sbw_challenge'

function secureInProduction (): boolean {
  return process.env.NODE_ENV === 'production'
}

export function sessionCookieOptions (maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureInProduction(),
    path: '/',
    maxAge: maxAgeSeconds,
  } as const
}

export function challengeCookieOptions (maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureInProduction(),
    path: '/',
    maxAge: maxAgeSeconds,
  } as const
}

/** Options for clearing an auth cookie — must match path/flags to take effect. */
export function clearCookieOptions () {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureInProduction(),
    path: '/',
  } as const
}
