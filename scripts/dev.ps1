# Run the app in development.
#
# Points the Rust supervisor at a Python interpreter that has the engine deps
# installed, then launches Tauri dev (which starts Vite + the Rust app, which
# in turn spawns `python -m ave_engine`).
#
# Usage:
#   ./scripts/dev.ps1                  # uses the 'avestudio' conda env by default
#   $env:AVE_PYTHON = "C:\path\python.exe"; ./scripts/dev.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $env:AVE_PYTHON) {
    $conda = "$env:USERPROFILE\miniconda3\envs\avestudio\python.exe"
    if (Test-Path $conda) {
        $env:AVE_PYTHON = $conda
    } else {
        $env:AVE_PYTHON = "python"
    }
}
$env:AVE_ENGINE_DIR = Join-Path $root "engine"

# All models/outputs live under the project tree (never E: or AppData).
if (-not $env:AVE_DATA_DIR) {
    $env:AVE_DATA_DIR = Join-Path $root "data"
}

Write-Host "Engine python : $env:AVE_PYTHON"
Write-Host "Engine dir    : $env:AVE_ENGINE_DIR"

Push-Location (Join-Path $root "app")
try {
    npm run tauri dev
} finally {
    Pop-Location
}
