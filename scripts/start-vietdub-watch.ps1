$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Split-Path -Parent $ScriptDir
$Port = 3210
$HealthUrl = "http://127.0.0.1:$Port/health"
$LogDir = Join-Path $AppDir "data\logs"
$LogFile = Join-Path $LogDir "startup-watch.log"

Set-Location -LiteralPath $AppDir

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-VietDubLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogFile -Value "[$timestamp] $Message"
}

Write-VietDubLog "Watchdog started. AppDir=$AppDir Port=$Port"

function Test-VietDubHealth {
  try {
    $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 3
    return $response.ok -eq $true
  } catch {
    return $false
  }
}

while ($true) {
  if (Test-VietDubHealth) {
    Start-Sleep -Seconds 30
    continue
  }

  Write-VietDubLog "Health check failed. Starting VietDub server."
  $process = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LogDir "server.out.log") -RedirectStandardError (Join-Path $LogDir "server.err.log")
  Write-VietDubLog "Started node process Id=$($process.Id)."
  Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  Write-VietDubLog "Node process Id=$($process.Id) exited."
  Start-Sleep -Seconds 5
}
