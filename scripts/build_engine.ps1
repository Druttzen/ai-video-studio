# Package the Python engine into a standalone folder (ave-engine/) with
# PyInstaller and copy it into the Tauri resources so `tauri build` bundles it.
#
# Requires the engine deps (incl. torch with the CUDA build you want to ship)
# installed in the active Python environment, plus pyinstaller.
#
#   $env:AVE_PYTHON = "C:\path\python.exe"   # env with torch+diffusers+pyinstaller
#   ./scripts/build_engine.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$engine = Join-Path $root "engine"
$python = if ($env:AVE_PYTHON) { $env:AVE_PYTHON } else { "python" }

Write-Host "Using python: $python"

Push-Location $engine
try {
    & $python -m pip install --upgrade pyinstaller
    & $python -m PyInstaller --noconfirm --clean ave-engine.spec

    $dist = Join-Path $engine "dist\ave-engine"
    if (-not (Test-Path $dist)) { throw "PyInstaller did not produce dist/ave-engine" }

    $target = Join-Path $root "app\src-tauri\binaries\ave-engine"
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Recurse -Force "$dist\*" $target

    Write-Host "Engine packaged into $target"
} finally {
    Pop-Location
}
