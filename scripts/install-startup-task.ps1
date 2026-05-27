$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Split-Path -Parent $ScriptDir
$WatchScript = Join-Path $ScriptDir "start-vietdub-watch.ps1"
$TaskName = "VietDub AI Server"
$LogDir = Join-Path $AppDir "data\logs"
$LogFile = Join-Path $LogDir "install-startup-task.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-InstallLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogFile -Value "[$timestamp] $Message"
}

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-InstallLog "Failed: not running as Administrator."
  throw "Hay chay script nay bang quyen Administrator."
}

Write-InstallLog "Installing scheduled task: $TaskName"

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchScript`"" `
  -WorkingDirectory $AppDir

$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Start VietDub AI local web server before user logon and keep it alive." `
  -Force | Out-Null

Write-InstallLog "Scheduled task registered."
Start-ScheduledTask -TaskName $TaskName
Write-InstallLog "Scheduled task started."
Start-Sleep -Seconds 3

$task = Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
Write-InstallLog "Task state: $($task.State)"
$task
