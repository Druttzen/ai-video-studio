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
    [switch]$SkipModels,
    [switch]$ScanOnly,
    [switch]$EmitJson
)

$ErrorActionPreference = "Stop"
$script:EmitJson = [bool]$EmitJson

function Write-SetupLog([string]$Message) {
    if ($script:EmitJson) {
        Write-Output ("AVE_SETUP_LOG|$Message")
    } else {
        Write-Host $Message
    }
}

function Estimate-EtaMinutes([long]$Bytes) {
    if ($Bytes -le 0) { return 1 }
    $rate = 40MB
    return [math]::Max(1, [math]::Ceiling($Bytes / $rate / 60))
}

function Get-PlanItemLabel($Item) {
    switch ($Item.action) {
        "copy" { return "Copy AI engine" }
        "download" { return "Download AI engine" }
        "webview2_install" { return "Install WebView2 runtime" }
        "mkdir" { return "Create data folder" }
        "missing" { return "AI engine (missing)" }
        default { return $Item.id }
    }
}

function Export-SetupScanJson {
    param(
        $Gpu,
        [array]$Disks,
        [bool]$WebView2,
        [string]$DataDir,
        [bool]$EngineOk,
        $Plan,
        $Manifest,
        [string]$DownloadModels
    )
    $items = @()
    $totalBytes = [long]0
    foreach ($item in $Plan) {
        $bytes = if ($item.bytes) { [long]$item.bytes } else { 0 }
        if ($item.action -eq "webview2_install") { $bytes = 150MB }
        $items += @{
            id = $item.id
            action = $item.action
            label = Get-PlanItemLabel $item
            bytes = $bytes
            eta_minutes = (Estimate-EtaMinutes $bytes)
        }
        $totalBytes += $bytes
    }

    $models = @()
    if ($Manifest -and $Manifest.models -and (-not $EngineOk)) {
        foreach ($meta in $Manifest.models) {
            $bytes = [long]($meta.approx_size_gb * 1GB)
            $eligible = Test-ModelEligible $meta $Gpu $Disks
            $auto = $false
            if ($eligible -and $meta.default -and ($DownloadModels -eq "default" -or -not $DownloadModels)) {
                $auto = $true
            }
            $models += @{
                id = $meta.id
                name = $meta.name
                bytes = $bytes
                eta_minutes = (Estimate-EtaMinutes $bytes)
                eligible = $eligible
                auto_download = $auto
            }
            if ($auto) { $totalBytes += $bytes }
        }
    }

    $blocked = @($Plan | Where-Object { $_.action -in @("missing", "manual") })
    $scan = @{
        hardware = @{
            gpu_present = [bool]$Gpu.present
            gpu_name = $Gpu.name
            vram_gb = $Gpu.vram_gb
            webview2 = $WebView2
            data_dir = $DataDir
            disks = @($Disks | ForEach-Object { @{ root = $_.Root; free_gb = $_.FreeGb } })
        }
        engine_installed = $EngineOk
        items = $items
        models = $models
        total_bytes = $totalBytes
        eta_minutes = (Estimate-EtaMinutes $totalBytes)
        can_run = ($blocked.Count -eq 0) -or ($Plan | Where-Object { $_.action -in @("copy", "download", "webview2_install", "mkdir") }).Count -gt 0
        blocked = @($blocked | ForEach-Object { $_.id })
    }
    Write-Output ("AVE_SETUP_JSON|" + ($scan | ConvertTo-Json -Compress -Depth 8))
}

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
    if ($script:EmitJson) {
        Write-Output ("AVE_SETUP_PROGRESS|$Label|$Pct|$Done|$Total|$EtaSec|")
        return
    }
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
    if ($Explicit) {
        try {
            if (Test-Path -LiteralPath $Explicit) {
                return (Resolve-Path -LiteralPath $Explicit).Path
            }
        } catch {}
        return [System.IO.Path]::GetFullPath($Explicit)
    }

    if ($env:AVE_INSTALL_DIR -and (Test-Path -LiteralPath $env:AVE_INSTALL_DIR)) {
        return (Resolve-Path -LiteralPath $env:AVE_INSTALL_DIR).Path
    }

    foreach ($cand in @(
        (Join-Path (Get-Location) "ai-video-tool.exe"),
        (Join-Path $env:LOCALAPPDATA "AI Video Tool\ai-video-tool.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\AI Video Tool\ai-video-tool.exe"),
        (Join-Path $env:ProgramFiles "AI Video Tool\ai-video-tool.exe")
    )) {
        if (Test-Path -LiteralPath $cand) { return (Split-Path -LiteralPath $cand -Parent) }
    }
    return (Get-Location).Path
}

function Get-PayloadRoots([string]$InstallDir, [string]$SourceDir) {
    $roots = New-Object System.Collections.Generic.List[string]
    foreach ($p in @($SourceDir, $InstallDir, (Get-ScriptRoot), (Split-Path (Get-ScriptRoot) -Parent))) {
        if (-not $p) { continue }
        try {
            if (Test-Path -LiteralPath $p) {
                $norm = (Resolve-Path -LiteralPath $p).Path
                if (-not $roots.Contains($norm)) { $roots.Add($norm) | Out-Null }
            }
        } catch {}
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
            $rawVram = $parts[1].Trim()
            $vramNum = [double](($rawVram -replace "[^0-9.]", "").Trim())
            if ($rawVram -match 'MiB' -and $vramNum -gt 64) {
                $vramNum = [math]::Round($vramNum / 1024, 1)
            }
            return @{ present = $true; name = $name; vram_gb = $vramNum }
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

function Get-DefaultDataDir([string]$InstallDir, [array]$Disks) {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:LOCALAPPDATA) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA "AI Video Tool\data")) | Out-Null
    }
    if ($InstallDir) { $candidates.Add((Join-Path $InstallDir "data")) | Out-Null }
    foreach ($cand in $candidates) {
        if ($cand -match '^([A-Za-z]:\\)') {
            $root = $Matches[1]
            $d = $Disks | Where-Object { $_.Root -eq $root } | Select-Object -First 1
            if ($d -and $d.FreeGb -ge 15) { return $cand }
        }
    }
    $best = $Disks | Sort-Object FreeGb -Descending | Select-Object -First 1
    if ($best) {
        return Join-Path $best.Root "AI Video Tool\data"
    }
    if ($candidates.Count -gt 0) { return $candidates[0] }
    return (Join-Path $env:USERPROFILE "AI Video Tool\data")
}

function Ensure-SevenZipReady {
    if (Get-SevenZipExe) { return }
    $tools = Join-Path (Get-ScriptRoot) "tools"
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    $dest = Join-Path $tools "7zr.exe"
    Write-Host "  -> 7zr: downloading extractor..." -ForegroundColor Cyan
    Download-FileWithProgress -Url "https://www.7-zip.org/a/7zr.exe" -Destination $dest -Label "7zr" -ApproxTotal 600000
    if (-not (Test-Path $dest)) { throw "Failed to download 7zr.exe" }
}

function Get-SevenZipExe {
    foreach ($p in @(
        (Join-Path (Get-ScriptRoot) "tools\7zr.exe"),
        (Join-Path (Get-ScriptRoot) "tools\7z.exe"),
        "${env:ProgramFiles}\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
    )) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

function Get-EngineDownloadSpec($Manifest) {
    if (-not $Manifest -or -not $Manifest.release) { return $null }
    $rel = $Manifest.release
    $dl = $rel.downloads.engine_win64
    if (-not $dl) { return $null }
    $tag = if ($rel.engine_tag) { $rel.engine_tag } elseif ($rel.tag) { $rel.tag } else { $null }
    $repo = $rel.github_repo
    $url = if ($dl.url) { $dl.url } elseif ($tag -and $repo) {
        "https://github.com/$repo/releases/download/$tag/$($dl.filename)"
    } else { $null }
    if (-not $url) { return $null }
    return [pscustomobject]@{
        url = $url
        archive = if ($dl.archive) { $dl.archive } else { "7z" }
        folder = if ($dl.folder) { $dl.folder } else { "ave-engine" }
        approx_bytes = if ($dl.approx_size_gb) { [long]($dl.approx_size_gb * 1GB) } else { 0 }
        sha256 = if ($dl.sha256) { $dl.sha256.ToLower() } else { "" }
    }
}

function Download-FileWithProgress {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$Destination,
        [string]$Label = "download",
        [long]$ApproxTotal = 0
    )
    $parent = Split-Path $Destination -Parent
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    if (Test-Path $Destination) { Remove-Item -Force $Destination }

    Write-Host "  -> $Label from $Url" -ForegroundColor DarkGray
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.UserAgent = "AI-Video-Tool-Setup/1.0"
    $request.Timeout = 6 * 60 * 60 * 1000
    $response = $request.GetResponse()
    try {
        $total = [long]$response.ContentLength
        if ($total -le 0) { $total = if ($ApproxTotal -gt 0) { $ApproxTotal } else { 1 } }
        $stream = $response.GetResponseStream()
        $fs = [System.IO.File]::Create($Destination)
        try {
            $buffer = New-Object byte[] 1048576
            $done = [long]0
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            while ($true) {
                $read = $stream.Read($buffer, 0, $buffer.Length)
                if ($read -le 0) { break }
                $fs.Write($buffer, 0, $read)
                $done += $read
                $elapsed = [math]::Max($sw.Elapsed.TotalSeconds, 0.001)
                $rate = $done / $elapsed
                $eta = if ($rate -gt 0 -and $total -gt 1) { ($total - $done) / $rate } else { 0 }
                $pct = 100.0 * $done / $total
                Write-ProgressLine $Label $pct $done $total $eta
            }
        } finally {
            $fs.Close()
            $stream.Close()
        }
    } finally {
        $response.Close()
    }
    Write-Host ""
}

function Expand-EngineArchive {
    param(
        [Parameter(Mandatory)][string]$ArchivePath,
        [Parameter(Mandatory)][string]$DestDir,
        [Parameter(Mandatory)][string]$ArchiveType,
        [string]$InnerFolder = "ave-engine"
    )
    if (Test-Path $DestDir) { Remove-Item -Recurse -Force $DestDir }
    $temp = Join-Path $env:TEMP ("ave-engine-extract-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    try {
        switch ($ArchiveType) {
            "7z" {
                Ensure-SevenZipReady
                $seven = Get-SevenZipExe
                if (-not $seven) {
                    throw "7-Zip is required to extract the engine. Install from https://www.7-zip.org/ and re-run setup."
                }
                & $seven x ("-o" + $temp) "-y" $ArchivePath | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "7z extract failed (exit $LASTEXITCODE)" }
            }
            "zip" {
                Expand-Archive -Path $ArchivePath -DestinationPath $temp -Force
            }
            default { throw "Unknown archive type: $ArchiveType" }
        }
        $inner = Join-Path $temp $InnerFolder
        if (Test-Path $inner) {
            Move-Item -Force $inner $DestDir
        } elseif (Test-Path (Join-Path $temp "ave-engine.exe")) {
            Move-Item -Force $temp $DestDir
        } else {
            $sub = Get-ChildItem $temp -Directory | Select-Object -First 1
            if ($sub) { Move-Item -Force $sub.FullName $DestDir }
            else { throw "Archive did not contain expected engine folder" }
        }
    } finally {
        if (Test-Path $temp) { Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue }
    }
}

function Install-WebView2Bootstrapper($Manifest) {
    $spec = $null
    if ($Manifest -and $Manifest.release -and $Manifest.release.downloads) {
        $spec = $Manifest.release.downloads.webview2_bootstrapper
    }
    if (-not $spec) {
        $spec = @{
            url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
            filename = "MicrosoftEdgeWebView2RuntimeInstaller.exe"
        }
    }
    $cache = Join-Path $env:TEMP "ave-webview2"
    New-Item -ItemType Directory -Force -Path $cache | Out-Null
    $installer = Join-Path $cache $spec.filename
    Download-FileWithProgress -Url $spec.url -Destination $installer -Label "webview2" -ApproxTotal 150000000
    Write-Host "  -> webview2: installing runtime (silent)..." -ForegroundColor Cyan
    $p = Start-Process -FilePath $installer -ArgumentList "/silent", "/install" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
        throw "WebView2 installer exited with code $($p.ExitCode)"
    }
    if (-not (Test-WebView2)) {
        throw "WebView2 still not detected after install"
    }
    Write-Host "  -> webview2: done" -ForegroundColor Green
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

    if ($PostInstall -and ($DownloadModels -eq "default" -or -not $DownloadModels)) {
        foreach ($meta in $Manifest.models) {
            if (-not (Test-ModelEligible $meta $Gpu $Disks)) { continue }
            if (@($missing.id) -contains $meta.id) {
                if ($meta.default) {
                    Write-Host "  Auto-selected $($meta.name) for this hardware." -ForegroundColor DarkGray
                    return @($meta.id)
                }
            }
        }
        foreach ($meta in $Manifest.models) {
            if (-not (Test-ModelEligible $meta $Gpu $Disks)) { continue }
            if (@($missing.id) -contains $meta.id) {
                Write-Host "  Auto-selected $($meta.name) for this hardware." -ForegroundColor DarkGray
                return @($meta.id)
            }
        }
        Write-Host "  No models fit this GPU/disk yet - use the Models tab after launch." -ForegroundColor Yellow
        return @()
    }

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

    if (-not $Quiet -and -not $PostInstall -and -not $script:EmitJson) {
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

if (-not $ScanOnly) { Write-Banner }

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
$engineDownload = if (-not $enginePayload) { Get-EngineDownloadSpec $manifest } else { $null }
$dataDir = Get-DefaultDataDir $installDir $disks
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
} elseif ($engineDownload) {
    Write-Host "  Payload:  online ($($engineDownload.url))" -ForegroundColor DarkGray
} else {
    Write-Host "  Payload:  not found (local or online)" -ForegroundColor DarkYellow
}
Write-Host ""

$plan = New-Object System.Collections.Generic.List[object]

if (-not $engineOk) {
    if ($enginePayload) {
        $size = (Get-ChildItem $enginePayload -Recurse -File | Measure-Object Length -Sum).Sum
        $plan.Add([pscustomobject]@{ id = "engine"; action = "copy"; src = $enginePayload; dst = (Join-Path $installDir "ave-engine"); bytes = $size }) | Out-Null
    } elseif ($engineDownload) {
        $plan.Add([pscustomobject]@{
            id = "engine"; action = "download"; src = $engineDownload.url; dst = (Join-Path $installDir "ave-engine")
            bytes = $engineDownload.approx_bytes; archive = $engineDownload.archive
            folder = $engineDownload.folder; sha256 = $engineDownload.sha256
        }) | Out-Null
    } else {
        $plan.Add([pscustomobject]@{ id = "engine"; action = "missing"; src = $null; dst = (Join-Path $installDir "ave-engine"); bytes = 0 }) | Out-Null
    }
}

if (-not $webview2) {
    $plan.Add([pscustomobject]@{ id = "webview2"; action = "webview2_install"; src = $null; dst = $null; bytes = 0 }) | Out-Null
}

if (-not (Test-Path $dataDir)) {
    $plan.Add([pscustomobject]@{ id = "data_dir"; action = "mkdir"; src = $null; dst = $dataDir; bytes = 0 }) | Out-Null
}

Write-Host "[PLAN] Components:" -ForegroundColor Yellow
foreach ($item in $plan) {
    switch ($item.action) {
        "copy"   { Write-Host ("  [INSTALL] {0,-12} {1} -> {2}" -f $item.id, (Format-Bytes $item.bytes), $item.dst) }
        "download" { Write-Host ("  [DOWNLOAD]{0,-12} ~{1} from GitHub" -f $item.id, (Format-Bytes $item.bytes)) }
        "mkdir"  { Write-Host ("  [CREATE ] {0,-12} {1}" -f $item.id, $item.dst) }
        "webview2_install" { Write-Host ("  [INSTALL] {0,-12} download + silent install" -f $item.id) }
        "manual" { Write-Host ("  [MANUAL ] {0,-12} install WebView2 from Microsoft" -f $item.id) -ForegroundColor Red }
        "missing" { Write-Host ("  [MISSING] {0,-12} no payload found - copy payload\ave-engine\ beside install.exe" -f $item.id) -ForegroundColor Red }
        default  { Write-Host ("  [SKIP   ] {0}" -f $item.id) }
    }
}
if ($plan.Count -eq 0) {
    Write-Host "  All required components already installed." -ForegroundColor Green
}
Write-Host ""

if ($ScanOnly) {
    Export-SetupScanJson -Gpu $gpu -Disks $disks -WebView2 $webview2 -DataDir $dataDir `
        -EngineOk $engineOk -Plan $plan -Manifest $manifest -DownloadModels $DownloadModels
    exit 0
}

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
    if (-not $Quiet -and -not $PostInstall -and -not $script:EmitJson) {
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
            "download" {
                Write-Host "  -> $($item.id): downloading..." -ForegroundColor Cyan
                $cache = Join-Path $env:TEMP "ave-setup-cache"
                New-Item -ItemType Directory -Force -Path $cache | Out-Null
                $archivePath = Join-Path $cache ("engine-" + [guid]::NewGuid().ToString("N") + "." + $item.archive)
                try {
                    Download-FileWithProgress -Url $item.src -Destination $archivePath -Label $item.id -ApproxTotal $item.bytes
                    if ($item.sha256) {
                        $hash = (Get-FileHash $archivePath -Algorithm SHA256).Hash.ToLower()
                        if ($hash -ne $item.sha256) {
                            throw "SHA256 mismatch for engine download (expected $($item.sha256), got $hash)"
                        }
                    }
                    Expand-EngineArchive -ArchivePath $archivePath -DestDir $item.dst -ArchiveType $item.archive -InnerFolder $item.folder
                    Write-Host "  -> $($item.id): done" -ForegroundColor Green
                } finally {
                    if (Test-Path $archivePath) { Remove-Item -Force $archivePath -ErrorAction SilentlyContinue }
                }
            }
            "webview2_install" {
                Install-WebView2Bootstrapper $manifest
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
        Write-Host "  Open the Models tab after launch to retry." -ForegroundColor Yellow
        if (-not $PostInstall) { $fail = $true }
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

if (-not $SkipLaunch -and $engineOk -and -not $Quiet) {
    $app = Join-Path $installDir "ai-video-tool.exe"
    if (Test-Path $app) {
        Write-Host "Launching AI Video Tool..."
        Start-Process -FilePath $app -Environment @{ AVE_DATA_DIR = $dataDir }
    }
}

if ($fail) { exit 1 }
exit 0
