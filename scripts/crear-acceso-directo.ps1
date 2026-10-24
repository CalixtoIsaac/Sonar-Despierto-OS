# Crea el acceso directo "Soñar Despierto" en el Escritorio.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1 [-Carpeta RUTA\SonarDespierto]
#   Sin -Carpeta usa dist\SonarDespierto (paquete portátil) o, si no existe, la carpeta del repositorio.
param([string]$Carpeta = "")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Carpeta) {
  $Dist = Join-Path $Root "dist\SonarDespierto"
  $Carpeta = if (Test-Path (Join-Path $Dist "SonarDespierto.bat")) { $Dist } else { $Root }
}
$Bat = Join-Path $Carpeta "SonarDespierto.bat"
if (-not (Test-Path $Bat)) { throw "No se encontró $Bat. Genera el paquete con: npm run empaquetar" }
$Bat = (Resolve-Path $Bat).Path
$Icon = Join-Path (Split-Path -Parent $Bat) "public\img\favicon.ico"

$Desktop = [Environment]::GetFolderPath("Desktop")
$LinkPath = Join-Path $Desktop "Soñar Despierto.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut($LinkPath)
$Link.TargetPath = $Bat
$Link.WorkingDirectory = Split-Path -Parent $Bat
if (Test-Path $Icon) { $Link.IconLocation = "$Icon,0" }
$Link.Description = "Sistema de Gestión Soñar Despierto"
$Link.Save()
Write-Host "Acceso directo creado: $LinkPath" -ForegroundColor Green
