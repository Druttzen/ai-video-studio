# Package ave-engine into a GitHub release asset (7z, under 2 GB target).
#
# Upload the output to the matching GitHub release tag in manifest.json:
#   release/ave-engine-win64.7z
#
#   ./scripts/publish_engine_asset.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$engineSrc = Join-Path $root "app\src-tauri\binaries\ave-engine"
if (-not (Test-Path (Join-Path $engineSrc "ave-engine.exe"))) {
    throw "Missing engine bundle - run scripts/build_engine.ps1 first"
}

$sevenZip = @(
    "${env:ProgramFiles}\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $sevenZip) { throw "7-Zip required to create ave-engine-win64.7z" }

$release = Join-Path $root "release"
New-Item -ItemType Directory -Force -Path $release | Out-Null
$out = Join-Path $release "ave-engine-win64.7z"
if (Test-Path $out) { Remove-Item -Force $out }

$parent = Split-Path $engineSrc -Parent
$name = Split-Path $engineSrc -Leaf
Push-Location $parent
try {
    & $sevenZip a -t7z -mx=5 $out $name | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7z failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

$sizeGb = [math]::Round((Get-Item $out).Length / 1GB, 2)
$hash = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
Write-Host "Created: $out ($sizeGb GB)"
Write-Host "SHA256:  $hash"
Write-Host ""
Write-Host "Add sha256 to installer/manifest.json release.downloads.engine_win64"
Write-Host "Upload to GitHub release: gh release upload $($conf = (Get-Content (Join-Path $root 'installer\manifest.json') -Raw | ConvertFrom-Json); $conf.release.tag) `"$out`""
