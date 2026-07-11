# configure.ps1 — launcher for the interactive Node configurator
# (app/server/src/cli/configure.ts). All logic lives in the app so it is written
# once and shared with the bash `configure`. This shim just finds a way to run
# it: the built app with host Node, else the Docker image.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $Root '.config'
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

# One-time migration: seed .config/.env from a legacy repo-root .env so existing
# secrets/settings survive. compose-helper prefers a root .env, so warn to drop it.
$EnvFile = Join-Path $ConfigDir '.env'
$RootEnv = Join-Path $Root '.env'
if (-not (Test-Path $EnvFile) -and (Test-Path $RootEnv)) {
  Copy-Item $RootEnv $EnvFile
  Write-Host "configure: migrated $RootEnv -> $EnvFile. Remove the repo-root .env (compose-helper prefers it)."
}

$Dist = Join-Path $Root 'app/server/dist/cli/configure.js'
if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path $Dist)) {
  $env:SBW_CONFIG_DIR = $ConfigDir
  & node $Dist
  exit $LASTEXITCODE
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  & docker image inspect second-brain-web *> $null
  if ($LASTEXITCODE -eq 0) {
    & docker run --rm -it -v "${ConfigDir}:/config" -e SBW_CONFIG_DIR=/config `
      second-brain-web node server/dist/cli/configure.js
    exit $LASTEXITCODE
  }
}

Write-Error 'configure.ps1: need Node with the built app (cd app; npm run build) or the second-brain-web Docker image.'
exit 1
