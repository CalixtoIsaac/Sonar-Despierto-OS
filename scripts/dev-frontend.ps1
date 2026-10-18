# Interfaz en modo desarrollo: http://localhost:5173 (requiere la API en :8000 -> scripts\dev-backend.ps1)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "frontend")
npm run dev
