@echo off
setlocal EnableExtensions
title AI Video Tool - Uninstall

cd /d "%~dp0"

where powershell >nul 2>&1
if errorlevel 1 (
  echo ERROR: PowerShell is required.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ave-uninstall.ps1" %*
set ERR=%ERRORLEVEL%

if %ERR% NEQ 0 (
  echo.
  echo Uninstall failed (exit %ERR%).
  if not "%~1"=="--quiet" pause
  exit /b %ERR%
)

if not "%~1"=="--quiet" (
  echo.
  echo Uninstall finished.
  pause
)
exit /b 0
