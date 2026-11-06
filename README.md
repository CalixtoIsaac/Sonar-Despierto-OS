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
| `npm run instalador` | Lo anterior + instalador de Windows `dist\instalador\SonarDespierto-Instalador-<versión>.exe` (requiere Inno Setup 6) |
| `npm run respaldar` | Respaldo manual en `{datos}\backups` (funciona con el sistema abierto) |
| `npm run restaurar -- RUTA\sonar-….zip` | Restaurar un respaldo con el sistema cerrado (pide escribir RESTAURAR) |
| `npm run demo [-- --reiniciar]` | Abre el sistema con datos **ficticios** en `.data-demo` y el puerto 8775 (contraseña `Demo2026`) |

Opciones de `node server.js` / `SonarDespierto.bat`: `--no-browser`, `--port N`, `--lan`,
`--data-dir RUTA`, `--demo`, `--reset-admin [--email CORREO]`, `--respaldar`, `--listar-respaldos`,
`--restaurar ARCHIVO.zip [--si]`.

## Paquete portátil (PCs sin Node.js)

```powershell
npm run empaquetar
powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1
```

Genera **`dist\SonarDespierto\`** con su propio `node.exe`, las dependencias y `LEEME_USUARIO.txt`.
Se copia completa a la PC de la oficina; el acceso directo apunta a `SonarDespierto.bat`. Debe
generarse en Windows de 64 bits (usa el `node.exe` y el binario de `better-sqlite3` de esa PC).

## Instalador de Windows

```powershell
winget install JRSoftware.InnoSetup    # una sola vez
npm run instalador
```

Instala por usuario (sin permisos de administrador) en `%LOCALAPPDATA%\Programs\SonarDespierto`, con accesos a
Respaldar ahora, la carpeta de datos, el manual y config.env. Los datos no se tocan al actualizar ni al desinstalar
([ADR-0015](docs/adr/0015-respaldos-instalador-y-endurecimiento.md)).

## Respaldos

Un respaldo diario automático (`.zip` con la base y las fotos) en `{datos}\backups`, además de uno antes de cada
restauración y de cada actualización. Menú **Respaldos** (solo administradores): respaldar ahora, descargar,
restaurar de la lista o subiendo un `.zip`. Copia extra opcional con `BACKUP_COPY_DIR`. Detalles en
[`docs/fases/Fase_8_Contratos.md`](docs/fases/Fase_8_Contratos.md).

## Modo red local (LAN)

Con `LAN_MODE=true` en `config.env` (o la opción `--lan`), el servidor escucha en todas las
interfaces y el banner muestra la dirección para otras PCs (`http://IP-DE-ESTA-PC:8765`). Windows
pedirá permiso en el Firewall: marca solo **Redes privadas**. No lo actives en redes públicas.
Guía completa: [`docs/Guia_Modo_LAN.md`](docs/Guia_Modo_LAN.md).

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
server.js · SonarDespierto.bat · Respaldar.bat · Restaurar.bat · package.json
lib/        configuración, BD y migraciones, seguridad, middlewares de permisos, arranque
services/   casos de uso y SQL (auth, users, audit, records, schools, tutors, volunteers, children)
routes/     capa HTTP (/api/health, auth, users, audit-logs, schools, tutors, volunteers, children)
public/     login.html, app.html, css/, js/ (ui-kit, access, vistas), vendor/fonts/
scripts/    reset-admin, create-user, respaldos, demo, empaquetar, instalador, crear-acceso-directo.ps1
installer/  SonarDespierto.iss (Inno Setup)
test/       pruebas con node:test
docs/       requerimientos, modelo de datos, API, pantallas, ADR y fases
```

## Documentación
- **Manual de usuario:** [`public/manual.html`](public/manual.html) (en el sistema: `http://localhost:8765/manual.html`)
- Guía de modo LAN: [`docs/Guia_Modo_LAN.md`](docs/Guia_Modo_LAN.md)
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
- **Fase 4 — Eventos y cartas de Navidad:** ✅ (2026-10-30). Eventos con voluntarios y tallas, cartas con código
  `NAV26-000123`, foto privada, padrino (voluntario), máquina de estados con historial, búsqueda por código en campo y
  concurrencia segura (la segunda asignación simultánea recibe `409`) ([contratos](docs/fases/Fase_4_Contratos.md), ADR-0011).
- **Fase 5 — Calendario de actividades:** ✅ (2026-10-31). Juntas, capacitaciones, acopios y eventos en vistas de mes,
  semana y agenda; filtros por tipo, responsable y evento; mover arrastrando; voluntarios convocados y aviso de traslape
  de horario del mismo responsable (`409 ACTIVITY_OVERLAP` con "guardar de todos modos") ([contratos](docs/fases/Fase_5_Contratos.md), ADR-0012).
- **Fase 6 — Inventario:** ✅ (2026-11-02). Categorías y centros de acopio editables, artículos, entradas, salidas y
  traspasos de varios artículos a la vez, existencias calculadas por centro, anulaciones, kardex con saldos y CSV; una
  salida mayor a la existencia se rechaza (`409 INSUFFICIENT_STOCK`) ([contratos](docs/fases/Fase_6_Contratos.md), ADR-0013).
- **Fase 7 — Dashboard y reportes:** ✅ (2026-11-05). Indicadores por evento (cartas por estatus, % con padrino,
  recibidos y entregados, niñas y niños sin carta o sin consentimiento, voluntarios, escuelas, actividades e inventario),
  avisos con enlace a listados filtrados, gráficas de avance semanal y por escuela, comparativo de eventos y exportación a
  Excel auditada; las cifras coinciden con consultas SQL de control ([contratos](docs/fases/Fase_7_Contratos.md), ADR-0014).
- **Fase 8 — Empaquetado y entrega:** 🟡 implementada (2026-11-05, versión 1.0.0). Respaldos automáticos y restauración
  validada (pantalla, archivo o consola), instalador de Windows con Inno Setup, revisión de seguridad (CSP, cabecera Host,
  `no-store`), manual de usuario, datos de demostración y guía de modo LAN ([contratos](docs/fases/Fase_8_Contratos.md),
  ADR-0015). Falta el Gate manual: instalación limpia en una PC sin Node.js y validación del manual por la directiva.
