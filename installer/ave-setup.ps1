# AI Video Tool - post-install component scanner & installer.
# Phase 2: scan hardware + missing components.
# Phase 3: copy/download addons into the install dir with live CMD progress + ETA.

param(
    [switch]$PostInstall,
    [string]$InstDir = "",
    [string]$Source = "",
    [switch]$Quiet,
    [switch]$SkipLaunch,
    [string]$DownloadModels = "",
    [switch]$SkipModels
)

$ErrorActionPreference = "Stop"

function Write-Banner {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  AI Video Tool - Component Setup" -ForegroundColor Cyan
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

function Resolve-InstallDir {
    param([string]$Explicit)
    if ($Explicit) { return (Resolve-Path $Explicit).Path }

    $exe = Get-Process -Id $PID -ErrorAction SilentlyContinue
    # Prefer parent ai-video-tool.exe location when re-run from app folder.
    foreach ($cand in @(
        (Join-Path (Get-Location) "ai-video-tool.exe"),
        (Join-Path $env:LOCALAPPDATA "AI Video Tool\ai-video-tool.exe"),
        (Join-Path $env:ProgramFiles "AI Video Tool\ai-video-tool.exe")
    )) {
        if (Test-Path $cand) { return (Split-Path $cand -Parent) }
    }
    return (Get-Location).Path
}

function Get-PayloadRoots([string]$InstallDir, [string]$SourceDir) {
    $roots = New-Object System.Collections.Generic.List[string]
    foreach ($p in @($SourceDir, $InstallDir, (Get-ScriptRoot), (Split-Path (Get-ScriptRoot) -Parent))) {
        if ($p -and (Test-Path $p)) {
            $norm = (Resolve-Path $p).Path
            if (-not $roots.Contains($norm)) { $roots.Add($norm) | Out-Null }
        }
    }
    return $roots
}

function Test-WebView2 {
    $keys = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    )
    foreach ($k in $keys) {
        try {
            $pv = Get-ItemProperty -Path $k -Name "pv" -ErrorAction SilentlyContinue
            if ($pv -and $pv.pv) { return $true }
        } catch {}
    }
    # WebView2 loader present in system.
    $loader = Join-Path ${env:ProgramFiles(x86)} "Microsoft\EdgeWebView\Application"
    return (Test-Path $loader)
}

function Get-GpuInfo {
    try {
        $out = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) {
            $parts = ($out | Select-Object -First 1).Split(",")
            $name = $parts[0].Trim()
            $vram = ($parts[1] -replace "[^0-9.]", "").Trim()
            return @{ present = $true; name = $name; vram_gb = [double]$vram }
        }
    } catch {}
    return @{ present = $false; name = "CPU only"; vram_gb = 0 }
}

function Get-DiskCandidates {
    Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -gt 0 } |
        ForEach-Object {
            [pscustomobject]@{
                Root = $_.Root
                FreeGb = [math]::Round($_.Free / 1GB, 1)
            }
        } | Sort-Object FreeGb -Descending
}

function Find-EnginePayload([string[]]$Roots) {
    foreach ($root in $Roots) {
        foreach ($rel in @("payload\ave-engine", "ave-engine", "..\payload\ave-engine", "..\ave-engine")) {
            $p = Join-Path $root $rel
            $exe = Join-Path $p "ave-engine.exe"
            if ((Test-Path $p) -and (Test-Path $exe)) {
                return (Resolve-Path $p).Path
            }
        }
    }
    return $null
}

function Test-EngineInstalled([string]$InstallDir) {
    $exe = Join-Path $InstallDir "ave-engine\ave-engine.exe"
    return (Test-Path $exe)
}

function Get-DefaultDataDir([array]$Disks) {
    $preferred = @(
        "F:\AIVideoStudio\data",
        "E:\AIVideoStudio\data",
        "D:\AIVideoStudio\data"
    )
    foreach ($p in $preferred) {
        $root = ($p -split "\\")[0] + "\"
        $drive = $Disks | Where-Object { $_.Root -eq $root } | Select-Object -First 1
        if ($drive -and $drive.FreeGb -ge 35) { return $p }
    }
    $best = $Disks | Select-Object -First 1
    if ($best) { return (Join-Path $best.Root "AIVideoStudio\data") }
    return (Join-Path $env:LOCALAPPDATA "AI Video Tool\data")
}

function Copy-TreeWithProgress([string]$Src, [string]$Dst, [string]$Label) {
    $files = Get-ChildItem -Path $Src -Recurse -File -Force
    $total = ($files | Measure-Object -Property Length -Sum).Sum
    if ($total -le 0) { throw "Empty source: $Src" }

    New-Item -ItemType Directory -Force -Path $Dst | Out-Null
    $done = [long]0
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    foreach ($f in $files) {
        $rel = $f.FullName.Substring($Src.Length).TrimStart("\")
        $target = Join-Path $Dst $rel
        $parent = Split-Path $target -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        Copy-Item -Force -Path $f.FullName -Destination $target
        $done += $f.Length
        $elapsed = [math]::Max($sw.Elapsed.TotalSeconds, 0.001)
        $rate = $done / $elapsed
        $eta = if ($rate -gt 0) { ($total - $done) / $rate } else { 0 }
        $pct = 100.0 * $done / $total
        Write-ProgressLine $Label $pct $done $total $eta
    }
    Write-Host ""
}

function Write-InstallState([string]$InstallDir, [hashtable]$State) {
    $path = Join-Path $InstallDir ".ave-install-state.json"
    $State.installed_at = (Get-Date).ToString("o")
    $State | ConvertTo-Json -Depth 6 | Set-Content -Path $path -Encoding UTF8
}

function Get-Manifest {
    $path = Join-Path (Get-ScriptRoot) "manifest.json"
    if (-not (Test-Path $path)) { return $null }
    return Get-Content $path -Raw | ConvertFrom-Json
}

function Get-EngineExe([string]$InstallDir) {
    Join-Path $InstallDir "ave-engine\ave-engine.exe"
}

function Initialize-ProcessEnvironment([System.Diagnostics.ProcessStartInfo]$Psi, [hashtable]$Extra = @{}) {
    foreach ($key in [System.Environment]::GetEnvironmentVariables("Process").Keys) {
        if (-not $Psi.Environment.ContainsKey($key)) {
            $Psi.Environment[$key] = [string][System.Environment]::GetEnvironmentVariable($key, "Process")
        }
    }
    foreach ($entry in $Extra.GetEnumerator()) {
        $Psi.Environment[$entry.Key] = [string]$entry.Value
    }
}

function Invoke-EngineCli([string]$EngineExe, [string]$DataDir, [string[]]$EngineArgs, [int]$TimeoutSec = 180) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $EngineExe
    $psi.Arguments = ($EngineArgs -join " ")
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    Initialize-ProcessEnvironment $psi @{ AVE_DATA_DIR = $DataDir; AVE_LOG_LEVEL = "error" }
    $p = [System.Diagnostics.Process]::Start($psi)
    if (-not $p.WaitForExit($TimeoutSec * 1000)) {
        try { $p.Kill() } catch {}
        throw "engine command timed out after ${TimeoutSec}s (is ave-engine.exe up to date?)"
    }
    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    return [pscustomobject]@{ ExitCode = $p.ExitCode; StdOut = $stdout; StdErr = $stderr }
}

function Get-EngineModelStatus([string]$EngineExe, [string]$DataDir) {
    $r = Invoke-EngineCli $EngineExe $DataDir @("models-status")
    if ($r.ExitCode -ne 0) { return @() }
    try { return @($r.StdOut | ConvertFrom-Json) } catch { return @() }
}

function Test-ModelEligible($ModelMeta, $Gpu, [array]$Disks) {
    $dataRoot = ($Disks | Select-Object -First 1).Root
    $freeGb = ($Disks | Where-Object { $_.Root -eq $dataRoot } | Select-Object -First 1).FreeGb
    if ($ModelMeta.min_free_gb -and $freeGb -lt $ModelMeta.min_free_gb) { return $false }
    if ($ModelMeta.min_vram_gb -and $Gpu.present -and $Gpu.vram_gb -lt $ModelMeta.min_vram_gb) { return $false }
    return $true
}

function Select-ModelsToDownload {
    param(
        [array]$Catalog,
        $Manifest,
        $Gpu,
        [array]$Disks,
        [string]$DownloadModels,
        [switch]$PostInstall,
        [switch]$Quiet
    )
    $missing = @($Catalog | Where-Object { -not $_.downloaded })
    if ($missing.Count -eq 0) { return @() }

    if ($DownloadModels -eq "all") {
        return @($missing | ForEach-Object { $_.id })
    }
    if ($DownloadModels -and $DownloadModels -ne "default") {
        return @($DownloadModels.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    $defaultMeta = @($Manifest.models | Where-Object { $_.default } | Select-Object -First 1)
    if ($DownloadModels -eq "default" -and $defaultMeta) {
        $id = $defaultMeta[0].id
        if (@($missing.id) -contains $id) { return @($id) }
        return @()
    }

    if ($Quiet) { return @() }

    Write-Host "[MODELS] Available downloads:" -ForegroundColor Yellow
    $i = 1
    $choices = @()
    foreach ($m in $missing) {
        $meta = @($Manifest.models | Where-Object { $_.id -eq $m.id } | Select-Object -First 1)
        $size = if ($meta) { "~$($meta.approx_size_gb) GB" } else { "?" }
        $ok = if ($meta) { Test-ModelEligible $meta $Gpu $Disks } else { $true }
        $flag = if ($meta -and $meta.default -and $ok) { " (recommended)" } elseif (-not $ok) { " (needs more disk/VRAM)" } else { "" }
        Write-Host ("  {0}) {1,-14} {2,8}{3}" -f $i, $m.name, $size, $flag)
        $choices += $m.id
        $i++
    }
    Write-Host "  S) Skip model downloads for now"
    Write-Host ""

    if ($PostInstall) {
        $rec = @($Manifest.models | Where-Object { $_.default } | Select-Object -First 1)
        if ($rec -and (@($missing.id) -contains $rec.id) -and (Test-ModelEligible $rec $Gpu $Disks)) {
            $prompt = "Download $($rec.name) (~$($rec.approx_size_gb) GB)? [Y/n]"
            $ans = Read-Host $prompt
            if ($ans -eq "" -or $ans -match '^[Yy]') { return @($rec.id) }
        }
        return @()
    }

    $pick = Read-Host "Choose models to download (e.g. 1 or 1,2) or S to skip"
    if ($pick -match '^[Ss]') { return @() }
    $ids = @()
    foreach ($part in ($pick -split '[,\s]+')) {
        if ($part -match '^\d+$') {
            $idx = [int]$part - 1
            if ($idx -ge 0 -and $idx -lt $choices.Count) { $ids += $choices[$idx] }
        }
    }
    return @($ids | Select-Object -Unique)
}

function Download-ModelWithProgress([string]$EngineExe, [string]$DataDir, [string]$ModelId, [string]$DisplayName) {
    Write-Host "  -> model $DisplayName ($ModelId)..." -ForegroundColor Cyan

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $EngineExe
    $psi.Arguments = "download $ModelId"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    Initialize-ProcessEnvironment $psi @{ AVE_DATA_DIR = $DataDir; AVE_LOG_LEVEL = "error" }

    $p = [System.Diagnostics.Process]::Start($psi)
    $done = [long]0
    $total = [long]1
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    while (-not $p.StandardOutput.EndOfStream) {
        $line = $p.StandardOutput.ReadLine()
        if ($line -match '^AVE_DL_PROGRESS\|([0-9.]+)\|(\d+)\|(\d+)\|(.*)$') {
            $pct = [double]$Matches[1] * 100.0
            $done = [long]$Matches[2]
            $total = [long]$Matches[3]
            if ($total -le 0) { $total = 1 }
            $elapsed = [math]::Max($sw.Elapsed.TotalSeconds, 0.001)
            $rate = $done / $elapsed
            $eta = if ($rate -gt 0) { ($total - $done) / $rate } else { 0 }
            Write-ProgressLine $ModelId $pct $done $total $eta
        } elseif ($line -match '^AVE_DL_ERROR\|(.*)$') {
            Write-Host ""
            throw $Matches[1]
        }
    }
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) {
        $err = $p.StandardError.ReadToEnd()
        throw "model download failed ($ModelId): $err"
    }
    Write-Host ""
    Write-Host ("  -> model {0}: done" -f $DisplayName) -ForegroundColor Green
}

function Install-ModelsPhase([string]$InstallDir, [string]$DataDir, $Manifest, $Gpu, [array]$Disks, [string]$DownloadModels, [switch]$PostInstall, [switch]$Quiet, [switch]$SkipModels) {
    if ($SkipModels) { return $true }

    $engineExe = Get-EngineExe $InstallDir
    if (-not (Test-Path $engineExe)) {
    Write-Host "[4/4] Models skipped - engine not installed." -ForegroundColor DarkYellow
        return $true
    }

    if (-not (Test-Path $DataDir)) {
        New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    }

    Write-Host "[4/4] AI models..." -ForegroundColor Yellow
    $catalog = Get-EngineModelStatus $engineExe $DataDir
    if ($catalog.Count -eq 0) {
        Write-Host "  Could not read model catalog from engine." -ForegroundColor Red
        return $false
    }

    $downloaded = @($catalog | Where-Object { $_.downloaded })
    foreach ($m in $downloaded) {
        Write-Host ("  [OK] {0}" -f $m.name) -ForegroundColor Green
    }

    $toGet = Select-ModelsToDownload -Catalog $catalog -Manifest $manifest -Gpu $Gpu -Disks $Disks -DownloadModels $DownloadModels -PostInstall:$PostInstall -Quiet:$Quiet
    if ($toGet.Count -eq 0) {
        Write-Host "  No models selected for download." -ForegroundColor DarkGray
        return $true
    }

    if (-not $Quiet -and -not $PostInstall) {
        Write-Host "Press Enter to start model downloads (Ctrl+C to cancel)..."
        [void][System.Console]::ReadLine()
    }

    foreach ($modelId in $toGet) {
        $meta = @($catalog | Where-Object { $_.id -eq $modelId } | Select-Object -First 1)
        $name = if ($meta) { $meta.name } else { $modelId }
        Download-ModelWithProgress $engineExe $DataDir $modelId $name
    }
    return $true
}

# --- main ---

Write-Banner

$scriptRoot = Get-ScriptRoot
$installDir = Resolve-InstallDir $InstDir
$payloadRoots = Get-PayloadRoots $installDir $Source

Write-Host "[1/4] Install location" -ForegroundColor Yellow
Write-Host "  $installDir"
Write-Host ""

Write-Host "[2/4] Scanning system..." -ForegroundColor Yellow

$manifest = Get-Manifest

$gpu = Get-GpuInfo
$disks = @(Get-DiskCandidates)
$webview2 = Test-WebView2
$engineOk = Test-EngineInstalled $installDir
$enginePayload = Find-EnginePayload $payloadRoots
$dataDir = Get-DefaultDataDir $disks
$dataParent = Split-Path $dataDir -Parent

Write-Host "  GPU:      $(if ($gpu.present) { "$($gpu.name) ($($gpu.vram_gb) GB VRAM)" } else { 'None detected (CPU mode)' })"
foreach ($d in $disks) {
    Write-Host ("  Disk {0,-4} {1,6} GB free" -f $d.Root, $d.FreeGb)
}
Write-Host "  WebView2: $(if ($webview2) { 'installed' } else { 'MISSING' })"
Write-Host "  Engine:   $(if ($engineOk) { 'installed' } else { 'MISSING' })"
Write-Host "  Data dir: $dataDir"
if ($enginePayload) {
    Write-Host "  Payload:  $enginePayload" -ForegroundColor DarkGray
} else {
    Write-Host "  Payload:  not found (place ave-engine next to install.exe or in payload\)" -ForegroundColor DarkYellow
}
Write-Host ""

$plan = New-Object System.Collections.Generic.List[object]

if (-not $engineOk) {
    if ($enginePayload) {
        $size = (Get-ChildItem $enginePayload -Recurse -File | Measure-Object Length -Sum).Sum
        $plan.Add([pscustomobject]@{ id = "engine"; action = "copy"; src = $enginePayload; dst = (Join-Path $installDir "ave-engine"); bytes = $size }) | Out-Null
    } else {
        $plan.Add([pscustomobject]@{ id = "engine"; action = "missing"; src = $null; dst = (Join-Path $installDir "ave-engine"); bytes = 0 }) | Out-Null
    }
}

if (-not $webview2) {
    $plan.Add([pscustomobject]@{ id = "webview2"; action = "manual"; src = $null; dst = $null; bytes = 0 }) | Out-Null
}

if (-not (Test-Path $dataDir)) {
    $plan.Add([pscustomobject]@{ id = "data_dir"; action = "mkdir"; src = $null; dst = $dataDir; bytes = 0 }) | Out-Null
}

Write-Host "[PLAN] Components:" -ForegroundColor Yellow
foreach ($item in $plan) {
    switch ($item.action) {
        "copy"   { Write-Host ("  [INSTALL] {0,-12} {1} -> {2}" -f $item.id, (Format-Bytes $item.bytes), $item.dst) }
        "mkdir"  { Write-Host ("  [CREATE ] {0,-12} {1}" -f $item.id, $item.dst) }
        "manual" { Write-Host ("  [MANUAL ] {0,-12} install WebView2 from Microsoft" -f $item.id) -ForegroundColor Red }
        "missing" { Write-Host ("  [MISSING] {0,-12} no payload found - copy payload\ave-engine\ beside install.exe" -f $item.id) -ForegroundColor Red }
        default  { Write-Host ("  [SKIP   ] {0}" -f $item.id) }
    }
}
if ($plan.Count -eq 0) {
    Write-Host "  All required components already installed." -ForegroundColor Green
}
Write-Host ""

$blocked = $plan | Where-Object { $_.action -in @("missing", "manual") }
if ($blocked) {
    Write-Host "Cannot continue until manual items are resolved." -ForegroundColor Red
    if (-not $PostInstall) { exit 2 }
    if ($plan | Where-Object { $_.action -eq "copy" }) {
        Write-Host "Installing available components anyway..." -ForegroundColor Yellow
    } else {
        exit 2
    }
}

if ($plan.Count -gt 0) {
    if (-not $Quiet -and -not $PostInstall) {
        Write-Host "Press Enter to start installation (Ctrl+C to cancel)..."
        [void][System.Console]::ReadLine()
    }

    Write-Host "[3/4] Installing components..." -ForegroundColor Yellow
    foreach ($item in $plan) {
        switch ($item.action) {
            "copy" {
                Write-Host "  -> $($item.id): copying..." -ForegroundColor Cyan
                if (Test-Path $item.dst) { Remove-Item -Recurse -Force $item.dst }
                Copy-TreeWithProgress $item.src $item.dst $item.id
                Write-Host "  -> $($item.id): done" -ForegroundColor Green
            }
            "mkdir" {
                New-Item -ItemType Directory -Force -Path $item.dst | Out-Null
                $readme = Join-Path $item.dst "README.txt"
                @"
AI Video Tool data folder.
Models download here on first use from the Models tab.
Set AVE_DATA_DIR=$($item.dst) to override.
"@ | Set-Content -Path $readme -Encoding UTF8
                Write-Host "  -> $($item.id): created $($item.dst)" -ForegroundColor Green
            }
        }
    }
} else {
    Write-Host "[3/4] Components already installed - skipping." -ForegroundColor DarkGray
}

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}

$engineOk = Test-EngineInstalled $installDir
$fail = $false

if ($engineOk -and $manifest) {
    try {
        $null = Install-ModelsPhase $installDir $dataDir $manifest $gpu $disks $DownloadModels -PostInstall:$PostInstall -Quiet:$Quiet -SkipModels:$SkipModels
    } catch {
        Write-Host "  Model download failed: $_" -ForegroundColor Red
        $fail = $true
    }
} elseif (-not $SkipModels) {
    Write-Host "[4/4] Models skipped - install engine first." -ForegroundColor DarkYellow
}

Write-InstallState $installDir @{
    engine = $engineOk
    data_dir = $dataDir
    webview2 = $webview2
    gpu = $gpu
}

Write-Host ""
if ($engineOk -and -not $fail) {
    Write-Host "Setup complete. AI Video Tool is ready." -ForegroundColor Green
} elseif (-not $engineOk) {
    Write-Host "Setup incomplete - engine still missing." -ForegroundColor Red
    $fail = $true
} elseif ($fail) {
    Write-Host "Setup finished with model download errors." -ForegroundColor Red
}

if (-not $SkipLaunch -and $engineOk -and -not $fail -and -not $Quiet) {
    $app = Join-Path $installDir "ai-video-tool.exe"
    if (Test-Path $app) {
        Write-Host "Launching AI Video Tool..."
        Start-Process -FilePath $app -Environment @{ AVE_DATA_DIR = $dataDir }
    }
}

if ($fail) { exit 1 }
exit 0
