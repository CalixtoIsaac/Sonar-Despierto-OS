# ADR-0003: Ejecución local — ejecutable lanzador, proceso único y modo LAN opcional

- **Estado:** Aceptado · Modificado por [ADR-0009](0009-stack-node-express-sqlite-como-sema.md) (2026-10-23): el ejecutable de PyInstaller pasa a ser `SonarDespierto.bat` + paquete portátil con `node.exe`; el resto sigue vigente
- **Fecha:** 2026-10-17
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana)
- **Relacionado con:** ADR-0001, ADR-0002, `PROJECT_CONTEXT.md` §2.1

## Contexto

- Flujo requerido: doble clic en un ícono del escritorio → se inicia el servidor → se abre el navegador en `http://localhost:<puerto>` → Login → panel.
- La directiva quiere que **2 o 3 computadoras de la misma oficina** puedan entrar desde su navegador usando la IP del equipo anfitrión; también es aceptable que el MVP funcione solo en una PC.
- Las PCs de destino son **Windows 10/11** sin Python ni Node instalados.

## Decisión

1. **Un solo proceso**: `SonarDespierto.exe` (generado con **PyInstaller**, modo *one-folder*) contiene Python, FastAPI/Uvicorn, la SPA compilada y las migraciones. Sirve la API (`/api/v1`) y la SPA (`/`) en el **mismo puerto y origen**.
2. El **lanzador** (`launcher/launcher.py`):
   - resuelve el directorio de datos y crea `config.env` por defecto en el primer arranque;
   - detecta si el sistema **ya está abierto** (consulta `/api/v1/health`) y, en ese caso, solo abre el navegador;
   - si el puerto está ocupado por otro programa, prueba los siguientes 20 puertos;
   - inicia Uvicorn, que al arrancar ejecuta las migraciones de Alembic y crea el administrador inicial si la BD está vacía;
   - espera a que `/api/v1/health` responda, muestra un banner con las URLs y abre el navegador predeterminado;
   - muestra las credenciales iniciales la primera vez y permite `--reset-admin` para recuperar el acceso.
3. **Directorio de datos** (fuera de la carpeta del programa y de OneDrive):
   - ejecutable: `%LOCALAPPDATA%\SonarDespierto\` → `sonar.db`, `secret.key`, `config.env`, `logs\`, `uploads\`, `backups\`;
   - desarrollo: `<repo>/.data/`;
   - se puede forzar con la variable `SD_DATA_DIR` o con `--data-dir`.
4. **Modo de red** configurable en `config.env`:
   - `LAN_MODE=false` (**por defecto**): escucha solo en `127.0.0.1`; únicamente la PC anfitriona puede entrar.
   - `LAN_MODE=true`: escucha en `0.0.0.0`; el banner muestra `http://<IP-local>:<puerto>` para las demás PCs. Requiere permitir el programa en el Firewall de Windows en el perfil **Red privada**.
5. Puerto por defecto **8765** (configurable con `PORT`). En desarrollo: API en 8000 y Vite en 5173 (con proxy de `/api` a 8000).
6. La ventana de consola permanece abierta mientras el sistema está en uso; cerrarla (o Ctrl+C) apaga el servidor.

## Consecuencias

- ✅ Instalación = copiar una carpeta y crear un acceso directo (instalador formal en la Fase 8).
- ✅ Misma base de código para uso local, LAN y nube.
- ⚠️ **En modo LAN el tráfico viaja por HTTP sin cifrar.** Aceptado para el MVP solo en la red privada de la oficina (no en redes públicas ni Wi-Fi de invitados). HTTPS se resuelve en la fase de nube.
- ⚠️ Si la PC anfitriona se apaga, las demás pierden el acceso; queda documentado en el manual de usuario.
- ⚠️ Algunos antivirus marcan ejecutables de PyInstaller como sospechosos; mitigación: modo *one-folder*, sin UPX y, en la Fase 8, firma de código si la organización lo consigue.
- 🔧 Trabajo generado: subtareas 1.2 (configuración/rutas) y 1.6 (lanzador, build, ejecutable).

## Alternativas consideradas

- **Script `.bat` que ejecuta `uvicorn`:** útil en desarrollo (se incluye `Iniciar-SonarDespierto.bat`), pero exige Python instalado en cada PC.
- **Electron / Tauri:** descartado; añade peso y no resuelve el acceso desde otras PCs.
- **Servicio de Windows:** posible mejora futura; se pospone para no requerir permisos de administrador.
