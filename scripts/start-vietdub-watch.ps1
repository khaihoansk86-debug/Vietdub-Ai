$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Split-Path -Parent $ScriptDir
$Port = 3210
$HealthUrl = "http://127.0.0.1:$Port/health"

Set-Location -LiteralPath $AppDir

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

  $process = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru
  Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 5
}
