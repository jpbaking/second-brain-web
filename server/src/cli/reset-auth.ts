import { statSync } from 'node:fs'
import path from 'node:path'
import { generateOwnerAuth, writeOwnerAuth } from '../auth/bootstrap.js'

/**
 * CLI entry invoked by `scripts/reset-auth.sh` after it has validated and
 * prepared the data root. Generates fresh owner auth material and prints the
 * one-time password and TOTP setup URI. Takes the absolute data-root path as
 * its single argument (never relies on the process working directory).
 */
async function main (): Promise<void> {
  const arg = process.argv[2]
  if (arg === undefined || arg.trim() === '') {
    throw new Error(
      'usage: reset-auth <data-dir>  (absolute path to SECOND_BRAIN_WEB_DATA_DIR)'
    )
  }
  const dataDir = path.resolve(arg)
  if (!statSync(dataDir).isDirectory()) {
    throw new Error(`data root is not a directory: ${dataDir}`)
  }

  const { password, otpauthUri, state } = await generateOwnerAuth()
  const file = writeOwnerAuth(dataDir, state)

  process.stdout.write(
    'reset-auth: owner authentication has been reset.\n\n' +
    `  One-time password:  ${password}\n\n` +
    '  TOTP setup — add this otpauth URI to your authenticator app:\n' +
    `    ${otpauthUri}\n\n` +
    'The password is shown once — record it now. Any previous password and ' +
    'TOTP secret are now invalid.\n' +
    `Auth state written to ${file} (mode 600).\n`
  )
}

main().catch((err: unknown) => {
  process.stderr.write(`reset-auth: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
