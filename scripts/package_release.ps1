# Package release artifacts for distribution.
#
# Modes:
#   (default)  Full offline bundle with payload\ave-engine\ + standalone ZIP/SFX
#   -Minimal    GitHub-sized release (~15 MB): install.exe only; setup downloads engine online
#
# Minimal layout:
#   release/install.exe
#   release/DjMAD-AI-Video-Tool-Setup-{version}.exe
#   release/setup.cmd, manifest.json, README-INSTALL.txt

param([switch]$Minimal)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$payload = Join-Path $release "payload"
$tauriOut = Join-Path $root "app\src-tauri\target\release"
$nsisDir = Join-Path $tauriOut "bundle\nsis"
$tauriConf = Join-Path $root "app\src-tauri\tauri.conf.json"
$appVersion = (Get-Content $tauriConf -Raw | ConvertFrom-Json).version

$appExe = Join-Path $tauriOut "ai-video-tool.exe"
if (-not (Test-Path $appExe)) { throw "Missing $appExe - run tauri build first" }

$engineSrc = Join-Path $root "app\src-tauri\binaries\ave-engine"
if (-not $Minimal -and -not (Test-Path $engineSrc)) {
    throw "Missing engine bundle - run build_engine.ps1 first (or use -Minimal)"
}

New-Item -ItemType Directory -Force -Path $release | Out-Null
$staleEngine = Join-Path $release "ave-engine"
if (Test-Path $staleEngine) { Remove-Item -Recurse -Force $staleEngine }

$installerSrc = Join-Path $root "installer"
Copy-Item -Force $appExe (Join-Path $release "ai-video-tool.exe")
Copy-Item -Force (Join-Path $installerSrc "ave-setup.cmd") (Join-Path $release "setup.cmd")
Copy-Item -Force (Join-Path $installerSrc "ave-setup.ps1") (Join-Path $release "ave-setup.ps1")
Copy-Item -Force (Join-Path $installerSrc "ave-uninstall.cmd") (Join-Path $release "uninstall.cmd")
Copy-Item -Force (Join-Path $installerSrc "ave-uninstall.ps1") (Join-Path $release "ave-uninstall.ps1")
Copy-Item -Force (Join-Path $installerSrc "manifest.json") (Join-Path $release "manifest.json")

if ($Minimal) {
    if (Test-Path $payload) { Remove-Item -Recurse -Force $payload }
} else {
    New-Item -ItemType Directory -Force -Path $payload | Out-Null
    $engineDst = Join-Path $payload "ave-engine"
    if (Test-Path $engineDst) { Remove-Item -Recurse -Force $engineDst }
    Copy-Item -Recurse -Force $engineSrc $engineDst
}

$installer = Get-ChildItem -Path $nsisDir -Filter "*setup.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
    Copy-Item -Force $installer.FullName (Join-Path $release "install.exe")
    $primary = Join-Path $release "AI-Video-Tool-Setup-$appVersion.exe"
    Copy-Item -Force $installer.FullName $primary
    $branded = Join-Path $release "DjMAD-AI-Video-Tool-Setup-$appVersion.exe"
    Copy-Item -Force $installer.FullName $branded
}

$readmeTpl = Join-Path $installerSrc "README-INSTALL.txt"
if (Test-Path $readmeTpl) {
    (Get-Content $readmeTpl -Raw).Replace("{{VERSION}}", $appVersion) |
        Set-Content -Encoding UTF8 (Join-Path $release "README-INSTALL.txt")
}

Write-Host "=== Release package $(if ($Minimal) { '(minimal / GitHub)' } else { '(full offline)' }) ==="
Get-ChildItem $release | ForEach-Object {
    if ($_.PSIsContainer) {
        $gb = [math]::Round((Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum / 1GB, 2)
        Write-Host "  $($_.Name)/  ($gb GB)"
    } else {
        $mb = [math]::Round($_.Length / 1MB, 1)
        Write-Host "  $($_.Name)  ($mb MB)"
    }
}

Write-Host ""
if ($Minimal) {
    Write-Host "GitHub install flow:"
    Write-Host "  1. Upload AI-Video-Tool-Setup-$appVersion.exe (~3 MB) - single file for all users"
    Write-Host "  2. Engine asset ave-engine-win64.7z on GitHub release (engine_tag in manifest.json)"
    Write-Host "  3. User runs Setup -> console downloads engine + best-fit model with progress bars"
} else {
    Write-Host "Offline install flow:"
    Write-Host "  1. Run release\install.exe (or standalone SFX/ZIP)"
    Write-Host "  2. Setup copies payload\ave-engine\ with progress bars"
    Write-Host "  3. Optional model download"
    Write-Host ""
    & (Join-Path $PSScriptRoot "package_standalone.ps1")
}
