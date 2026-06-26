# Full production build: package the engine, build Tauri, copy release artifacts.
#
# Output:
#   release/ai-video-tool.exe   - standalone app
#   release/install.exe         - NSIS installer
#
#   $env:AVE_PYTHON = "C:\path\python.exe"
#   ./scripts/build.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$skipEngine = $args -contains "-SkipEngine"

if (-not $env:AVE_PYTHON) {
    $conda = "$env:USERPROFILE\miniconda3\envs\avestudio\python.exe"
    if (Test-Path $conda) { $env:AVE_PYTHON = $conda }
}

if (-not $skipEngine) {
    & (Join-Path $PSScriptRoot "build_engine.ps1")
} else {
    Write-Host "Skipping engine rebuild (-SkipEngine)"
}

# Bundle installer scripts into Tauri resources (NSIS post-install setup).
$installerSrc = Join-Path $root "installer"
$installerDst = Join-Path $root "app\src-tauri\resources\installer"
New-Item -ItemType Directory -Force -Path $installerDst | Out-Null
Copy-Item -Force (Join-Path $installerSrc "*.cmd") $installerDst
Copy-Item -Force (Join-Path $installerSrc "*.ps1") $installerDst
Copy-Item -Force (Join-Path $installerSrc "manifest.json") $installerDst

Push-Location (Join-Path $root "app")
try {
    npm install
    npm run tauri build
} finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot "package_release.ps1")
