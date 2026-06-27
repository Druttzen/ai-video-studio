# Full production build: package the engine, build Tauri, copy release artifacts.
#
#   ./scripts/build.ps1              Full offline bundle (~5 GB payload + standalone ZIP/SFX)
#   ./scripts/build.ps1 -Minimal     GitHub release (~3 MB Setup; downloads engine online)
#   ./scripts/build.ps1 -SkipEngine  Reuse existing engine bundle (with full packaging)
#
# Output (minimal):
#   release/DjMAD-AI-Video-Tool-Setup-{version}.exe
#
# Output (full):
#   release/DjMAD-AI-Video-Tool-v{version}-win64-Standalone-Setup.exe
#
#   $env:AVE_PYTHON = "C:\path\python.exe"

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$skipEngine = $args -contains "-SkipEngine"
$minimal = $args -contains "-Minimal"

if (-not $env:AVE_PYTHON) {
    $conda = "$env:USERPROFILE\miniconda3\envs\avestudio\python.exe"
    if (Test-Path $conda) { $env:AVE_PYTHON = $conda }
}

if ($minimal) {
    Write-Host "Minimal GitHub release build (-Minimal): engine downloads at install time"
} elseif (-not $skipEngine) {
    & (Join-Path $PSScriptRoot "build_engine.ps1")
} else {
    Write-Host "Skipping engine rebuild (-SkipEngine)"
}

$installerSrc = Join-Path $root "installer"
& (Join-Path $PSScriptRoot "fetch_7zr.ps1")

$installerDst = Join-Path $root "app\src-tauri\resources\installer"
New-Item -ItemType Directory -Force -Path $installerDst | Out-Null
Copy-Item -Force (Join-Path $installerSrc "*.cmd") $installerDst
Copy-Item -Force (Join-Path $installerSrc "*.ps1") $installerDst
Copy-Item -Force (Join-Path $installerSrc "manifest.json") $installerDst

$toolsDst = Join-Path $installerDst "tools"
New-Item -ItemType Directory -Force -Path $toolsDst | Out-Null
Copy-Item -Force (Join-Path $installerSrc "tools\.gitkeep") (Join-Path $toolsDst ".gitkeep") -ErrorAction SilentlyContinue
foreach ($zr in @(
    "${env:ProgramFiles}\7-Zip\7zr.exe",
    "${env:ProgramFiles}\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7zr.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
)) {
    if (Test-Path $zr) {
        Copy-Item -Force $zr (Join-Path $toolsDst "7zr.exe")
        Write-Host "Bundled 7zr for online engine extract: $zr"
        break
    }
}

Push-Location (Join-Path $root "app")
try {
    npm install
    npm run tauri build
} finally {
    Pop-Location
}

if ($minimal) {
    & (Join-Path $PSScriptRoot "package_release.ps1") -Minimal
} else {
    & (Join-Path $PSScriptRoot "package_release.ps1")
}
