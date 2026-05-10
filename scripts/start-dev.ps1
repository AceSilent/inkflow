$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

function Ensure-Dependencies {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $nodeModules = Join-Path $Path 'node_modules'
  if (Test-Path $nodeModules) { return }

  Write-Host "$Name dependencies not found. Installing now; first launch may take a few minutes."
  if (Test-Path (Join-Path $Path 'package-lock.json')) {
    npm ci --prefix $Path
  } else {
    npm install --prefix $Path
  }
}

Ensure-Dependencies -Name 'Backend' -Path (Join-Path $root 'server')
Ensure-Dependencies -Name 'Frontend' -Path (Join-Path $root 'frontend')

if (-not (Test-Path (Join-Path $root '.env'))) {
  Write-Host 'No .env file found. Copy .env.example to .env and fill in your model provider settings if you want real model calls.'
} else {
  Get-Content (Join-Path $root '.env') | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { return }
    $name, $value = $line.Split('=', 2)
    $name = $name.Trim()
    $value = $value.Trim().Trim('"').Trim("'")
    if ($name) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
  }
  if (-not $env:LLM_API_KEY -and $env:OPENAI_API_KEY) { $env:LLM_API_KEY = $env:OPENAI_API_KEY }
  if (-not $env:LLM_BASE_URL -and $env:OPENAI_BASE_URL) { $env:LLM_BASE_URL = $env:OPENAI_BASE_URL }
  if (-not $env:LLM_MODEL -and $env:AUTHOR_MODEL) { $env:LLM_MODEL = $env:AUTHOR_MODEL }
  if (-not $env:EDITORIAL_MODEL -and $env:EDITOR_MODEL) { $env:EDITORIAL_MODEL = $env:EDITOR_MODEL }
}

if (-not $env:AUTONOVEL_DATA_DIR) {
  $env:AUTONOVEL_DATA_DIR = Join-Path $root 'books'
}

$serverLog = Join-Path $root 'server-dev.log'
$frontendLog = Join-Path $root 'frontend-dev.log'
Remove-Item -LiteralPath $serverLog, $frontendLog -Force -ErrorAction SilentlyContinue

$serverCmd = "Set-Location '$root\server'; npm run dev *> '$serverLog'"
$frontendCmd = "Set-Location '$root\frontend'; npm run dev -- --host 127.0.0.1 *> '$frontendLog'"

$server = Start-Process -FilePath powershell -ArgumentList @('-NoProfile', '-Command', $serverCmd) -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath powershell -ArgumentList @('-NoProfile', '-Command', $frontendCmd) -WindowStyle Hidden -PassThru

$runtimeDir = Join-Path $root '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
@{
  server = $server.Id
  frontend = $frontend.Id
  started_at = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $runtimeDir 'inkflow-pids.json')

Write-Host "InkFlow backend starting on http://127.0.0.1:3001 (PID $($server.Id))"
Write-Host "InkFlow UI starting on http://127.0.0.1:5173 (PID $($frontend.Id))"
Write-Host "Logs: $serverLog"
Write-Host "Logs: $frontendLog"
Write-Host "Close InkFlow with stop.cmd."

Start-Process 'http://127.0.0.1:5173/'
