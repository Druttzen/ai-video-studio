# AI Video Tool - full uninstall helper (invoked by NSIS or run manually).
# Stops app/engine, removes bundled components, optionally removes model data.

param(
    [switch]$Uninstall,
    [string]$InstDir = "",
    [switch]$Quiet,
    [ValidateSet("ask", "yes", "no")]
    [string]$RemoveData = "ask"
)

$ErrorActionPreference = "Stop"

function Write-Banner {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  AI Video Tool - Uninstall" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Format-Bytes([long]$Bytes) {
    if ($Bytes -ge 1GB) { return ("{0:N2} GB" -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ("{0:N1} MB" -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ("{0:N0} KB" -f ($Bytes / 1KB)) }
    return "$Bytes B"
}

function Format-Duration([double]$Seconds) {
    if ($Seconds -lt 0 -or [double]::IsInfinity($Seconds) -or [double]::IsNaN($Seconds)) { return "?" }
    $ts = [TimeSpan]::FromSeconds([math]::Ceiling($Seconds))
    if ($ts.TotalHours -ge 1) { return $ts.ToString("h'h 'm'm'") }
    if ($ts.TotalMinutes -ge 1) { return $ts.ToString("m'm 's's'") }
    return $ts.ToString("s's'")
}

function Write-ProgressLine([string]$Label, [double]$Pct, [long]$Done, [long]$Total, [double]$EtaSec) {
    $barWidth = 28
    $filled = [math]::Min($barWidth, [math]::Floor($Pct / 100 * $barWidth))
    $bar = ("#" * $filled).PadRight($barWidth, "-")
    $pctStr = "{0,5:N1}%" -f $Pct
    $etaStr = Format-Duration $EtaSec
    Write-Host ("`r  [{0}] {1}  {2} / {3}  ETA {4}  " -f $bar, $pctStr, (Format-Bytes $Done), (Format-Bytes $Total), $etaStr) -NoNewline
}

function Get-ScriptRoot {
    if ($PSScriptRoot) { return $PSScriptRoot }
    return Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Resolve-InstallDir([string]$Explicit) {
    if ($Explicit) { return (Resolve-Path $Explicit).Path }
    foreach ($cand in @(
        (Join-Path (Get-Location) "ai-video-tool.exe"),
        (Join-Path $env:LOCALAPPDATA "AI Video Tool\ai-video-tool.exe"),
        (Join-Path $env:ProgramFiles "AI Video Tool\ai-video-tool.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "AI Video Tool\ai-video-tool.exe")
    )) {
        if (Test-Path $cand) { return (Split-Path $cand -Parent) }
    }
    return (Get-Location).Path
}

function Read-InstallState([string]$InstallDir) {
    $path = Join-Path $InstallDir ".ave-install-state.json"
    if (-not (Test-Path $path)) { return $null }
    try { return Get-Content $path -Raw | ConvertFrom-Json } catch { return $null }
}

function Get-DataDirCandidates([string]$InstallDir, $State) {
    $dirs = New-Object System.Collections.Generic.List[string]
    if ($State -and $State.data_dir) { $dirs.Add([string]$State.data_dir) | Out-Null }
    foreach ($p in @(
        "E:\AIVideoStudio\data",
        "D:\AIVideoStudio\data",
        (Join-Path $env:LOCALAPPDATA "AI Video Tool\data"),
        (Join-Path $env:LOCALAPPDATA "AIVideoStudio\data"),
        (Join-Path $env:LOCALAPPDATA "AIVideoStudio")
    )) {
        if ($p -and (Test-Path $p) -and -not $dirs.Contains($p)) { $dirs.Add($p) | Out-Null }
    }
    return $dirs
}

function Stop-AppProcesses {
    $names = @("ai-video-tool", "ave-engine")
    foreach ($name in $names) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host ("  stopping {0} (pid {1})" -f $_.ProcessName, $_.Id) -ForegroundColor DarkGray
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 500
}

function Get-DirBytes([string]$Path) {
    if (-not (Test-Path $Path)) { return 0 }
    return (Get-ChildItem $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
}

function Remove-TreeWithProgress([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) { return }
    $files = @(Get-ChildItem $Path -Recurse -File -Force -ErrorAction SilentlyContinue)
    $total = ($files | Measure-Object -Property Length -Sum).Sum
    if ($total -le 0) {
        Remove-Item -Recurse -Force -Path $Path -ErrorAction SilentlyContinue
        return
    }
    $done = [long]0
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    foreach ($f in ($files | Sort-Object FullName -Descending)) {
        Remove-Item -Force -LiteralPath $f.FullName -ErrorAction SilentlyContinue
        $done += $f.Length
        $elapsed = [math]::Max($sw.Elapsed.TotalSeconds, 0.001)
        $rate = $done / $elapsed
        $eta = if ($rate -gt 0) { ($total - $done) / $rate } else { 0 }
        $pct = 100.0 * $done / $total
        Write-ProgressLine $Label $pct $done $total $eta
    }
    Remove-Item -Recurse -Force -Path $Path -ErrorAction SilentlyContinue
    Write-Host ""
}

function Should-RemoveData([string]$Choice, [array]$DataDirs, [switch]$Quiet) {
    if ($Choice -eq "yes") { return $true }
    if ($Choice -eq "no") { return $false }
    if ($Quiet) { return $false }
    if ($DataDirs.Count -eq 0) { return $false }
    Write-Host "Also remove downloaded models and rendered videos?" -ForegroundColor Yellow
    foreach ($d in $DataDirs) {
        $gb = [math]::Round((Get-DirBytes $d) / 1GB, 2)
        Write-Host ("  {0}  ({1} GB)" -f $d, $gb)
    }
    $ans = Read-Host "Remove model/output data? [y/N]"
    return ($ans -match '^[Yy]')
}

# --- main ---

if (-not $Uninstall) {
    Write-Host "Use: ave-uninstall.cmd --Uninstall --inst-dir <path>"
    exit 2
}

Write-Banner

$installDir = Resolve-InstallDir $InstDir
$state = Read-InstallState $installDir
$dataDirs = @(Get-DataDirCandidates $installDir $state | Where-Object { Test-Path $_ })

Write-Host "[1/3] Install location" -ForegroundColor Yellow
Write-Host "  $installDir"
Write-Host ""

Write-Host "[2/3] Stopping running processes..." -ForegroundColor Yellow
Stop-AppProcesses
Write-Host "  done" -ForegroundColor Green
Write-Host ""

$components = @(
    @{ id = "engine"; path = (Join-Path $installDir "ave-engine") },
    @{ id = "addons"; path = (Join-Path $installDir "addons") }
)

Write-Host "[3/3] Removing installed components..." -ForegroundColor Yellow
foreach ($c in $components) {
    if (Test-Path $c.path) {
        $size = Get-DirBytes $c.path
        Write-Host ("  -> {0}: {1}" -f $c.id, (Format-Bytes $size)) -ForegroundColor Cyan
        Remove-TreeWithProgress $c.path $c.id
        Write-Host ("  -> {0}: removed" -f $c.id) -ForegroundColor Green
    }
}

$statePath = Join-Path $installDir ".ave-install-state.json"
if (Test-Path $statePath) { Remove-Item -Force $statePath }

if (Should-RemoveData $RemoveData $dataDirs -Quiet:$Quiet) {
    Write-Host ""
    Write-Host "Removing user data..." -ForegroundColor Yellow
    foreach ($d in $dataDirs) {
        if (Test-Path $d) {
            Write-Host ("  -> data: {0}" -f $d) -ForegroundColor Cyan
            Remove-TreeWithProgress $d "data"
        }
    }
} else {
    Write-Host ""
    Write-Host "Kept model/output data on disk." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Component cleanup complete. Windows will remove the app registration next." -ForegroundColor Green
exit 0
