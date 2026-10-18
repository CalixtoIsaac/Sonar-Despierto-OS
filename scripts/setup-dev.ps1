# Prepara el entorno de desarrollo. Uso: powershell -ExecutionPolicy Bypass -File scripts\setup-dev.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Backend: entorno virtual con Python 3.12" -ForegroundColor Cyan
if (-not (Test-Path "backend\.venv")) {
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3.12 -m venv backend\.venv }
    else { python -m venv backend\.venv }
}
& backend\.venv\Scripts\python.exe --version
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip
& backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
if (-not (Test-Path "backend\.env")) {
    Copy-Item backend\.env.example backend\.env
    Write-Host "    Se creó backend\.env a partir de .env.example"
}

if (Test-Path "frontend\package.json") {
    Write-Host "==> Frontend: dependencias (requiere Node 22 LTS)" -ForegroundColor Cyan
    node --version
    Push-Location frontend; npm install; Pop-Location
}
Write-Host "Listo. Backend: scripts\dev-backend.ps1  |  Frontend: scripts\dev-frontend.ps1" -ForegroundColor Green
