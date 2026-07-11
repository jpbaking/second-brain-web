import { encryptSecret } from '../secrets/crypto.js'

async function readStdin (): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function main (): Promise<void> {
  const plaintext = await readStdin()
  process.stdout.write(`${encryptSecret(plaintext, process.env)}\n`)
}

main().catch((err: unknown) => {
  process.stderr.write(`encrypt-secret: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
