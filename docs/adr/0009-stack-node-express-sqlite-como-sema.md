# ADR-0009: Mismo stack que My Best DataBase y SEMA — Node.js + Express + SQLite + HTML/CSS/JS sin frameworks

- **Estado:** Aceptado
- **Fecha:** 2026-10-23
- **Decisores:** Isaac Galeana (líder técnico)
- **Reemplaza:** ADR-0001 (frontend React + Vite + Tailwind), ADR-0002 (SQLAlchemy + Alembic), ADR-0005 (backend por módulos `app/modules/<x>`)
- **Modifica:** ADR-0003 (el ejecutable de PyInstaller pasa a ser un paquete portátil con `node.exe`), ADR-0007 (un solo token de sesión en lugar de access + refresh)
- **Relacionado con:** ADR-0004, ADR-0006, ADR-0008, [`Arquitectura_y_Convenciones.md`](../Arquitectura_y_Convenciones.md)

## Contexto

- El equipo mantiene en paralelo **My Best DataBase** (Node.js + Express + MySQL + HTML/CSS/JS sin frameworks) y **SEMA** (Node.js + Express + SQLite con `better-sqlite3` + HTML/CSS/JS sin frameworks, a partir de la plantilla `plantilla-express-sqlite`). SIDI aún no tiene código.
- Soñar Despierto terminó la Fase 1 con otro stack (Python/FastAPI + SQLAlchemy/Alembic + React/TypeScript/Vite/Tailwind/shadcn + PyInstaller). Tener dos stacks obliga al equipo a mantener dos juegos de herramientas, convenciones y componentes, y dificulta mover gente y código entre proyectos.
- La Fase 1 es pequeña (login, cambio de contraseña obligatorio, roles y permisos por módulo, bitácora, arranque local y modo LAN), así que migrarla ahora cuesta poco; después de la Fase 3 costaría mucho más.

## Decisión

1. **Stack único con SEMA** (y el mismo lenguaje y servidor que My Best DataBase):

   | Pieza | Elección |
   |---|---|
   | Entorno | Node.js 20+ (recomendado 22 LTS) |
   | Servidor | Express 4 (`express.json`, `express.static`) |
   | Base de datos | SQLite con `better-sqlite3` (síncrono, una conexión, WAL) |
   | Sesión | JWT HS256 con `jsonwebtoken`; contraseñas con `bcryptjs` (costo 10) |
   | Configuración | `dotenv` |
   | Frontend | HTML + CSS + JavaScript sin frameworks ni paso de compilación; cada pantalla es un módulo IIFE con `mount(contenedor)`; UI kit compartido (`UI.api`, `UI.toast`, `UI.confirm`, `UI.formModal`…) |
   | Pruebas | `node:test` (sin dependencias extra) |

   Son exactamente las 5 dependencias de SEMA: `express`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `dotenv`. Agregar otra requiere aprobación del líder técnico.
2. **Estructura de SEMA:** `server.js` en la raíz; `lib/` (infraestructura: configuración, BD, migraciones, seguridad, middlewares, arranque); `services/` (casos de uso); `routes/` (capa HTTP); `public/` (páginas, CSS, JS, tipografías locales); `scripts/`; `test/`. Las rutas no contienen reglas de negocio.
3. **Diseño:** se conserva el diseño de Lovable (paleta coral/naranja/sol, tipografías Figtree, Nunito, Jost y Playfair Display, logotipo de arcos), **recreado con CSS propio** sobre los tokens de `theme.css` de la plantilla de SEMA (mismos nombres de variables), con tema claro y oscuro. Las tipografías se sirven desde `public/vendor/fonts/` (funciona sin internet).
4. **Base de datos:** SQL escrito a mano con `better-sqlite3` y **migraciones numeradas** en `lib/migrations.js` controladas con `PRAGMA user_version` (sustituyen a Alembic). Reglas de portabilidad para la fase de nube: enums como `TEXT` + `CHECK`, fechas como texto ISO 8601 en UTC, booleanos `INTEGER 0/1`, JSON como `TEXT`, sin funciones exclusivas de SQLite en las consultas de negocio, y todo el SQL dentro de `services/` (así migrar a MySQL —como My Best DataBase— o a PostgreSQL toca solo esa capa). Una BD creada por la versión Python (Alembic `0001`) se **adopta** automáticamente sin perder cuentas.
5. **Sesión (ajuste a ADR-0007):** un solo token de **8 h** (`SESSION_HOURS`), como SEMA, con el claim `ver` = `users.token_version`: cerrar sesión, cambiar la contraseña, restablecerla o desactivar la cuenta invalida todos los tokens anteriores. Se guarda en `sessionStorage` (no en `localStorage` como SEMA) porque las PCs de la oficina son compartidas. Se elimina `POST /auth/refresh`.
6. **API:** prefijo `/api` (como SEMA) y formato de error plano `{ "error": "mensaje", "code": "CODIGO", "details"?: [...] }`: `error` es compatible con el UI kit de SEMA y `code` mantiene los códigos estables de la Fase 1 (`INVALID_CREDENTIALS`, `PASSWORD_CHANGE_REQUIRED`, `MODULE_FORBIDDEN`, …).
7. **Ejecución local (ajuste a ADR-0003):** `SonarDespierto.bat` (como `SEMA.bat`) arranca el servidor, aplica migraciones, crea el administrador inicial, detecta si el sistema ya está abierto, busca puerto libre, muestra el banner con las URLs de la red local y abre el navegador. `npm run empaquetar` genera **`dist\SonarDespierto\`**, una carpeta portátil con su propio `node.exe` y `node_modules`, para PCs **sin Node.js**. Se conservan el puerto 8765, `LAN_MODE`, `%LOCALAPPDATA%\SonarDespierto` como carpeta de datos del paquete y `--reset-admin`.
8. **Se conservan sin cambios:** roles y módulos (ADR-0004), reglas de inventario y cartas (ADR-0006), auto-registro con aprobación (ADR-0008), nombres en inglés de tablas y columnas y JSON en `snake_case` (para no reescribir `Modelo_Datos.md` ni `API_Spec.md`), mensajes en español.

## Consecuencias

- ✅ Un solo stack para los proyectos del equipo: mismas herramientas, plantilla, UI kit y convenciones de Git. Lo aprendido en SEMA aplica aquí y viceversa.
- ✅ Sin paso de compilación: se edita un archivo de `public/` y se recarga el navegador. 5 dependencias en lugar de ~60.
- ✅ Las cuentas creadas con la versión Python siguen funcionando (`bcryptjs` verifica hashes `$2b$` y la BD se adopta).
- ⚠️ Se pierde la tipificación estática (TypeScript, Pydantic) y la documentación automática de Swagger: la API se documenta a mano en `API_Spec.md` y las pruebas de `node:test` cubren las validaciones.
- ⚠️ Sin ORM, el paso a MySQL/PostgreSQL implica revisar el SQL de `services/` (mitigado por las reglas de portabilidad del punto 4).
- ⚠️ El paquete portátil debe generarse en Windows x64 (copia el `node.exe` y el binario de `better-sqlite3` de la PC que empaqueta). El instalador formal sigue en la Fase 8.
- ⚠️ El documento de la Fase 2 (`fases/Fase_2_Prompts_Task_Document.md`) se reescribe para este stack (v2.0). Las reglas de negocio y los contratos de la API no cambian.
- 🔧 Trabajo realizado: reimplementación de la Fase 1 (rama `feat/stack-node-express`) con 47 pruebas automáticas y prueba de humo del paquete.

## Alternativas consideradas

- **Igual que SIDI** (Express + TypeScript + Prisma + React/Vite): conservaba el frontend React, pero SIDI aún no tiene código y no coincide con SEMA ni con My Best DataBase.
- **Mixto** (backend Express + SQLite y frontend React actual): dos formas de hacer frontend entre proyectos; descartado por el líder técnico.
- **Mantener Python/FastAPI:** descartado; es justo la divergencia que se quiere eliminar.
- **Módulo nativo `node:sqlite`** en lugar de `better-sqlite3`: evitaría el binario nativo, pero aún es experimental en Node 22 y SEMA usa `better-sqlite3`.
