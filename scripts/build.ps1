# Full production build: package the engine, then build the Windows installer.
#
# Output: app/src-tauri/target/release/bundle/nsis/*.exe
#
#   $env:AVE_PYTHON = "C:\path\python.exe"   # env with torch+diffusers+pyinstaller
#   ./scripts/build.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot "build_engine.ps1")

Push-Location (Join-Path $root "app")
try {
    npm install
    npm run tauri build
    Write-Host ""
    Write-Host "Installer written to app/src-tauri/target/release/bundle/nsis/"
} finally {
    Pop-Location
}
