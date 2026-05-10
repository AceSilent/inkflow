$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root '.runtime\inkflow-pids.json'
$stopped = New-Object System.Collections.Generic.List[int]

function Stop-IfRunning {
  param([int]$ProcessId)

  if ($ProcessId -le 0) { return }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  $stopped.Add($ProcessId) | Out-Null
}

if (Test-Path $pidFile) {
  try {
    $pids = Get-Content -Raw $pidFile | ConvertFrom-Json
    Stop-IfRunning -ProcessId ([int]$pids.server)
    Stop-IfRunning -ProcessId ([int]$pids.frontend)
  } catch {
    Write-Host "Could not read $pidFile; falling back to port lookup."
  }
}

foreach ($port in 3001, 5173) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    Stop-IfRunning -ProcessId ([int]$connection.OwningProcess)
  }
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

if ($stopped.Count -gt 0) {
  Write-Host "Stopped InkFlow processes: $($stopped -join ', ')"
} else {
  Write-Host 'No running InkFlow processes were found.'
}
