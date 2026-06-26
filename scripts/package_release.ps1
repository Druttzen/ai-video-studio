# Package release artifacts for distribution.
#
# Layout:
#   release/install.exe          - phase 1: installs main app (~3 MB)
#   release/setup.cmd            - re-run component setup anytime
#   release/ai-video-tool.exe    - portable app binary
#   release/payload/ave-engine/  - phase 3 payload (copied by setup after scan)
#
# Run install.exe from this folder so setup finds payload\ave-engine automatically.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$payload = Join-Path $release "payload"
$tauriOut = Join-Path $root "app\src-tauri\target\release"
$nsisDir = Join-Path $tauriOut "bundle\nsis"

$appExe = Join-Path $tauriOut "ai-video-tool.exe"
if (-not (Test-Path $appExe)) { throw "Missing $appExe - run tauri build first" }

$engineSrc = Join-Path $root "app\src-tauri\binaries\ave-engine"
if (-not (Test-Path $engineSrc)) { throw "Missing engine bundle - run build_engine.ps1 first" }

New-Item -ItemType Directory -Force -Path $release | Out-Null
# Clean stale artifacts from older portable-only layouts.
$staleEngine = Join-Path $release "ave-engine"
if (Test-Path $staleEngine) { Remove-Item -Recurse -Force $staleEngine }

New-Item -ItemType Directory -Force -Path $payload | Out-Null

Copy-Item -Force $appExe (Join-Path $release "ai-video-tool.exe")

$installerSrc = Join-Path $root "installer"
Copy-Item -Force (Join-Path $installerSrc "ave-setup.cmd") (Join-Path $release "setup.cmd")
Copy-Item -Force (Join-Path $installerSrc "ave-setup.ps1") (Join-Path $release "ave-setup.ps1")
Copy-Item -Force (Join-Path $installerSrc "ave-uninstall.cmd") (Join-Path $release "uninstall.cmd")
Copy-Item -Force (Join-Path $installerSrc "ave-uninstall.ps1") (Join-Path $release "ave-uninstall.ps1")
Copy-Item -Force (Join-Path $installerSrc "manifest.json") (Join-Path $release "manifest.json")

$engineDst = Join-Path $payload "ave-engine"
if (Test-Path $engineDst) { Remove-Item -Recurse -Force $engineDst }
Copy-Item -Recurse -Force $engineSrc $engineDst

$installer = Get-ChildItem -Path $nsisDir -Filter "*setup.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
    Copy-Item -Force $installer.FullName (Join-Path $release "install.exe")
}

Write-Host "=== Release package ==="
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
Write-Host "Install flow:"
Write-Host "  1. Run release\install.exe  (installs ai-video-tool.exe)"
Write-Host "  2. Setup scans GPU, disk, WebView2, missing components"
Write-Host "  3. CMD window copies payload\ave-engine\ next to the installed exe"
Write-Host "  4. Optional: download AI models (live progress + ETA)"
Write-Host ""
Write-Host "Portable: run release\ai-video-tool.exe then release\setup.cmd"
Write-Host "Auto-download default model: setup.cmd --DownloadModels default"
Write-Host "Uninstall: Windows Settings > Apps, or run uninstall.cmd from the install folder"
Write-Host "Re-run setup anytime: release\setup.cmd --inst-dir `"<install path>`""
