@echo off
chcp 65001 >nul
cd /d "%~dp0.."
if not exist "backend\.venv\Scripts\python.exe" (
  echo Primero ejecuta: powershell -ExecutionPolicy Bypass -File scripts\setup-dev.ps1
  pause & exit /b 1
)
"backend\.venv\Scripts\python.exe" launcher\launcher.py %*
if errorlevel 1 pause
