@echo off
setlocal EnableExtensions
title AI Video Tool - Component Setup

:: Visible CMD console with live status (phase 3 of install).
cd /d "%~dp0"

where powershell >nul 2>&1
if errorlevel 1 (
  echo ERROR: PowerShell is required.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ave-setup.ps1" %*
set ERR=%ERRORLEVEL%

if %ERR% NEQ 0 (
  echo.
  echo Setup failed (exit %ERR%).
  pause
  exit /b %ERR%
)

if not "%~1"=="--postinstall" (
  echo.
  echo Setup finished successfully.
  pause
)
exit /b 0
