$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $Root '.env'
$ProvidersFile = Join-Path $Root 'providers.yaml'

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Quote-Yaml([string]$Value) { "'" + $Value.Replace("'", "''") + "'" }

$SecretsKey = $null
if (Test-Path $EnvFile) {
  $line = Get-Content $EnvFile | Where-Object { $_ -match '^SECOND_BRAIN_WEB_SECRETS_KEY=' } | Select-Object -Last 1
  if ($line) { $SecretsKey = $line.Substring($line.IndexOf('=') + 1) }
}
if ($SecretsKey) {
  $reuse = Read-Host 'Reuse the existing secrets key? [Y/n]'
  if ($reuse -match '^[Nn]$') {
    Write-Warning 'Rotation invalidates every existing provider ciphertext; re-enter all provider keys.'
    $SecretsKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  }
} else {
  $SecretsKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  Write-Host 'Generated SECOND_BRAIN_WEB_SECRETS_KEY.'
}
Set-Content -Path $EnvFile -Value "SECOND_BRAIN_WEB_SECRETS_KEY=$SecretsKey" -Encoding utf8NoBOM

function Encrypt-ProviderKey([string]$Plaintext) {
  $cli = Join-Path $Root 'app/server/dist/cli/encrypt-secret.js'
  if (Test-Path $cli) {
    $old = $env:SECOND_BRAIN_WEB_SECRETS_KEY
    try {
      $env:SECOND_BRAIN_WEB_SECRETS_KEY = $SecretsKey
      $Plaintext | & node $cli
    } finally { $env:SECOND_BRAIN_WEB_SECRETS_KEY = $old }
    return
  }
  throw 'Build the app (`cd app; npm run build`) before running configure.ps1.'
}

$lines = [Collections.Generic.List[string]]::new()
$lines.Add('providers:')
$count = 0
while ($true) {
  $label = if ($count -eq 0) { 'Add a provider? [y/N]' } else { 'Add another provider? [y/N]' }
  if ((Read-Host $label) -notmatch '^[Yy]$') { break }
  $id = Read-Host '  Config key (lowercase letters, digits, hyphens)'
  if ($id -notmatch '^[a-z][a-z0-9-]*$') { throw 'Invalid config key.' }
  $name = Read-Host '  Display name'
  $provider = Read-Host '  Provider (anthropic|gemini|openai|openai-compatible)'
  if ($provider -notmatch '^(anthropic|gemini|openai|openai-compatible)$') { throw 'Invalid provider.' }
  $model = Read-Host '  Model'
  if (-not $model) { throw 'Model is required.' }
  $base = if ($provider -eq 'openai-compatible') { Read-Host '  Base URL' } else { $null }
  $plain = Read-PlainSecret '  API key (blank for none)'
  $cipher = if ($plain) { (Encrypt-ProviderKey $plain).Trim() } else { $null }
  $plain = $null
  $lines.Add("  ${id}:")
  if ($name) { $lines.Add('    display_name: ' + (Quote-Yaml $name)) }
  $lines.Add("    provider: $provider")
  $lines.Add('    model: ' + (Quote-Yaml $model))
  if ($base) { $lines.Add('    base_url: ' + (Quote-Yaml $base)) }
  if ($cipher) { $lines.Add('    key: ' + (Quote-Yaml $cipher)) }
  $count++
}
if ($count -eq 0) { $lines.Add('  {}') }
Set-Content -Path $ProvidersFile -Value $lines -Encoding utf8NoBOM
Write-Host "Configured $count provider(s). Next: ./compose-helper.sh up"
