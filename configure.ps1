# configure.ps1 — interactive setup for second-brain-web's runtime config
# (Windows/PowerShell port of ./configure; keep the two behaviourally matched).
#
# Writes everything the compose runtime needs into a gitignored .config/ dir:
#   .config/.env             SECOND_BRAIN_WEB_SECRETS_KEY
#   .config/providers.yaml   provider profiles, API keys pre-encrypted
#   .config/deploy_key(.pub) vault SSH deploy key
#
# Design notes:
#   * Invalid input re-prompts in place; the script never aborts on a typo.
#   * Provider + key are entered first, then the model is chosen from the list
#     the provider reports (falling back to manual entry if the query fails).
#   * The deploy key is generated here; its public half is also shown on the
#     Vault page so you can register it with your Git host.
#   * File modes are only meaningful for the Linux container reading the bind
#     mounts, so they are applied via chmod when available (a no-op on Windows,
#     where Docker Desktop governs the mount and the app copies the private key
#     to a 600 file in the data volume before use). The .config/ dir is gitignored.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $Root '.config'
$EnvFile = Join-Path $ConfigDir '.env'
$ProvidersFile = Join-Path $ConfigDir 'providers.yaml'
$KeyFile = Join-Path $ConfigDir 'deploy_key'
$RootEnv = Join-Path $Root '.env'

New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

# ---- helpers ----------------------------------------------------------------

# Best-effort POSIX mode; a no-op on hosts without chmod (e.g. Windows).
function Set-FileMode([string]$Path, [string]$Mode) {
  if (Get-Command chmod -ErrorAction SilentlyContinue) { & chmod $Mode $Path 2>$null }
}

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

# Re-prompt until a value is given.
function Read-Required([string]$Prompt) {
  while ($true) {
    $v = Read-Host $Prompt
    if ($v) { return $v }
    Write-Host 'A value is required - please try again.'
  }
}

# Re-prompt until the value matches a regex.
function Read-Matching([string]$Prompt, [string]$Pattern, [string]$ErrMsg) {
  while ($true) {
    $v = Read-Host $Prompt
    if ($v -match $Pattern) { return $v }
    Write-Host $ErrMsg
  }
}

# Yes/no; returns $true for yes.
function Confirm-Yes([string]$Prompt) { (Read-Host $Prompt) -match '^[Yy]$' }

function Quote-Yaml([string]$Value) { "'" + $Value.Replace("'", "''") + "'" }

# Lowercase, hyphenate, and trim a string into a valid config key.
function Get-Slug([string]$Value) {
  ($Value.ToLower() -replace '[^a-z0-9-]', '-' -replace '-{2,}', '-').Trim('-')
}

# Show a list on the host, paging when it is taller than the window.
function Show-List([string[]]$Lines) {
  $rows = try { $Host.UI.RawUI.WindowSize.Height } catch { 24 }
  if ($Lines.Count -gt ($rows - 2)) { $Lines | Out-Host -Paging }
  else { $Lines | ForEach-Object { Write-Host $_ } }
}

# Pick from $Models and return the chosen id. A long list can be narrowed with a
# case-insensitive substring filter and is paged when it does not fit the
# window; 'm' always allows manual entry.
function Select-Model([string[]]$Models) {
  $filter = ''
  while ($true) {
    $shown = if ($filter) { @($Models | Where-Object { $_.ToLower().Contains($filter.ToLower()) }) } else { @($Models) }
    if ($shown.Count -eq 0) {
      Write-Host "  No models match `"$filter`" - showing all."
      $filter = ''
      continue
    }
    $lines = @()
    if ($filter) { $lines += ('  Filter "{0}" - {1} match(es):' -f $filter, $shown.Count) }
    for ($i = 0; $i -lt $shown.Count; $i++) { $lines += ('    {0,3}) {1}' -f ($i + 1), $shown[$i]) }
    Show-List $lines
    $choice = Read-Host "  Select a model [1-$($shown.Count)], 'f' to filter, or 'm' to type one"
    if ($choice -eq 'm') { return (Read-Required '  Model') }
    elseif ($choice -eq 'f') { $filter = Read-Host '  Filter (substring, blank = show all)' }
    elseif (($choice -match '^\d+$') -and ([int]$choice -ge 1) -and ([int]$choice -le $shown.Count)) {
      return $shown[[int]$choice - 1]
    } else {
      Write-Host ("  Enter a number between 1 and {0}, 'f', or 'm'." -f $shown.Count)
    }
  }
}

function New-SecretsKey { [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) }

# Read the value of KEY=... from a file (last occurrence), or ''.
function Read-EnvValue([string]$Key, [string]$File) {
  if (-not $File -or -not (Test-Path $File)) { return '' }
  $line = Get-Content $File | Where-Object { $_ -match "^$Key=" } | Select-Object -Last 1
  if ($line) { return $line.Substring($line.IndexOf('=') + 1) }
  return ''
}

# Yes/no with a default (y|n) applied on blank input; returns $true for yes.
function Confirm-Default([string]$Prompt, [string]$Default) {
  $ans = Read-Host $Prompt
  if (-not $ans) { $ans = $Default }
  $ans -match '^[Yy]$'
}

# ---- app CLI bridges (dist first, then the docker image) --------------------

# True when the second-brain-web image is available locally.
function Test-DockerImage {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  & docker image inspect second-brain-web *> $null
  return ($LASTEXITCODE -eq 0)
}

function Encrypt-ProviderKey([string]$Plaintext) {
  $distCli = Join-Path $Root 'app/server/dist/cli/encrypt-secret.js'
  $old = $env:SECOND_BRAIN_WEB_SECRETS_KEY
  try {
    $env:SECOND_BRAIN_WEB_SECRETS_KEY = $SecretsKey
    if (Test-Path $distCli) { return ($Plaintext | & node $distCli) }
    if (Test-DockerImage) {
      return ($Plaintext | & docker run --rm -i -e SECOND_BRAIN_WEB_SECRETS_KEY=$SecretsKey second-brain-web node server/dist/cli/encrypt-secret.js)
    }
    throw 'configure.ps1: build the app (`cd app; npm run build`) or the second-brain-web image, then run again.'
  } finally { $env:SECOND_BRAIN_WEB_SECRETS_KEY = $old }
}

# Return the provider's model ids as an array, or $null when the listing fails.
# The API key is passed on stdin so it never lands in the process arguments.
function Get-ProviderModels([string]$Provider, [string]$BaseUrl, [string]$ApiKey) {
  $distCli = Join-Path $Root 'app/server/dist/cli/list-models.js'
  $oldP = $env:SBW_LIST_PROVIDER; $oldB = $env:SBW_LIST_BASE_URL
  try {
    $env:SBW_LIST_PROVIDER = $Provider
    $env:SBW_LIST_BASE_URL = $BaseUrl
    if (Test-Path $distCli) {
      $out = $ApiKey | & node $distCli 2>$null
      if ($LASTEXITCODE -eq 0) { return @($out | Where-Object { $_ -ne '' }) }
      return $null
    }
    if (Test-DockerImage) {
      $out = $ApiKey | & docker run --rm -i -e SBW_LIST_PROVIDER=$Provider -e SBW_LIST_BASE_URL=$BaseUrl second-brain-web node server/dist/cli/list-models.js 2>$null
      if ($LASTEXITCODE -eq 0) { return @($out | Where-Object { $_ -ne '' }) }
      return $null
    }
    return $null
  } catch { return $null }
  finally { $env:SBW_LIST_PROVIDER = $oldP; $env:SBW_LIST_BASE_URL = $oldB }
}

# ---- secrets key + runtime settings -----------------------------------------

# Prior values come from .config/.env, or a legacy root .env on first migration.
$SrcEnv = if (Test-Path $EnvFile) { $EnvFile } elseif (Test-Path $RootEnv) { $RootEnv } else { '' }

$SecretsKey = Read-EnvValue 'SECOND_BRAIN_WEB_SECRETS_KEY' $SrcEnv
if ($SecretsKey) {
  if (Confirm-Yes 'Rotate the existing secrets key? (invalidates every stored provider key) [y/N]') {
    $SecretsKey = New-SecretsKey
    Write-Host 'Rotated the secrets key - re-enter every provider key below.'
  }
} else {
  $SecretsKey = New-SecretsKey
  Write-Host 'Generated SECOND_BRAIN_WEB_SECRETS_KEY.'
}

$DefaultBind = Read-EnvValue 'SECOND_BRAIN_WEB_BIND' $SrcEnv
if (-not $DefaultBind) { $DefaultBind = '127.0.0.1' }
$Bind = Read-Host "Host publish address (BIND) [$DefaultBind]"
if (-not $Bind) { $Bind = $DefaultBind }

$DefaultPort = Read-EnvValue 'SECOND_BRAIN_WEB_PORT' $SrcEnv
if (-not $DefaultPort) { $DefaultPort = '8722' }
$Port = ''
while ($true) {
  $Port = Read-Host "Host port [$DefaultPort]"
  if (-not $Port) { $Port = $DefaultPort }
  if (($Port -match '^\d+$') -and ([int]$Port -ge 1) -and ([int]$Port -le 65535)) { break }
  Write-Host 'Port must be a number between 1 and 65535.'
}

# NODE_ENV: production unless the operator opts into development (drops the
# Secure cookie flag - plain-HTTP LAN only).
$DevDefault = if ((Read-EnvValue 'SECOND_BRAIN_WEB_NODE_ENV' $SrcEnv) -eq 'development') { 'y' } else { 'n' }
$DevHint = if ($DevDefault -eq 'y') { 'Y/n' } else { 'y/N' }
$NodeEnv = if (Confirm-Default "Enable development mode? (disables Secure auth cookies - plain-HTTP LAN only) [$DevHint]" $DevDefault) { 'development' } else { 'production' }

Set-Content -Path $EnvFile -Encoding utf8NoBOM -Value @(
  "SECOND_BRAIN_WEB_SECRETS_KEY=$SecretsKey"
  "SECOND_BRAIN_WEB_BIND=$Bind"
  "SECOND_BRAIN_WEB_PORT=$Port"
  "SECOND_BRAIN_WEB_NODE_ENV=$NodeEnv"
)
Set-FileMode $ConfigDir '700'
Set-FileMode $EnvFile '600'

# A root-level .env would shadow .config/.env (compose-helper prefers the root),
# leaving the real secrets key unused. Offer to remove the stale copy.
if (Test-Path $RootEnv) {
  Write-Host 'A legacy .env at the repo root will take precedence over .config/.env.'
  if (Confirm-Yes 'Remove the legacy repo-root .env? [y/N]') {
    Remove-Item -Force $RootEnv
    Write-Host "Removed $RootEnv."
  }
}

# ---- providers --------------------------------------------------------------

$lines = [Collections.Generic.List[string]]::new()
$lines.Add('providers:')
$count = 0
while ($true) {
  $addPrompt = if ($count -eq 0) { 'Add a provider? [y/N]' } else { 'Add another provider? [y/N]' }
  if (-not (Confirm-Yes $addPrompt)) { break }

  $provider = Read-Matching '  Provider (anthropic|gemini|openai|openai-compatible)' `
    '^(anthropic|gemini|openai|openai-compatible)$' `
    '  Invalid provider - choose anthropic, gemini, openai, or openai-compatible.'

  $base = if ($provider -eq 'openai-compatible') { Read-Required '  Base URL' } else { '' }

  $apiKey = Read-PlainSecret '  API key (blank for none)'

  # Query the provider for its model list; fall back to manual entry.
  $model = ''
  if ($apiKey) {
    Write-Host '  Querying available models...'
    $models = Get-ProviderModels $provider $base $apiKey
    if ($models -and $models.Count -gt 0) {
      $model = Select-Model $models
    } else {
      Write-Host '  Could not list models automatically - enter one manually.'
      $model = Read-Required '  Model'
    }
  } else {
    $model = Read-Required '  Model'
  }

  $defaultId = Get-Slug "$provider-$model"
  $id = ''
  while ($true) {
    $id = Read-Host "  Config key [$defaultId]"
    if (-not $id) { $id = $defaultId }
    if ($id -match '^[a-z][a-z0-9-]*$') { break }
    Write-Host '  Config key must be lowercase letters, digits, and hyphens (start with a letter).'
  }

  $name = Read-Host "  Display name [$model]"
  if (-not $name) { $name = $model }

  $cipher = if ($apiKey) { (Encrypt-ProviderKey $apiKey).Trim() } else { $null }
  $apiKey = $null

  $lines.Add("  ${id}:")
  $lines.Add('    display_name: ' + (Quote-Yaml $name))
  $lines.Add("    provider: $provider")
  $lines.Add('    model: ' + (Quote-Yaml $model))
  if ($base) { $lines.Add('    base_url: ' + (Quote-Yaml $base)) }
  if ($cipher) { $lines.Add('    key: ' + (Quote-Yaml $cipher)) }
  $count++
  Write-Host "  Added provider `"$id`"."
}
if ($count -eq 0) { $lines.Add('  {}') }
Set-Content -Path $ProvidersFile -Value $lines -Encoding utf8NoBOM
Set-FileMode $ProvidersFile '644'

# ---- vault deploy key -------------------------------------------------------

function New-DeployKey {
  if (-not (Get-Command ssh-keygen -ErrorAction SilentlyContinue)) {
    Write-Warning 'ssh-keygen not found - skipping vault key generation. Install OpenSSH and re-run to add one.'
    return
  }
  # Empty passphrase (-N ''); requires modern PowerShell native-argument passing.
  & ssh-keygen -t ed25519 -N '' -C 'second-brain-web deploy key' -f $KeyFile | Out-Null
  # World-readable so the container user can read the read-only bind mount; the
  # app copies the private half to a 600 file in the data volume before use.
  Set-FileMode $KeyFile '644'
  Set-FileMode "$KeyFile.pub" '644'
  Write-Host ''
  Write-Host 'Generated a vault SSH deploy key. Add this PUBLIC key to your Git host'
  Write-Host '(with write access) - it is also shown on the Vault page:'
  Write-Host ''
  Get-Content "$KeyFile.pub" | Write-Host
  Write-Host ''
  Write-Host '  GitHub: repository -> Settings -> Deploy keys -> Add deploy key -> tick "Allow write access".'
}

if (Test-Path $KeyFile) {
  if (Confirm-Yes 'A vault deploy key already exists. Rotate it? (invalidates the old one) [y/N]') {
    Remove-Item -Force $KeyFile, "$KeyFile.pub" -ErrorAction SilentlyContinue
    New-DeployKey
  } else {
    Write-Host 'Keeping the existing vault deploy key.'
  }
} else {
  New-DeployKey
}

# ---- done -------------------------------------------------------------------

Write-Host ''
Write-Host "Configured $count provider(s) into $ConfigDir."
Write-Host 'Next: ./compose-helper.sh up'
