@echo off
chcp 65001 >nul
title Soñar Despierto - Respaldo
cd /d "%~dp0"
rem Hace un respaldo manual en la carpeta de datos (se puede usar con el sistema abierto).
if exist "%~dp0node.exe" (
  "%~dp0node.exe" server.js --respaldar
) else (
  node server.js --respaldar
)
echo.
pause
