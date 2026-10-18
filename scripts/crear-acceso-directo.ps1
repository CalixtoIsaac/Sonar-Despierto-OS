# Crea el acceso directo "Soñar Despierto" en el Escritorio.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1 [-ExePath RUTA\SonarDespierto.exe]
param([string]$ExePath = "")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $ExePath) { $ExePath = Join-Path $Root "dist\SonarDespierto\SonarDespierto.exe" }
if (-not (Test-Path $ExePath)) { throw "No se encontró el ejecutable: $ExePath. Genera el build con scripts\build.ps1" }
$Exe = (Resolve-Path $ExePath).Path

$Desktop = [Environment]::GetFolderPath("Desktop")
$LinkPath = Join-Path $Desktop "Soñar Despierto.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut($LinkPath)
$Link.TargetPath = $Exe
$Link.WorkingDirectory = Split-Path -Parent $Exe
$Link.IconLocation = "$Exe,0"
$Link.Description = "Sistema de Gestión Soñar Despierto"
$Link.Save()
Write-Host "Acceso directo creado: $LinkPath" -ForegroundColor Green
