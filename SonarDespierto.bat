@echo off
chcp 65001 >nul
title Soñar Despierto - Sistema de Gestión
cd /d "%~dp0"

rem Paquete portátil: trae su propio node.exe (no hace falta instalar Node.js)
if exist "%~dp0node.exe" (
  "%~dp0node.exe" server.js %*
  if errorlevel 1 pause
  exit /b
)

rem Desde el código fuente: requiere Node.js 20 o superior
where node >nul 2>nul || (echo Instala Node.js 22 LTS desde https://nodejs.org y vuelve a intentarlo. & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias, solo la primera vez...
  call npm install --omit=dev || (pause & exit /b 1)
)
if not exist .env copy .env.example .env >nul
node server.js %*
if errorlevel 1 pause
