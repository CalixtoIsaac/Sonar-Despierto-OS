# Soñar Despierto — Sistema de Gestión

Plataforma para gestionar voluntarios, niños beneficiarios, escuelas, tutores, cartas de Navidad,
calendario e inventario de **Soñar Despierto Veracruz**. Funciona en una sola computadora (y,
opcionalmente, en la red de la oficina) sin necesidad de internet.

<p align="center">
  <img width="225" height="225" alt="image" src="https://github.com/user-attachments/assets/d0fa246f-259d-4ec5-8467-b680b2a6e29f" />
</p>

**Stack:** el mismo de **SEMA** y **My Best DataBase** ([ADR-0009](docs/adr/0009-stack-node-express-sqlite-como-sema.md)):

- **Backend:** Node.js + Express, SQLite con `better-sqlite3`, sesiones JWT (`jsonwebtoken`) y contraseñas con `bcryptjs`.
- **Frontend:** HTML, CSS y JavaScript **sin frameworks** ni paso de compilación; cada pantalla es un módulo IIFE.
- **Diseño:** el de Lovable (coral, naranja y sol) recreado con CSS propio, con tema claro y oscuro y tipografías locales.

Un solo proceso sirve la API (`/api`) y las páginas en el mismo puerto (8765). Arquitectura y
convenciones: [`docs/Arquitectura_y_Convenciones.md`](docs/Arquitectura_y_Convenciones.md).

## Requisitos de desarrollo
- Windows 10/11
- **Node.js 22 LTS** (mínimo 20; las pruebas necesitan 21 o superior) y npm
- Git

## Puesta en marcha

```powershell
npm install
copy .env.example .env
npm run dev          # http://localhost:8765 — se reinicia solo al guardar cambios del servidor
```

O doble clic en **`SonarDespierto.bat`** (instala las dependencias la primera vez, arranca y abre el
navegador). Los cambios en `public/` no requieren reiniciar: basta con recargar el navegador.

En el primer arranque se crea el administrador `admin@sonardespierto.org` con una contraseña
temporal que se muestra en la consola y queda en `.data\CREDENCIALES_INICIALES.txt`; al entrar, el
sistema pide cambiarla (y el archivo se borra solo).

| Script | Para qué |
|---|---|
| `npm run dev` | Desarrollo: reinicia el servidor al guardar (`node --watch`), sin abrir el navegador |
| `npm start` | Ejecución normal (abre el navegador) |
| `npm test` | Pruebas automáticas (`node:test`) |
| `npm run create-user -- --email ana@sonardespierto.org --first-name Ana --last-name Prueba --role OPERADOR --modules CARTAS,CALENDARIO` | Crear un usuario desde la consola (soporte; lo normal es el menú Usuarios) |
| `npm run reset-admin [-- --email CORREO]` | Contraseña temporal para el administrador (o ese correo) |
| `npm run empaquetar` | Pruebas + paquete portátil `dist\SonarDespierto` + prueba de humo |

Opciones de `node server.js` / `SonarDespierto.bat`: `--no-browser`, `--port N`, `--lan`,
`--data-dir RUTA`, `--reset-admin [--email CORREO]`.

## Paquete portátil (PCs sin Node.js)

```powershell
npm run empaquetar
powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1
```

Genera **`dist\SonarDespierto\`** con su propio `node.exe`, las dependencias y `LEEME_USUARIO.txt`.
Se copia completa a la PC de la oficina; el acceso directo apunta a `SonarDespierto.bat`. Debe
generarse en Windows de 64 bits (usa el `node.exe` y el binario de `better-sqlite3` de esa PC).

## Modo red local (LAN)

Con `LAN_MODE=true` en `config.env` (o la opción `--lan`), el servidor escucha en todas las
interfaces y el banner muestra la dirección para otras PCs (`http://IP-DE-ESTA-PC:8765`). Windows
pedirá permiso en el Firewall: marca solo **Redes privadas**. No lo actives en redes públicas.

## Carpeta de datos

| Ejecución | Carpeta |
|---|---|
| Paquete portátil | `%LOCALAPPDATA%\SonarDespierto` |
| Código fuente | `<repo>\.data` |
| Cualquiera | la variable `SD_DATA_DIR` o la opción `--data-dir` tienen prioridad |

Contiene `sonar.db` (SQLite), `secret.key`, `config.env`, `logs\sonar.log`, `uploads\` y
`backups\`. En producción no debe estar en una carpeta sincronizada (OneDrive, Dropbox). Una
`sonar.db` creada por la versión anterior (Python) se adopta sola, sin perder las cuentas.

## Estructura

```text
server.js · SonarDespierto.bat · package.json
lib/        configuración, BD y migraciones, seguridad, middlewares de permisos, arranque
services/   casos de uso y SQL (auth, users, audit, records, schools, tutors, volunteers, children)
routes/     capa HTTP (/api/health, auth, users, audit-logs, schools, tutors, volunteers, children)
public/     login.html, app.html, css/, js/ (ui-kit, access, vistas), vendor/fonts/
scripts/    reset-admin, create-user, empaquetar, crear-acceso-directo.ps1
test/       pruebas con node:test
docs/       requerimientos, modelo de datos, API, pantallas, ADR y fases
```

## Documentación
- Hoja de ruta: [`docs/Roadmap_Fases.md`](docs/Roadmap_Fases.md)
- Decisiones de arquitectura (ADR): [`docs/adr/`](docs/adr/)
- Prompts y tareas por fase: [`docs/fases/`](docs/fases/)

## Estado
- **Fase 1 — Fundación:** ✅ reimplementada en Node.js + Express + SQLite (2026-10-23, ADR-0009):
  login, cambio obligatorio de contraseña, roles ADMIN/OPERADOR con permisos por módulo, bitácora,
  menú según permisos, arranque local con instancia única, modo LAN, `--reset-admin` y paquete
  portátil con prueba de humo.
- **Fase 2 — Usuarios, auto-registro y bitácora:** ✅ (2026-10-29). El personal solicita su cuenta en
  `/registro` y un administrador la aprueba y le asigna módulos (ADR-0008); gestión de usuarios, perfil
  editable y visor de bitácora ([documento de la fase](docs/fases/Fase_2_Prompts_Task_Document.md)).
- **Fase 3 — Personas:** ✅ (2026-10-29). Voluntarios, escuelas, tutores y niñas y niños con detección de
  duplicados (`409`), consentimiento del tutor legal, exportación CSV registrada en la bitácora y datos de
  menores solo con el módulo Beneficiarios ([contratos](docs/fases/Fase_3_Contratos.md), ADR-0010).
- **Siguiente:** Fase 4 — Eventos y cartas de Navidad. Fases 5–8: ver la [hoja de ruta](docs/Roadmap_Fases.md).
