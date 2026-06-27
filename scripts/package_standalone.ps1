# Package a full standalone Windows distribution (like ai-video-tool NSIS release).
#
# Produces:
#   release/DjMAD-AI-Video-Tool-v{version}-win64-Standalone.zip
#   release/DjMAD-AI-Video-Tool-v{version}-win64-Standalone-Setup.exe  (7-Zip SFX, if 7z present)
#
# Requires package_release.ps1 output in release/ (run build.ps1 first).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$tauriConf = Join-Path $root "app\src-tauri\tauri.conf.json"

if (-not (Test-Path $release)) { throw "Missing release/ - run scripts/build.ps1 first" }
$installExe = Join-Path $release "install.exe"
if (-not (Test-Path $installExe)) { throw "Missing release/install.exe - run tauri build first" }
$payload = Join-Path $release "payload\ave-engine"
if (-not (Test-Path $payload)) { throw "Missing release/payload/ave-engine - run build_engine.ps1 first" }

$conf = Get-Content $tauriConf -Raw | ConvertFrom-Json
$version = $conf.version
$baseName = "DjMAD-AI-Video-Tool-v$version-win64-Standalone"

# README with version substituted.
$readmeTpl = Join-Path $root "installer\README-INSTALL.txt"
$readmeDst = Join-Path $release "README-INSTALL.txt"
(Get-Content $readmeTpl -Raw).Replace("{{VERSION}}", $version) | Set-Content -Encoding UTF8 $readmeDst

$zipPath = Join-Path $release "$baseName.zip"
$sfxName = "${baseName}-Setup.exe"
$sfxPath = Join-Path $release $sfxName

$sevenZip = @(
    "${env:ProgramFiles}\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$stageItems = @(
    "install.exe",
    "ai-video-tool.exe",
    "setup.cmd",
    "ave-setup.ps1",
    "uninstall.cmd",
    "ave-uninstall.ps1",
    "manifest.json",
    "README-INSTALL.txt",
    "payload"
)

$missing = @($stageItems | Where-Object { -not (Test-Path (Join-Path $release $_)) })
if ($missing.Count -gt 0) { throw "Release folder incomplete. Missing: $($missing -join ', ')" }

if ($sevenZip) {
  Write-Host "Creating ZIP ($baseName.zip)..."
  if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
  $itemArgs = $stageItems | ForEach-Object { Join-Path $release $_ }
  & $sevenZip a -tzip -mx=1 $zipPath @itemArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7z zip failed (exit $LASTEXITCODE)" }

  $sfxModule = Join-Path (Split-Path $sevenZip -Parent) "7zSD.sfx"
  if (-not (Test-Path $sfxModule)) { $sfxModule = Join-Path (Split-Path $sevenZip -Parent) "7z.sfx" }
  if (Test-Path $sfxModule) {
    Write-Host "Creating self-extracting installer ($sfxName)..."
    $archive7z = Join-Path $env:TEMP "ave-standalone-$version.7z"
    if (Test-Path $archive7z) { Remove-Item -Force $archive7z }
    & $sevenZip a -t7z -mx=1 $archive7z @itemArgs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7z archive failed (exit $LASTEXITCODE)" }

    $sfxConfig = Join-Path $root "installer\sfx-config.txt"
    if (Test-Path $sfxPath) { Remove-Item -Force $sfxPath }
    $sfxParts = @($sfxModule, $sfxConfig, $archive7z)
    $fs = [System.IO.File]::OpenWrite($sfxPath)
    try {
      foreach ($part in $sfxParts) {
        $in = [System.IO.File]::OpenRead($part)
        try {
          $in.CopyTo($fs)
        } finally {
          $in.Close()
        }
      }
    } finally {
      $fs.Close()
    }
    Remove-Item -Force $archive7z
  } else {
    Write-Host "7z SFX module not found - skipping Standalone-Setup.exe (ZIP only)."
  }
} else {
  Write-Host "7-Zip not found - creating ZIP with Compress-Archive (slower)..."
  if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
  $tempStage = Join-Path $env:TEMP "ave-standalone-stage-$version"
  if (Test-Path $tempStage) { Remove-Item -Recurse -Force $tempStage }
  New-Item -ItemType Directory -Force -Path $tempStage | Out-Null
  foreach ($item in $stageItems) {
    Copy-Item -Recurse -Force (Join-Path $release $item) (Join-Path $tempStage $item)
  }
  Compress-Archive -Path (Join-Path $tempStage "*") -DestinationPath $zipPath -CompressionLevel Fastest
  Remove-Item -Recurse -Force $tempStage
}

Write-Host ""
Write-Host "=== Standalone distribution ===" -ForegroundColor Cyan
Get-ChildItem $release -File | Where-Object { $_.Name -like "DjMAD-*" -or $_.Name -eq "README-INSTALL.txt" } |
  ForEach-Object {
    $gb = [math]::Round($_.Length / 1GB, 2)
    $label = if ($gb -ge 0.1) { "$gb GB" } else { "$([math]::Round($_.Length / 1MB, 1)) MB" }
    Write-Host "  $($_.Name)  ($label)"
  }
Write-Host ""
Write-Host "End users: run *-Standalone-Setup.exe (single file) or extract the ZIP and run install.exe"
