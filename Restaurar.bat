@echo off
chcp 65001 >nul
title Soñar Despierto - Restaurar un respaldo
cd /d "%~dp0"
rem Restaura un respaldo con el sistema CERRADO. Arrastra el archivo sonar-....zip sobre este archivo,
rem o escribe la ruta cuando se pida. Lo normal es restaurar desde el menú Respaldos del sistema.
set "ARCHIVO=%~1"
if "%ARCHIVO%"=="" set /p "ARCHIVO=Ruta del respaldo (.zip): "
if exist "%~dp0node.exe" (
  "%~dp0node.exe" server.js --restaurar "%ARCHIVO%"
) else (
  node server.js --restaurar "%ARCHIVO%"
)
echo.
pause
