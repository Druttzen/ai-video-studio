# Download 7zr.exe (7-Zip extra) for bundling into the installer.
# Redistributable per 7-Zip license: https://www.7-zip.org/license.txt

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "installer\tools\7zr.exe"
$url = "https://www.7-zip.org/a/7zr.exe"

New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
Write-Host "Fetched 7zr.exe ($([math]::Round((Get-Item $dest).Length / 1KB)) KB) -> $dest"
