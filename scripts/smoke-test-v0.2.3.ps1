# Smoke tests for v0.2.3 release test plan.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$setupPs1 = Join-Path $root "installer\ave-setup.ps1"
$releaseExe = Join-Path $root "app\src-tauri\target\release\ai-video-tool.exe"
$installDir = Split-Path $releaseExe -Parent

$results = New-Object System.Collections.Generic.List[object]

function Pass([string]$name, [string]$detail = "") {
    $results.Add([pscustomobject]@{ test = $name; status = "PASS"; detail = $detail }) | Out-Null
}
function Fail([string]$name, [string]$detail) {
    $results.Add([pscustomobject]@{ test = $name; status = "FAIL"; detail = $detail }) | Out-Null
}
function Skip([string]$name, [string]$detail) {
    $results.Add([pscustomobject]@{ test = $name; status = "SKIP"; detail = $detail }) | Out-Null
}

# --- 1 & 2: setup scan (fresh install state) ---
$engineBeside = Test-Path (Join-Path $installDir "ave-engine\ave-engine.exe")
if ($engineBeside) {
    Fail "fresh-install-state" "ave-engine already beside release exe - remove for true fresh test"
} else {
    Pass "fresh-install-state" "No local engine beside release build (app should show setup console)"
}

$scanLine = & powershell -NoProfile -ExecutionPolicy Bypass -File $setupPs1 -ScanOnly -EmitJson -InstDir $installDir -DownloadModels default 2>&1 |
    Where-Object { $_ -match '^AVE_SETUP_JSON\|' } | Select-Object -First 1
if (-not $scanLine) {
    Fail "hardware-scan" "setup scan produced no AVE_SETUP_JSON"
} else {
    $json = ($scanLine -replace '^AVE_SETUP_JSON\|', '') | ConvertFrom-Json
    if ($json.engine_installed) {
        Fail "hardware-scan" "scan reports engine_installed=true unexpectedly"
    } elseif (-not $json.can_run) {
        Fail "hardware-scan" "scan blocked: $($json.blocked -join ', ')"
    } elseif ($json.items.Count -lt 1) {
        Fail "install-plan" "no install items in scan"
    } else {
        $gpu = $json.hardware.gpu_name
        $items = ($json.items | ForEach-Object { $_.label }) -join "; "
        if ($json.hardware.vram_gb -gt 200) {
            Fail "hardware-scan" "VRAM looks wrong: $($json.hardware.vram_gb) GB (MiB not converted?)"
        } else {
            Pass "hardware-scan" "GPU=$gpu; VRAM=$($json.hardware.vram_gb) GB; WebView2=$($json.hardware.webview2)"
        }
        Pass "install-plan" "Items: $items; total ~$([math]::Round($json.total_bytes/1GB,1)) GB; ETA ~$($json.eta_minutes) min"
    }
}

# --- 3: progress events (short download probe) ---
try {
    $probeUrl = "https://www.7-zip.org/a/7zr.exe"
    $probeDest = Join-Path $env:TEMP "ave-progress-probe.exe"
    $request = [System.Net.HttpWebRequest]::Create($probeUrl)
    $request.UserAgent = "AI-Video-Tool-Setup/1.0"
    $response = $request.GetResponse()
    $total = [long]$response.ContentLength
    $stream = $response.GetResponseStream()
    $fs = [System.IO.File]::Create($probeDest)
    $buf = New-Object byte[] 65536
    $done = 0L
    $pct = 0.0
    while ($done -lt [math]::Min($total, 200000)) {
        $read = $stream.Read($buf, 0, $buf.Length)
        if ($read -le 0) { break }
        $fs.Write($buf, 0, $read)
        $done += $read
        $pct = 100.0 * $done / $total
    }
    $fs.Close(); $stream.Close(); $response.Close()
    if ($pct -gt 0) {
        Pass "progress-math" "Download progress logic OK (probe reached $([math]::Round($pct,1))%)"
    } else {
        Fail "progress-math" "probe download did not advance"
    }
    Remove-Item $probeDest -Force -ErrorAction SilentlyContinue
} catch {
    Skip "progress-math" "network probe skipped: $_"
}

# --- 4: update check ---
try {
    $latest = (Invoke-RestMethod -Uri "https://api.github.com/repos/Druttzen/ai-video-studio/releases/latest" -Headers @{ "User-Agent" = "AI-Video-Tool" }).tag_name.TrimStart('v')
    $current = (Get-Content (Join-Path $root "app\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version
    $parse = { param($s) ($s -split '\.' | ForEach-Object { [int]$_ }) }
    $la = & $parse $latest
    $cu = & $parse $current
    $gt = $false
    for ($i = 0; $i -lt 3; $i++) {
        $a = if ($i -lt $la.Count) { $la[$i] } else { 0 }
        $b = if ($i -lt $cu.Count) { $cu[$i] } else { 0 }
        if ($a -gt $b) { $gt = $true; break }
        if ($a -lt $b) { break }
    }
    if ($current -eq $latest -and -not $gt) {
        Pass "update-hidden-on-latest" "current=$current latest=$latest - no update button"
    } else {
        Fail "update-hidden-on-latest" "current=$current latest=$latest gt=$gt"
    }
    if ($gt) {
        Pass "update-visible-on-older" "latest $latest > current $current"
    } else {
        # simulate older
        $old = "0.2.2"
        $ou = & $parse $old
        $gtOld = $false
        for ($i = 0; $i -lt 3; $i++) {
            $a = if ($i -lt $la.Count) { $la[$i] } else { 0 }
            $b = if ($i -lt $ou.Count) { $ou[$i] } else { 0 }
            if ($a -gt $b) { $gtOld = $true; break }
            if ($a -lt $b) { break }
        }
        if ($gtOld) { Pass "update-visible-on-older" "v$old would see update to v$latest" }
        else { Fail "update-visible-on-older" "version compare failed for $old vs $latest" }
    }
} catch {
    Fail "update-check" $_
}

Write-Host ""
Write-Host "=== v0.2.3 test plan results ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$failed = @($results | Where-Object { $_.status -eq "FAIL" })
if ($failed.Count -gt 0) { exit 1 }
exit 0
