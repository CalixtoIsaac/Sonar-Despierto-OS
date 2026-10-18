# Genera dist\SonarDespierto\SonarDespierto.exe.  Uso: powershell -ExecutionPolicy Bypass -File scripts\build.ps1 [-SkipTests]
param([switch]$SkipTests)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Py = Join-Path $Root "backend\.venv\Scripts\python.exe"
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "Falló: $what" } }

Step "1/6 Dependencias del frontend"; Push-Location frontend; npm ci; Check "npm ci"; Pop-Location
if (-not $SkipTests) {
  Step "2/6 Calidad y pruebas del frontend"
  Push-Location frontend; npm run lint; Check "lint"; npm run typecheck; Check "typecheck"; npm test; Check "vitest"; Pop-Location
  Step "3/6 Calidad y pruebas del backend"
  Push-Location backend; & $Py -m ruff check .; Check "ruff"; & $Py -m pytest; Check "pytest"; Pop-Location
}
Step "4/6 Compilando la interfaz"; Push-Location frontend; npm run build; Check "vite build"; Pop-Location
Step "5/6 Empaquetando con PyInstaller"
& $Py -m PyInstaller launcher\sonar_despierto.spec --noconfirm --clean --distpath dist --workpath build; Check "pyinstaller"
Copy-Item launcher\LEEME_USUARIO.txt dist\SonarDespierto\ -Force
Step "6/6 Prueba de humo contra el ejecutable"
& $Py scripts\smoke_test.py --exe dist\SonarDespierto\SonarDespierto.exe; Check "smoke test"
Write-Host "`nListo: dist\SonarDespierto\SonarDespierto.exe" -ForegroundColor Green
