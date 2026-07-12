import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import * as readline from 'node:readline'
import { Writable } from 'node:stream'
import { loginOpenAICodex } from '@cline/core'
import { filterOpenAICodexModels, getModelsForProvider } from '@cline/llms'
import { encryptSecret } from '../secrets/crypto.js'
import { listModels } from '../providers/models.js'
import { LOG_LEVELS } from '../logging.js'
import {
  DEFAULT_BIND, DEFAULT_PORT, KNOWN_PROVIDERS,
  getEnv, isValidPort, isValidProviderId,
  parseEnv, parseProviders, providerSummary, serializeEnv, serializeProviders, setEnv, slugify,
  type EnvEntry, type ProviderEntry, type ProviderMap,
} from './configure-lib.js'

/**
 * Interactive configurator (milestone 34). Loads `.config/.env` and
 * `.config/providers.yaml`, lets the operator edit them in place — every value
 * offered as a default, providers added/edited/deleted individually — and
 * writes back only on save. Unknown `.env` keys and untouched providers are
 * preserved. The config directory comes from SBW_CONFIG_DIR (set by the
 * `configure` launcher); it defaults to `<cwd>/.config` for direct runs.
 */

const configDir = process.env.SBW_CONFIG_DIR ?? path.join(process.cwd(), '.config')
const envPath = path.join(configDir, '.env')
const providersPath = path.join(configDir, 'providers.yaml')
const keyPath = path.join(configDir, 'deploy_key')

// ---- prompt plumbing --------------------------------------------------------

// readline's async iterator buffers input lines correctly whether they arrive
// keystroke-by-keystroke (interactive TTY) or all at once (a piped/scripted
// run) — unlike question(), which drops lines that land between prompts. A
// muted output stream suppresses the echo during hidden secret entry.
let muted = false
const echo = new Writable({
  write (chunk, _enc, cb) { if (!muted) process.stdout.write(chunk); cb() },
})
const rl = readline.createInterface({
  input: process.stdin,
  output: echo,
  terminal: Boolean(process.stdin.isTTY),
})
const lineIterator = rl[Symbol.asyncIterator]()
let closed = false
rl.on('close', () => { closed = true })

async function nextLine (): Promise<string | null> {
  const { value, done } = await lineIterator.next()
  return done === true ? null : value
}

async function ask (query: string): Promise<string> {
  process.stdout.write(query)
  const line = await nextLine()
  return line === null ? '' : line.trim()
}

/** Ask with a default applied on blank input. */
async function askDefault (query: string, fallback: string): Promise<string> {
  const answer = await ask(`${query} [${fallback}]: `)
  return answer === '' ? fallback : answer
}

/** Ask, re-prompting until non-empty. */
async function askRequired (query: string): Promise<string> {
  for (;;) {
    const answer = await ask(query)
    if (answer !== '') return answer
    if (closed) return ''
    say('A value is required — please try again.')
  }
}

/** Hidden entry for secrets: on a TTY the typed characters are not echoed. */
async function askSecret (query: string): Promise<string> {
  process.stdout.write(query)
  muted = true
  const line = await nextLine()
  muted = false
  process.stdout.write('\n')
  return line === null ? '' : line.trim()
}

async function confirm (query: string, dflt: 'y' | 'n'): Promise<boolean> {
  const hint = dflt === 'y' ? 'Y/n' : 'y/N'
  const answer = (await ask(`${query} [${hint}]: `)).toLowerCase()
  return (answer === '' ? dflt : answer) === 'y'
}

function say (line = ''): void { process.stdout.write(`${line}\n`) }

// ---- working state ----------------------------------------------------------

interface State {
  env: EnvEntry[]
  providers: ProviderMap
  secretsKey: string
  bind: string
  port: string
  nodeEnv: string
  logLevel: string
}

function newSecretsKey (): string { return randomBytes(32).toString('base64') }

function loadState (): State {
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  const env = parseEnv(existsSync(envPath) ? readFileSync(envPath, 'utf8') : '')
  const providers = parseProviders(existsSync(providersPath) ? readFileSync(providersPath, 'utf8') : '')
  return {
    env,
    providers,
    secretsKey: getEnv(env, 'SECOND_BRAIN_WEB_SECRETS_KEY') ?? newSecretsKey(),
    bind: getEnv(env, 'SECOND_BRAIN_WEB_BIND') ?? DEFAULT_BIND,
    port: getEnv(env, 'SECOND_BRAIN_WEB_PORT') ?? DEFAULT_PORT,
    nodeEnv: getEnv(env, 'SECOND_BRAIN_WEB_NODE_ENV') ?? 'production',
    logLevel: getEnv(env, 'SECOND_BRAIN_WEB_LOG_LEVEL') ?? 'info',
  }
}

// ---- model picker -----------------------------------------------------------

/** Fetch and let the operator choose a model; '' if they cancel. */
async function pickModel (providerId: string, baseUrl: string, apiKey: string, current?: string): Promise<string> {
  say('  Querying available models…')
  const result = await listModels({ providerId, baseUrl: baseUrl === '' ? null : baseUrl, apiKey })
  if (!result.ok || result.models.length === 0) {
    say(`  Could not list models (${result.message}) — enter one manually.`)
    return await askRequired('  Model: ')
  }
  return await selectFromList(result.models, current)
}

/** Numbered list with a substring filter; returns the chosen value. */
async function selectFromList (models: string[], current?: string): Promise<string> {
  let filter = ''
  for (;;) {
    const shown = filter === '' ? models : models.filter(m => m.toLowerCase().includes(filter.toLowerCase()))
    if (shown.length === 0) { say(`  No models match "${filter}" — showing all.`); filter = ''; continue }
    if (filter !== '') say(`  Filter "${filter}" — ${shown.length} match(es):`)
    shown.forEach((m, i) => say(`    ${String(i + 1).padStart(3)}) ${m}${m === current ? '  (current)' : ''}`))
    const choice = await ask('  Select a model [1-' + shown.length + "], 'f' to filter, or 'm' to type one: ")
    if (choice === 'm') return await askRequired('  Model: ')
    if (choice === 'f') { filter = await ask('  Filter (substring, blank = show all): '); continue }
    const n = Number(choice)
    if (/^\d+$/.test(choice) && n >= 1 && n <= shown.length) {
      const chosen = shown[n - 1]
      if (chosen !== undefined) return chosen
    }
    if (closed) return current ?? ''
    say(`  Enter a number between 1 and ${shown.length}, 'f', or 'm'.`)
  }
}

/**
 * Numbered pick from a short fixed list. Blank keeps `current` when given;
 * without a current value the choice is required.
 */
async function selectOption (label: string, options: readonly string[], current?: string): Promise<string> {
  for (;;) {
    say(`  ${label}:`)
    options.forEach((o, i) => say(`    ${i + 1}) ${o}${o === current ? '  (current)' : ''}`))
    const hint = current === undefined ? '' : ` (blank keeps ${current})`
    const choice = await ask(`  Select [1-${options.length}]${hint}: `)
    if (choice === '' && current !== undefined) return current
    const n = Number(choice)
    if (/^\d+$/.test(choice) && n >= 1 && n <= options.length) {
      const chosen = options[n - 1]
      if (chosen !== undefined) return chosen
    }
    if (closed) return current ?? ''
    say(`  Enter a number between 1 and ${options.length}${current === undefined ? '.' : `, or blank to keep ${current}.`}`)
  }
}

// ---- chatgpt OAuth ----------------------------------------------------------

/**
 * ChatGPT subscription sign-in via the SDK's OpenAI Codex OAuth flow (m73).
 * Returns the credential blob to encrypt into the provider entry, or null
 * when the login fails or is abandoned. The manual code prompt keeps the flow
 * usable when the localhost callback cannot be reached (Docker, SSH).
 */
async function loginChatGpt (): Promise<string | null> {
  say('  ChatGPT uses your subscription — sign in with the browser link below.')
  try {
    const credentials = await loginOpenAICodex({
      onAuth: (info: { url: string, instructions?: string }) => {
        say('  Open this URL in a browser to authorise:')
        say(`    ${info.url}`)
        if (info.instructions !== undefined) say(`  ${info.instructions}`)
      },
      onProgress: (message: string) => say(`  ${message}`),
      onPrompt: async (prompt: { message: string, defaultValue?: string }) => await askDefault(`  ${prompt.message}`, prompt.defaultValue ?? ''),
      onManualCodeInput: async () => await askRequired('  Paste the authorisation code: '),
    })
    return JSON.stringify({
      access: credentials.access,
      refresh: credentials.refresh,
      expires: credentials.expires,
      ...(credentials.accountId !== undefined ? { accountId: credentials.accountId } : {}),
    })
  } catch (err) {
    say(`  ChatGPT login failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** ChatGPT model ids from the SDK catalog; empty when the catalog is unavailable. */
async function chatGptModels (): Promise<string[]> {
  try {
    return Object.keys(filterOpenAICodexModels(await getModelsForProvider('openai-codex')))
  } catch {
    return []
  }
}

async function pickChatGptModel (current?: string): Promise<string> {
  const models = await chatGptModels()
  if (models.length === 0) {
    say('  Could not load the ChatGPT model catalog — enter one manually.')
    return await askRequired('  Model: ')
  }
  return await selectFromList(models, current)
}

// ---- provider actions -------------------------------------------------------

async function addProvider (state: State): Promise<void> {
  const provider = await selectOption('Provider', KNOWN_PROVIDERS)
  const baseUrl = provider === 'openai-compatible' ? await askRequired('  Base URL: ') : ''
  let chatGptBlob: string | null = null
  if (provider === 'chatgpt') {
    chatGptBlob = await loginChatGpt()
    if (chatGptBlob === null) { say('  Provider not added — ChatGPT needs a completed login.'); return }
  }
  const apiKey = provider === 'claude-code' || provider === 'chatgpt' ? '' : await askSecret('  API key (blank for none): ')

  let model: string
  if (provider === 'claude-code') {
    say('  Claude Code uses the subscription authenticated inside the running container.')
    model = await askDefault('  Model', 'sonnet')
  } else if (provider === 'chatgpt') model = await pickChatGptModel()
  else if (apiKey !== '') model = await pickModel(provider, baseUrl, apiKey)
  else model = await askRequired('  Model: ')

  let id = ''
  const defaultId = slugify(`${provider}-${model}`)
  for (;;) {
    id = await askDefault('  Config key', defaultId)
    if (state.providers[id] !== undefined && !(await confirm(`  "${id}" exists — overwrite?`, 'n'))) continue
    if (isValidProviderId(id)) break
    say('  Config key must be lowercase letters, digits, and hyphens (start with a letter).')
  }
  const displayName = await askDefault('  Display name', model)

  const entry: ProviderEntry = { display_name: displayName, provider, model }
  if (baseUrl !== '') entry.base_url = baseUrl
  if (chatGptBlob !== null) entry.key = encryptSecret(chatGptBlob, { SECOND_BRAIN_WEB_SECRETS_KEY: state.secretsKey })
  else if (apiKey !== '') entry.key = encryptSecret(apiKey, { SECOND_BRAIN_WEB_SECRETS_KEY: state.secretsKey })
  state.providers[id] = entry
  say(`  Added provider "${id}".`)
}

async function editProvider (state: State, id: string): Promise<void> {
  for (;;) {
    const entry = state.providers[id]
    if (entry === undefined) return
    say('')
    const usesCli = entry.provider === 'claude-code'
    const usesOauth = entry.provider === 'chatgpt'
    say(`  Editing ${providerSummary(id, entry)}${usesCli ? '  [CLI auth]' : usesOauth ? '  [OAuth]' : entry.key !== undefined ? '  [key set]' : '  [no key]'}`)
    const action = await ask(`    n) rename  d) display name  m) change model${usesCli ? '' : usesOauth ? '  a) log in again' : '  a) change API key'}  x) delete  b) back: `)
    if (action === 'b' || action === '' || closed) return
    if (action === 'x') {
      if (await confirm(`    Delete provider "${id}"?`, 'n')) { delete state.providers[id]; say(`    Deleted "${id}".`); return }
    } else if (action === 'n') {
      let next = ''
      for (;;) {
        next = await askDefault('    New config key', id)
        if (next === id) break
        if (state.providers[next] !== undefined) { say('    That config key is already used.'); continue }
        if (isValidProviderId(next)) break
        say('    Config key must be lowercase letters, digits, and hyphens (start with a letter).')
      }
      if (next !== id) { state.providers[next] = entry; delete state.providers[id]; id = next }
    } else if (action === 'd') {
      entry.display_name = await askDefault('    Display name', entry.display_name ?? id)
    } else if (action === 'm' && usesOauth) {
      entry.model = await pickChatGptModel(entry.model)
    } else if (action === 'm') {
      const listed = !usesCli && await confirm('    List models from the provider? (re-enter the API key)', 'n')
      if (listed) {
        const key = await askSecret('    API key: ')
        entry.model = key === '' ? await askDefault('    Model', entry.model) : await pickModel(entry.provider, entry.base_url ?? '', key, entry.model)
      } else {
        entry.model = await askDefault('    Model', entry.model)
      }
    } else if (action === 'a' && usesOauth) {
      const blob = await loginChatGpt()
      if (blob === null) { say('    Kept the existing login.') } else {
        entry.key = encryptSecret(blob, { SECOND_BRAIN_WEB_SECRETS_KEY: state.secretsKey })
        say('    Updated the ChatGPT login.')
      }
    } else if (action === 'a' && !usesCli) {
      const key = await askSecret('    New API key (blank to remove): ')
      if (key === '') { delete entry.key; say('    Removed the stored key.') } else {
        entry.key = encryptSecret(key, { SECOND_BRAIN_WEB_SECRETS_KEY: state.secretsKey })
        say('    Updated the stored key.')
      }
    } else {
      say('    Unknown action.')
    }
  }
}

// ---- runtime + secrets + deploy key -----------------------------------------

async function editRuntime (state: State): Promise<void> {
  state.bind = await askDefault('  Host publish address (BIND)', state.bind)
  for (;;) {
    const port = await askDefault('  Host port', state.port)
    if (isValidPort(port)) { state.port = port; break }
    say('  Port must be a number between 1 and 65535.')
  }
  say('  development disables Secure auth cookies — plain-HTTP LAN only.')
  state.nodeEnv = await selectOption('Node environment', ['production', 'development'], state.nodeEnv)
  state.logLevel = await selectOption('Root log level', LOG_LEVELS, state.logLevel)
}

async function editSecretsKey (state: State): Promise<void> {
  if (await confirm('  Rotate the secrets key? (invalidates every stored provider key)', 'n')) {
    state.secretsKey = newSecretsKey()
    say('  Rotated — re-enter every provider API key before saving.')
  }
}

async function manageDeployKey (): Promise<void> {
  const present = existsSync(keyPath)
  if (present && !(await confirm('  A deploy key exists. Rotate it? (invalidates the old one)', 'n'))) return
  if (present) rmSync(keyPath, { force: true })
  if (existsSync(`${keyPath}.pub`)) rmSync(`${keyPath}.pub`, { force: true })
  try {
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'second-brain-web deploy key', '-f', keyPath], { stdio: 'ignore' })
  } catch {
    say('  ssh-keygen not available — skipped key generation. Install OpenSSH and try again.')
    return
  }
  chmodSync(keyPath, 0o644)
  chmodSync(`${keyPath}.pub`, 0o644)
  say('')
  say('  Generated a vault deploy key. Add this PUBLIC key to your Git host (write access) —')
  say('  it is also shown on the Vault page:')
  say('')
  say(`  ${readFileSync(`${keyPath}.pub`, 'utf8').trim()}`)
}

// ---- save + render ----------------------------------------------------------

function save (state: State): void {
  setEnv(state.env, 'SECOND_BRAIN_WEB_SECRETS_KEY', state.secretsKey)
  setEnv(state.env, 'SECOND_BRAIN_WEB_BIND', state.bind)
  setEnv(state.env, 'SECOND_BRAIN_WEB_PORT', state.port)
  setEnv(state.env, 'SECOND_BRAIN_WEB_NODE_ENV', state.nodeEnv)
  setEnv(state.env, 'SECOND_BRAIN_WEB_LOG_LEVEL', state.logLevel)
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  writeFileSync(envPath, serializeEnv(state.env), { mode: 0o600 })
  chmodSync(envPath, 0o600)
  // World-readable: providers.yaml is ciphertext-only and the container reads
  // the read-only bind mount as an unprivileged user.
  writeFileSync(providersPath, serializeProviders(state.providers))
  chmodSync(providersPath, 0o644)
  try { chmodSync(configDir, 0o700) } catch { /* best effort on non-POSIX */ }
}

function renderMenu (state: State): string[] {
  const ids = Object.keys(state.providers)
  const lines = ['', '=== second-brain-web configure ===', `Config dir: ${configDir}`, '', 'Providers:']
  if (ids.length === 0) lines.push('  (none yet — press "a" to add one)')
  else {
    ids.forEach((id, i) => {
      const e = state.providers[id]
      if (e === undefined) return
      lines.push(`  ${i + 1}) ${providerSummary(id, e)}${e.provider === 'claude-code' ? '  [CLI auth]' : e.provider === 'chatgpt' ? '  [OAuth]' : e.key !== undefined ? '  [key set]' : '  [no key]'}`)
    })
  }
  lines.push('')
  lines.push(`Runtime:  BIND=${state.bind}  PORT=${state.port}  NODE_ENV=${state.nodeEnv}  LOG_LEVEL=${state.logLevel}`)
  lines.push(`Deploy key: ${existsSync(keyPath) ? 'present' : 'absent'}`)
  lines.push('')
  lines.push('Actions: [1-N] edit provider   a) add   r) runtime   k) deploy key   x) secrets key   s) save & exit   q) quit')
  return lines
}

async function main (): Promise<void> {
  const state = loadState()
  for (;;) {
    for (const line of renderMenu(state)) say(line)
    const choice = await ask('> ')
    // Check the choice before EOF: reading the final piped line also closes the
    // stream, and a valid 's'/'q' must still take effect.
    if (choice === 's') {
      save(state)
      say(`Saved to ${configDir}. Next: ./compose-helper.sh up`)
      if (Object.values(state.providers).some(entry => entry.provider === 'claude-code')) {
        say('Claude Code selected: after the container starts, run ./compose-helper.sh claude-auth')
      }
      break
    }
    if (choice === 'q' || (choice === '' && closed)) { say('Quit without saving.'); break }
    if (choice === 'a') { await addProvider(state) } else if (choice === 'r') { await editRuntime(state) } else if (choice === 'k') { await manageDeployKey() } else if (choice === 'x') { await editSecretsKey(state) } else if (/^\d+$/.test(choice)) {
      const ids = Object.keys(state.providers)
      const targetId = ids[Number(choice) - 1]
      if (targetId !== undefined) await editProvider(state, targetId)
      else say('No provider with that number.')
    } else { say('Unknown action.') }
  }
  rl.close()
}

main().catch((err: unknown) => {
  process.stderr.write(`configure: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
  rl.close()
})
