import { listModels } from '../providers/models.js'

/**
 * List a provider's model ids, one per line, on stdout. Used by the `configure`
 * helper. The provider id and optional base URL come from the environment
 * (SBW_LIST_PROVIDER, SBW_LIST_BASE_URL); the API key is read from stdin so it
 * never appears in the process arguments. Exits non-zero with a message on
 * stderr when the listing fails.
 */

async function readStdin (): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function main (): Promise<void> {
  const providerId = process.env.SBW_LIST_PROVIDER
  if (providerId === undefined || providerId === '') {
    throw new Error('SBW_LIST_PROVIDER is required')
  }
  const baseUrlEnv = process.env.SBW_LIST_BASE_URL
  const baseUrl = baseUrlEnv !== undefined && baseUrlEnv !== '' ? baseUrlEnv : null
  const apiKey = (await readStdin()).trim()

  const result = await listModels({
    providerId,
    baseUrl,
    ...(apiKey === '' ? {} : { apiKey }),
  })
  if (!result.ok) throw new Error(result.message)
  process.stdout.write(`${result.models.join('\n')}\n`)
}

main().catch((err: unknown) => {
  process.stderr.write(`list-models: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
