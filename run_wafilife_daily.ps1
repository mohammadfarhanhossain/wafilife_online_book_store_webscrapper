# Daily Automation Script for Wafilife
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$LogDir = Join-Path $ScriptDir "data\logs"
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "daily_run_$(Get-Date -Format 'yyyyMMdd').log"

Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting scheduled daily update for Wafilife..." | Tee-Object -FilePath $LogFile -Append

if (Test-Path ".\.venv\Scripts\python.exe") {
    $PythonExe = ".\.venv\Scripts\python.exe"
} else {
    $PythonExe = "python.exe"
}

& $PythonExe "wafilife_pipeline.py" --verify | Tee-Object -FilePath $LogFile -Append
Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Verification and daily run completed for Wafilife." | Tee-Object -FilePath $LogFile -Append
