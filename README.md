# Soñar Despierto — Sistema de Gestión

Plataforma para gestionar voluntarios, niños beneficiarios, escuelas, tutores, cartas de Navidad,
calendario e inventario de **Soñar Despierto Veracruz**. Funciona en una sola computadora (y,
opcionalmente, en la red de la oficina) sin necesidad de internet.

<p align="center">
  <img width="225" height="225" alt="image" src="https://github.com/user-attachments/assets/d0fa246f-259d-4ec5-8467-b680b2a6e29f" />
</p>

**Arquitectura:** un solo proceso local — FastAPI sirve la API (`/api/v1`) y la SPA de React
compilada en el mismo puerto, con SQLite en el directorio de datos; PyInstaller lo empaqueta como
`SonarDespierto.exe`. Decisiones en [`docs/adr/`](docs/adr/).

## Requisitos de desarrollo
- Windows 10/11
- Python 3.12
- Node 22 LTS (≥ 22.12)
- Git

## Puesta en marcha (PowerShell)

```powershell
# 1. Prepara el entorno (entorno virtual, dependencias, backend\.env y node_modules)
powershell -ExecutionPolicy Bypass -File scripts\setup-dev.ps1

# 2. API en modo desarrollo → http://127.0.0.1:8000/docs
powershell -ExecutionPolicy Bypass -File scripts\dev-backend.ps1

# 3. (Otra terminal) Interfaz en modo desarrollo → http://localhost:5173
powershell -ExecutionPolicy Bypass -File scripts\dev-frontend.ps1
```

En el primer arranque se crea el administrador `admin@sonardespierto.org` con una contraseña
temporal que queda en `.data\CREDENCIALES_INICIALES.txt`; al entrar, el sistema pide cambiarla.
Para crear un operador:

```powershell
cd backend
.\.venv\Scripts\python.exe -m scripts.create_user --email ana@sonardespierto.org --first-name Ana --last-name Prueba --role OPERADOR --modules CARTAS,CALENDARIO
```

## Pruebas y calidad

```powershell
cd backend
.\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check .
.\.venv\Scripts\python.exe -m pytest

cd ..\frontend
npm run lint ; npm run typecheck ; npm test
```

## Generar el ejecutable

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1          # agrega -SkipTests para omitir pruebas
```

Ejecuta las pruebas, compila la interfaz, empaqueta con PyInstaller y corre una prueba de humo
contra el ejecutable. Resultado: la carpeta **`dist\SonarDespierto\`** (con `SonarDespierto.exe` y
`LEEME_USUARIO.txt`), que se copia completa a la PC de la oficina; no requiere Python ni Node.
Para crear el acceso directo en el Escritorio:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1
```

## Ejecutar desde el código (sin empaquetar)

`scripts\Iniciar-SonarDespierto.bat` hace lo mismo que el ejecutable usando el entorno de
desarrollo (requiere `npm run build` para ver la interfaz). Acepta las mismas opciones:
`--no-browser`, `--port N`, `--lan`, `--data-dir RUTA`, `--reset-admin [--email CORREO]`.

## Modo red local (LAN)

Con `LAN_MODE=true` en `config.env` (o la opción `--lan`), el servidor escucha en todas las
interfaces y el banner muestra la dirección para otras PCs (`http://IP-DE-ESTA-PC:8765`). Windows
pedirá permiso en el Firewall: marca solo **Redes privadas**. No lo actives en redes públicas.

## Directorio de datos

| Ejecución | Carpeta |
|---|---|
| Ejecutable | `%LOCALAPPDATA%\SonarDespierto` |
| Código fuente | `<repo>\.data` |
| Cualquiera | la variable `SD_DATA_DIR` o la opción `--data-dir` tienen prioridad |

Contiene `sonar.db` (SQLite), `secret.key`, `config.env`, `logs\sonar.log`, `uploads\` y
`backups\`. No debe estar en una carpeta sincronizada (OneDrive, Dropbox).

## Recuperar la contraseña del administrador

```powershell
.\SonarDespierto.exe --reset-admin                    # en la carpeta del programa
python launcher\launcher.py --reset-admin             # desde el código fuente (con el venv)
```

Asigna una contraseña temporal (se muestra una vez y queda en `CREDENCIALES_INICIALES.txt`) y
obliga a cambiarla al entrar.

## Documentación
- Hoja de ruta: [`docs/Roadmap_Fases.md`](docs/Roadmap_Fases.md)
- Decisiones de arquitectura (ADR): [`docs/adr/`](docs/adr/)
- Prompts y tareas por fase: [`docs/fases/`](docs/fases/)
- Diseño: [`docs/`](docs/) (requerimientos, modelo de datos, API, pantallas, convenciones)

## Estado
- **Fase 1 — Fundación y esqueleto ejecutable:** implementada (subtareas 1.1–1.6); se marcará ✅
  al cerrar el Gate de la fase ([§5](docs/fases/Fase_1_Prompts_Task_Document.md)).
  - [x] 1.1 Saneamiento del repositorio y estructura modular
  - [x] 1.2 Núcleo backend: configuración, datos locales, SQLite, Alembic y SPA
  - [x] 1.3 Usuarios, autenticación JWT y permisos por módulo
  - [x] 1.4 Migración del diseño Lovable a una SPA con Vite
  - [x] 1.5 Integración de autenticación frontend ↔ API
  - [x] 1.6 Lanzador, build y ejecutable Windows
- Fases 2–8: ver la [hoja de ruta](docs/Roadmap_Fases.md).
