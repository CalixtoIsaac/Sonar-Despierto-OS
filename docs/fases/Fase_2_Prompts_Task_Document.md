# Fase 2 — Prompts Task Document: Usuarios, auto-registro, permisos y bitácora

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local)
- **Versión del documento:** 2.0 · **Fecha:** 2026-10-23 · **Estado:** Aprobado para ejecución
- **Cambio respecto a la v1.0 (2026-10-17):** reescrito para el stack de **ADR-0009** (Node.js + Express + SQLite con `better-sqlite3` + HTML/CSS/JS sin frameworks, igual que SEMA y My Best DataBase). **Las reglas de negocio, los endpoints, los esquemas JSON, los códigos de error y los textos de interfaz no cambian**; cambian los archivos, el prefijo de la API (`/api`), el formato de error (plano) y las herramientas.
- **Punto de partida:** rama `main` con la Fase 1 reimplementada en Node (ver `README.md`).
- **Decisiones que aplica:** ADR-0003, ADR-0004, ADR-0006, ADR-0007, **ADR-0008 — Auto-registro del personal con aprobación del administrador** y **ADR-0009 — Stack** (`docs/adr/`) · Hoja de ruta: [`Roadmap_Fases.md`](../Roadmap_Fases.md) · Convenciones: [`Arquitectura_y_Convenciones.md`](../Arquitectura_y_Convenciones.md)
- **Cambio respecto a la hoja de ruta original:** la F2 ya no es solo "el ADMIN da de alta usuarios". Ahora **cada persona del personal crea su propia cuenta** desde `/registro`; la cuenta queda **pendiente** hasta que un ADMIN la aprueba y le asigna módulos (ADR-0008).

---

## 0. Cómo usar este documento

1. **Una subtarea = una sesión de IA (o un desarrollador) = una rama = un pull request.**
2. Para cada subtarea, entrega a la IA, **en este orden**:
   - **[A]** el *Bloque de contexto global* (§2), completo;
   - **[B]** los *Contratos compartidos* (§3), completos;
   - **[C]** el prompt de la subtarea (§4.x), desde `▶ INICIO DEL PROMPT` hasta `■ FIN DEL PROMPT`.

   Si la IA tiene acceso al repositorio, basta con escribir: *"Lee `docs/fases/Fase_2_Prompts_Task_Document.md` §2, §3 y §4.x y ejecuta la subtarea 2.x"*.
3. Al terminar, **verifica tú mismo** los criterios de aceptación ejecutando los comandos indicados.
4. Si la IA propone cambiar un contrato de §3, recházalo o escálalo al líder técnico. Si se aprueba, **primero se actualiza este documento** y después el código.
5. Integra a `main` en el orden de la tabla. Antes de cada merge: `npm test` en verde.

### 0.1 Subtareas, dependencias y orden

| ID | Subtarea | Rama | Depende de | Estimación orientativa | Entregable verificable |
|---|---|---|---|---|---|
| 2.1 | Backend: estados de cuenta, auto-registro, paginación y catálogo de bitácora | `feat/f2-1-registro-backend` | F1 en `main` | 5–7 h | Migración 2; `POST /api/auth/register`; login con `ACCOUNT_PENDING`/`ACCOUNT_REJECTED`; `lib/pagination.js` |
| 2.2 | Backend: API de gestión de usuarios (aprobación, CRUD, reset) y perfil propio | `feat/f2-2-usuarios-api` | 2.1 | 7–9 h | `routes/users.js` y `PATCH /api/auth/me` probados; pruebas del Gate F2 |
| 2.3 | Backend: API de bitácora | `feat/f2-3-bitacora-api` | 2.1 | 3–4 h | `GET /api/audit-logs` con filtros y paginación |
| 2.4 | Frontend: registro público, login actualizado y componentes compartidos | `feat/f2-4-registro-frontend` | 2.1 | 5–7 h | `/registro` funcional; `Components.modulePicker`, `Components.paginationBar`, `UI.buildQuery` |
| 2.5 | Frontend: pantalla de Usuarios (solicitudes, alta, edición), perfil editable y refresco de permisos | `feat/f2-5-usuarios-frontend` | 2.2, 2.4 | 9–11 h | `/app#usuarios`, `/app#usuario/7`, contador de pendientes |
| 2.6 | Frontend: visor de bitácora, actividad por usuario, prueba de humo y documentación (Gate F2) | `feat/f2-6-bitacora-gate` | 2.3, 2.5 | 5–7 h | `/app#bitacora`; `PRUEBA DE HUMO OK` con registro y aprobación; docs actualizados |

```text
        ┌──► 2.2 ──────────────┐
2.1 ────┼──► 2.3 ──────────────┼──► 2.6 ──► GATE F2
        └──► 2.4 ──► 2.5 ◄─────┘ (2.5 también requiere 2.2)
```

**Orden de merge a `main`:** 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6. La 2.3 y la 2.4 pueden integrarse en cualquier orden en cuanto pase la 2.1.

### 0.2 Paso 0 estándar (se ejecuta al inicio de CADA subtarea)

```powershell
git checkout main ; git pull
npm install
npm test
git checkout -b <rama-de-la-subtarea>
```

Después, **lee los archivos que la subtarea va a modificar** y comprueba que coinciden con lo que describe este documento (nombres de funciones, firmas, rutas). Si algo quedó distinto en `main` (por una desviación aprobada), **adapta la subtarea a lo que existe**, sin romper los contratos de §3, y repórtalo en la sección E de tu entrega. Si la diferencia impide cumplir un contrato de §3, **detente y repórtalo**.

---

## 1. Objetivo de la Fase 2

Que el sistema pueda **operarse sin scripts**: el personal solicita su propia cuenta, el administrador la revisa y la habilita con los módulos adecuados, gestiona a todos los usuarios desde la interfaz y consulta la bitácora. Al cerrar la fase debe poder demostrarse:

> En el login, "¿No tienes cuenta? Solicítala aquí" → `/registro` → Ana llena sus datos, elige su contraseña, marca **Cartas** y **Calendario** y acepta el compromiso de confidencialidad → "Solicitud enviada" → al intentar entrar ve "Tu solicitud de cuenta está pendiente de aprobación" → el administrador ve el contador **Usuarios (1)**, abre la solicitud, quita Calendario, aprueba → Ana entra con su propia contraseña y solo ve **Cartas** → el administrador le quita Cartas: la API le responde `403` y su menú se actualiza solo → el administrador la desactiva: Ana pierde la sesión en su siguiente acción → todo aparece en la **Bitácora**.

**Gate de la hoja de ruta (se conserva):** un OPERADOR sin `CARTAS` recibe `403` en la API y no ve el menú; un usuario desactivado pierde la sesión de inmediato.

**Fuera del alcance de la Fase 2:** recuperación de contraseña por correo (no hay servidor de correo), notificaciones, permisos de solo lectura por módulo, cuentas para voluntarios o tutores (fase de nube), registro por enlace para escuelas (fase de nube), cualquier módulo de negocio (F3–F7), exportar la bitácora (F7).

---

## 2. [A] Bloque de contexto global — copiar al inicio de CADA prompt

```text
ROL: Eres un desarrollador senior full-stack (Node.js/Express, SQLite y JavaScript sin frameworks)
que trabaja en el proyecto "Sistema de Gestión Soñar Despierto", bajo la dirección de un líder técnico.
Ejecuta ÚNICAMENTE la subtarea indicada y respeta al pie de la letra los "Contratos compartidos".

PROYECTO
- Cliente: Soñar Despierto Veracruz (asociación sin fines de lucro). Organiza eventos de Navidad y
  Día del Niño: voluntarios, niños beneficiarios, escuelas, tutores, cartas de Navidad, calendario de
  actividades e inventario.
- Repositorio Git: "Sonar-Despierto-OS". Sistema operativo objetivo: Windows 10/11. Comandos en
  PowerShell.
- MVP LOCAL: doble clic en SonarDespierto.bat (o en el paquete portátil dist\SonarDespierto) →
  servidor local → navegador en http://localhost:8765 → Login → panel con los módulos permitidos.
  Opcionalmente (LAN_MODE=true) otras 2–3 PCs de la oficina entran por http://<IP-del-anfitrión>:8765.
- ESTADO: la FASE 1 está TERMINADA: server.js (instancia única, puerto libre, banner, modo LAN,
  --reset-admin), SQLite con migraciones (PRAGMA user_version, migración 1), usuarios con permisos por
  módulo, sesión JWT (login, logout, me, change-password), bitácora (audit_logs), login y panel con
  el diseño de Lovable, menú según permisos, paquete portátil con prueba de humo. Esta es la FASE 2.
- FUTURO: migración a la nube (MySQL/PostgreSQL, HTTPS, registro público por enlace para escuelas y
  voluntarios). El SQL vive solo en services/ y sigue las reglas de portabilidad.

STACK (ADR-0009: el mismo de SEMA y My Best DataBase)
- Node.js 22 LTS, Express 4, better-sqlite3 (síncrono, una conexión: getDb()), jsonwebtoken,
  bcryptjs, dotenv. Pruebas: node:test + node:assert/strict. NADA más.
- Capas: routes/<recurso>.js (HTTP: valida y responde) → services/<recurso>.js (casos de uso y TODO
  el SQL, con db.transaction) → lib/ (config, db, migrations, errors, auth, security, modules,
  rate-limit, pagination…). Las rutas no tienen reglas de negocio.
- Errores: throw new AppError(status, 'CODIGO', 'Mensaje en español') o validationError([{ field,
  message }]); la API responde { "error": "mensaje", "code": "CODIGO", "details"?: [...] }. Las
  rutas async se envuelven con wrap(). Permisos con los middlewares requireAuth, requireAdmin,
  requireModule('X') de lib/auth.js (leen la BD en cada petición).
- Base de datos: migraciones numeradas en lib/migrations.js; reglas de portabilidad: enums TEXT +
  CHECK, fechas TEXT ISO 8601 UTC (nowIso()), booleanos INTEGER 0/1, JSON en TEXT, búsquedas con
  lower(col) LIKE @q ESCAPE '\'. Tablas y columnas en inglés; JSON de la API en snake_case.
- Frontend: HTML + CSS + JS sin frameworks ni compilación. public/login.html, public/app.html (vistas
  por hash: /app#vista), public/js/ui-kit.js (UI.api, UI.toast, UI.confirm, UI.formModal, UI.setBusy,
  UI.icon, UI.escape, UI.formatDate), public/js/access.js (vistas, módulos, menú), una vista = un
  archivo IIFE con mount(contenedor, contexto). Colores solo con variables de css/theme.css.
- Acceso (ADR-0004 + ADR-0008): roles ADMIN (todo) y OPERADOR (solo módulos asignados). El PERSONAL
  solicita su propia cuenta en /registro; la cuenta queda PENDIENTE hasta que un ADMIN la aprueba y le
  asigna módulos. Voluntarios, niños y tutores siguen siendo registros SIN cuenta.

REGLAS OBLIGATORIAS
1. Alcance: implementa SOLO lo que pide la subtarea. Si detectas algo necesario fuera de alcance, NO lo
   implementes: déjalo como comentario "TODO(F<fase>): ..." y repórtalo.
2. Contratos: nombres de archivos, rutas, variables de entorno, endpoints, esquemas JSON, códigos y
   mensajes de error, claves de módulo y acciones de bitácora de los "Contratos compartidos" son
   obligatorios. Si uno te parece incorrecto, detente y repórtalo en lugar de improvisar.
3. Idioma: tablas, columnas, rutas y JSON en inglés; textos de interfaz, mensajes de error de la API
   (campo "error") y comentarios en español.
4. Seguridad: nunca escribas en logs, consola ni bitácora contraseñas (ni temporales), hashes ni
   tokens. SQL SIEMPRE con parámetros. Todo dato del usuario o de la BD pasa por UI.escape() antes de
   insertarse en HTML. Los permisos se validan SIEMPRE en el servidor; el frontend solo oculta.
5. Portabilidad: path.join; nada de SQL exclusivo de SQLite en consultas de negocio; todo cambio de
   esquema mediante una migración nueva en lib/migrations.js (nunca edites la 1).
6. Calidad: cada funcionalidad con pruebas en test/*.test.js; las funciones puras del frontend se
   exportan con `if (typeof module !== 'undefined') module.exports = …` para probarlas con node:test.
   Deben pasar "npm test" y "npm run empaquetar".
7. Dependencias: NO agregues dependencias (package.json no cambia). NO uses CDNs: todo se sirve
   desde public/ (el sistema funciona sin internet).
8. No modifiques archivos que pertenecen a otras subtareas, salvo los que tu subtarea enumera.
9. Git: trabaja en la rama indicada; commits pequeños, en español, con prefijo convencional
   (feat:, fix:, chore:, test:, docs:, refactor:, build:).
10. Interfaz: reutiliza las clases de css/base.css y css/app.css (card, panel, btn, badge, alert,
    field, input, empty-state, modal, toast) y los componentes de §3.10; cada pantalla con estados de
    carga, vacío y error, usable a 360 px y en tema claro y oscuro; estados con color + texto.

FORMATO DE TU ENTREGA (al terminar)
A. Resumen de lo realizado (5–10 líneas).
B. Tabla de archivos creados / modificados / eliminados.
C. Salida resumida de los comandos de verificación que ejecutaste.
D. Checklist de criterios de aceptación con ✅/❌ y evidencia de cada uno.
E. Desviaciones respecto al documento (incluidas diferencias encontradas en el Paso 0) y su
   justificación (o "Ninguna").
F. TODOs y riesgos detectados para fases siguientes.
```

---

## 3. [B] Contratos compartidos de la Fase 2 — fuente única de verdad

> El comportamiento de la Fase 1 (`README.md`, `Arquitectura_y_Convenciones.md`) **sigue vigente**. Esta sección define lo nuevo o lo que cambia; ante una contradicción, manda esta sección.

### 3.1 Archivos nuevos y modificados en la Fase 2

Entre corchetes, la subtarea responsable. Rutas relativas a la raíz del repositorio.

```text
docs/
├── Roadmap_Fases.md                                  [2.6]  (F2 ✅ con la fecha)
└── API_Spec.md, Modelo_Datos.md, Pantallas_UI.md     [2.6]
.env.example, config.env.template                     [2.1, 2.6]
lib/
├── config.js                                         [2.1]  (+3 variables)
├── modules.js                                        [2.1]  (+ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS)
├── migrations.js                                     [2.1]  (+migración 2)
├── audit-actions.js                                  [2.1]  AUDIT_ACTIONS, AUDIT_ACTION_LABELS
├── pagination.js                                     [2.1]  parsePageParams, paginate, likePattern
├── validation.js                                     [2.1]  normalizePhone, isEmail, campos de texto
└── app.js                                            [2.1, 2.2, 2.3, 2.4]  (montar rutas y /registro)
services/
├── audit.js                                          [2.1, 2.3]
├── auth.js                                           [2.1, 2.2]
└── users.js                                          [2.1, 2.2]
routes/
├── auth.js                                           [2.1, 2.2]
├── users.js                                          [2.2]
└── audit-logs.js                                     [2.3]
test/
├── register.test.js, login-account-status.test.js, pagination.test.js, audit-actions.test.js,
│   migrations.test.js                                [2.1]
├── users-api.test.js, admin-rules.test.js, gate-f2.test.js, profile.test.js   [2.2]
├── audit-api.test.js                                 [2.3]
├── frontend-utils.test.js                            [2.4, 2.5, 2.6]  (funciones puras del navegador)
└── helpers.js                                        [2.1, 2.2]  (fixtures nuevos)
public/
├── registro.html                                     [2.4]
├── login.html                                        [2.4]
├── app.html                                          [2.5, 2.6]  (cargar vistas nuevas)
├── css/app.css                                       [2.4, 2.5, 2.6]  (estilos de las vistas nuevas)
└── js/
    ├── ui-kit.js                                     [2.4, 2.5]  (UI.buildQuery; manejador de 403)
    ├── access.js                                     [2.4, 2.5, 2.6]  (estados de cuenta, vistas nuevas)
    ├── components.js                                 [2.4, 2.5]  modulePicker, paginationBar, passwordStrength, secretReveal
    ├── phone.js                                      [2.4]  normalizePhone, isValidPhone, formatPhone
    ├── fechas.js                                     [2.5, 2.6]  formatos y rangos en America/Mexico_City
    ├── registro.js, login.js                         [2.4]
    ├── app.js                                        [2.5, 2.6]  (hash con parámetros, contador, refresco de permisos)
    ├── inicio.js, perfil.js                          [2.5]
    ├── usuarios.js, usuario-detalle.js, usuarios-dialogos.js   [2.5]  (+actividad en 2.6)
    ├── audit.js                                      [2.6]  etiquetas, grupos, describeAuditDetail
    └── bitacora.js                                   [2.6]
scripts/empaquetar.js                                 [2.6]  (prueba de humo ampliada)
LEEME_USUARIO.txt, README.md                          [2.6]
```

### 3.2 Configuración nueva (`lib/config.js`)

| Variable | Propiedad en `getConfig()` | Tipo | Por defecto | Descripción |
|---|---|---|---|---|
| `REGISTRATION_ENABLED` | `registrationEnabled` | bool | `true` | `false` → `POST /api/auth/register` responde `403 REGISTRATION_DISABLED` y el login oculta el enlace |
| `REGISTER_MAX_ATTEMPTS` | `registerMaxAttempts` | int | `5` | Solicitudes de registro permitidas por IP… |
| `REGISTER_WINDOW_MINUTES` | `registerWindowMinutes` | int | `60` | …dentro de esta ventana |

### 3.3 Estados de cuenta (`lib/modules.js`)

Se agrega junto a `USER_ROLES` y `MODULE_KEYS` (que no cambian):

```js
const ACCOUNT_STATUSES = Object.freeze(['PENDIENTE', 'APROBADA', 'RECHAZADA']);
const ACCOUNT_STATUS_LABELS = Object.freeze({
  PENDIENTE: 'pendiente de aprobación',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada'
});
```

**Máquina de estados:**

```text
 POST /api/auth/register ──► PENDIENTE ──approve──► APROBADA ◄──approve── RECHAZADA
                                │                     │  ▲                    ▲
                                ├──reject─────────────┼──┼────────────────────┘
                                │                     │  └─ PATCH is_active=true  (activar)
                                │                     └──── PATCH is_active=false (desactivar)
                                └──DELETE (también desde RECHAZADA) ──► se elimina la fila
 POST /api/users, admin inicial, npm run create-user ──► APROBADA directamente
```

**Reglas:**

1. **Invariante:** `account_status ≠ 'APROBADA' ⇒ is_active = 0`. Lo garantiza el servicio y lo verifica una prueba.
2. El valor por defecto de la columna es `'APROBADA'` (así `createUser` de la Fase 1, el admin inicial y `POST /api/users` no cambian). Solo el registro crea `PENDIENTE`.
3. **Login** (después de verificar la contraseña, en este orden): `PENDIENTE` → `403 ACCOUNT_PENDING`; `RECHAZADA` → `403 ACCOUNT_REJECTED`; `is_active = 0` → `403 ACCOUNT_DISABLED`. Las tres auditan `LOGIN_FAILED` con `detail.reason` = `"pending"`, `"rejected"` o `"disabled"` y **no** cuentan como fallo para el límite de intentos. Con contraseña incorrecta: siempre `401 INVALID_CREDENTIALS`.
4. `PATCH /api/users/:id` y `reset-password` solo aplican a cuentas `APROBADA`. `approve` aplica a `PENDIENTE` y `RECHAZADA`; `reject` solo a `PENDIENTE`; `DELETE` solo a `PENDIENTE` y `RECHAZADA`. Cualquier otro caso → `400 INVALID_ACCOUNT_STATE`.
5. Un ADMIN **no puede** sobre su propia cuenta: cambiar su rol, desactivarse, restablecer su contraseña por esta vía ni eliminarse → `400 SELF_ACTION_FORBIDDEN`.
6. Siempre debe quedar **al menos un ADMIN `APROBADA` y activo**: cualquier cambio que lo impida → `400 LAST_ADMIN`.
7. Los permisos se leen de la BD en **cada** petición (Fase 1): agregar o quitar módulos tiene efecto inmediato en la API sin cerrar sesión. Desactivar o cambiar el rol incrementa `token_version` (cierra la sesión en todas las PCs).

### 3.4 Modelo de datos — migración 2 en `lib/migrations.js`

```js
{
  version: 2,
  name: 'registro y aprobación de cuentas',
  up: `
    ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'APROBADA'
      CHECK (account_status IN ('PENDIENTE', 'APROBADA', 'RECHAZADA'));
    ALTER TABLE users ADD COLUMN requested_modules TEXT;            -- JSON: ["CARTAS", ...]
    ALTER TABLE users ADD COLUMN registration_note TEXT;            -- ≤ 500
    ALTER TABLE users ADD COLUMN confidentiality_accepted_at TEXT;  -- ISO UTC
    ALTER TABLE users ADD COLUMN reviewed_by_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN reviewed_at TEXT;
    ALTER TABLE users ADD COLUMN review_note TEXT;                  -- nota de aprobación o motivo del rechazo
    CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status);
  `
}
```

- Las filas existentes quedan `APROBADA` por el `DEFAULT`.
- Las migraciones son **solo hacia adelante** (como SEMA): no hay `downgrade`; para volver atrás se restaura un respaldo de `sonar.db`.
- En `services/users.js`, `toUserOut()` convierte `requested_modules` de texto JSON a arreglo (`[]` si es `NULL`) y las fechas con `toIso()`.

### 3.5 Catálogo de acciones de bitácora (`lib/audit-actions.js`)

```js
const AUDIT_ACTIONS = Object.freeze([
  'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET',
  'ACCOUNT_REQUESTED', 'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED',
  'USER_CREATED', 'USER_UPDATED', 'ROLE_CHANGED', 'PERMISSIONS_CHANGED',
  'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_DELETED', 'PROFILE_UPDATED'
]);

const AUDIT_ACTION_LABELS = Object.freeze({
  LOGIN: 'Inicio de sesión',
  LOGIN_FAILED: 'Intento de acceso fallido',
  LOGOUT: 'Cierre de sesión',
  PASSWORD_CHANGED: 'Cambio de contraseña',
  PASSWORD_RESET: 'Contraseña restablecida',
  ACCOUNT_REQUESTED: 'Solicitud de cuenta',
  ACCOUNT_APPROVED: 'Cuenta aprobada',
  ACCOUNT_REJECTED: 'Cuenta rechazada',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Datos de usuario modificados',
  ROLE_CHANGED: 'Cambio de rol',
  PERMISSIONS_CHANGED: 'Cambio de módulos',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_DELETED: 'Solicitud eliminada',
  PROFILE_UPDATED: 'Perfil actualizado'
});
```

`audit_logs.user_id` es **quién hizo la acción** (el actor); el objeto afectado va en `entity` + `entity_id` (en la F2 siempre `entity = 'users'`). Las fases siguientes **agregan** valores a este catálogo (y a su espejo `public/js/audit.js`).

**Contenido de `detail` por acción** (nunca contraseñas, hashes ni tokens; para cambios de datos personales, solo los **nombres** de los campos):

| Acción | `user_id` (actor) | `entity_id` | `detail` |
|---|---|---|---|
| `ACCOUNT_REQUESTED` | id de la cuenta nueva | id de la cuenta nueva | `{"email", "requested_modules": [...]}` |
| `ACCOUNT_APPROVED` | ADMIN | cuenta | `{"role", "modules": [...], "requested_modules": [...]}` |
| `ACCOUNT_REJECTED` | ADMIN | cuenta | `{"reason": "..."}` |
| `USER_CREATED` | ADMIN | cuenta | `{"email", "role", "modules": [...]}` |
| `USER_UPDATED` / `PROFILE_UPDATED` | ADMIN / la propia persona | cuenta | `{"changed": ["first_name", "phone"]}` |
| `ROLE_CHANGED` | ADMIN | cuenta | `{"from": "OPERADOR", "to": "ADMIN"}` |
| `PERMISSIONS_CHANGED` | ADMIN | cuenta | `{"added": ["CARTAS"], "removed": ["INVENTARIO"]}` |
| `USER_ACTIVATED` / `USER_DEACTIVATED` | ADMIN | cuenta | `null` |
| `PASSWORD_RESET` | ADMIN (o `null` desde `--reset-admin`) | cuenta | `{"via": "admin"}` o `{"via": "cli"}` |
| `USER_DELETED` | ADMIN | id que tenía la cuenta | `{"email", "account_status"}` |

### 3.6 Paginación compartida (`lib/pagination.js`)

Contrato de todos los listados desde la Fase 2 en adelante:

```js
const MAX_PAGE_SIZE = 100;

/**
 * Lee ?page=1&page_size=20 de req.query. page ≥ 1; 1 ≤ page_size ≤ 100.
 * Valores inválidos → validationError([{ field: 'page' | 'page_size', message: '…' }]).
 * → { page, pageSize, offset }
 */
function parsePageParams(query, { defaultPageSize = 20 } = {});

/**
 * Ejecuta el conteo (sin ORDER BY) y la página pedida. `where` usa parámetros con nombre (@x).
 *   paginate(db, {
 *     select: 'u.*', from: 'users u', where: 'u.account_status = @status', params: { status },
 *     orderBy: 'u.created_at DESC, u.id DESC', map: toUserOut
 *   }, pageParams)
 * → { items, total, page, page_size, pages }   (pages = 0 si total = 0; página fuera de rango → items: [])
 */
function paginate(db, { select, from, where = '', params = {}, orderBy, map }, { page, pageSize, offset });

/** '%texto%' en minúsculas, escapando \, % y _ (usar con: lower(col) LIKE @q ESCAPE '\'). */
function likePattern(text);
```

Respuesta paginada (igual que `API_Spec.md` §1.4): `{ "items": [...], "total": 134, "page": 1, "page_size": 20, "pages": 7 }`.

### 3.7 Contrato de la API de la Fase 2 (base `/api`)

Los endpoints de la Fase 1 se conservan; el login agrega dos errores y `/auth/me` agrega el campo `phone`.

| # | Método y ruta | Acceso | Respuesta OK | Errores |
|---|---|---|---|---|
| 1 | `POST /api/auth/login` *(cambia)* | público | `200 { token, expires_in, user }` | + `403 ACCOUNT_PENDING`, `403 ACCOUNT_REJECTED` |
| 2 | `GET /api/auth/registration-info` | público | `200 {"enabled": true}` | — |
| 3 | `POST /api/auth/register` | público | `201 RegisterResponse` | `403 REGISTRATION_DISABLED`, `409 EMAIL_ALREADY_EXISTS`, `422`, `429 TOO_MANY_REQUESTS` |
| 4 | `PATCH /api/auth/me` | autenticado (`requireAuth`) | `200 { user }` | `401`, `403 PASSWORD_CHANGE_REQUIRED`, `422` |
| 5 | `GET /api/users` | ADMIN | `200 Page<UserOut>` | `401`, `403 FORBIDDEN`, `422` |
| 6 | `GET /api/users/summary` | ADMIN | `200 UsersSummary` | `401`, `403` |
| 7 | `POST /api/users` | ADMIN | `201 UserCreatedResponse` | `409 EMAIL_ALREADY_EXISTS`, `422` |
| 8 | `GET /api/users/:id` | ADMIN | `200 { user: UserDetail }` | `404 NOT_FOUND` |
| 9 | `PATCH /api/users/:id` | ADMIN | `200 { user: UserDetail }` | `400 INVALID_ACCOUNT_STATE`, `400 SELF_ACTION_FORBIDDEN`, `400 LAST_ADMIN`, `404`, `422` |
| 10 | `POST /api/users/:id/approve` | ADMIN | `200 { user: UserDetail }` | `400 INVALID_ACCOUNT_STATE`, `404`, `422` |
| 11 | `POST /api/users/:id/reject` | ADMIN | `200 { user: UserDetail }` | `400 INVALID_ACCOUNT_STATE`, `404`, `422` |
| 12 | `POST /api/users/:id/reset-password` | ADMIN | `200 TemporaryPasswordResponse` | `400 INVALID_ACCOUNT_STATE`, `400 SELF_ACTION_FORBIDDEN`, `404` |
| 13 | `DELETE /api/users/:id` | ADMIN | `204` | `400 INVALID_ACCOUNT_STATE`, `400 SELF_ACTION_FORBIDDEN`, `404` |
| 14 | `GET /api/audit-logs` | ADMIN | `200 Page<AuditLogOut>` | `401`, `403`, `422` |

`routes/users.js` y `routes/audit-logs.js` se montan con `requireAdmin` (que ya incluye `PASSWORD_CHANGE_REQUIRED` si aplica): `app.use('/api/users', requireAdmin, require('../routes/users'))`. `/summary` se declara **antes** de `/:id`. `:id` no numérico → `404 NOT_FOUND`. Las respuestas que contienen `temporary_password` llevan la cabecera `Cache-Control: no-store`.

**Esquemas** (JSON en `snake_case`)

```jsonc
// RegisterRequest (POST /api/auth/register)
{
  "first_name": "Ana",                       // 1–80, se recortan espacios
  "last_name": "López Pérez",                // 1–120
  "email": "ana@correo.com",                 // formato de correo; se guarda en minúsculas
  "phone": "229 123 4567",                   // se quitan espacios y guiones → exactamente 10 dígitos
  "password": "Segura123",                   // política de la Fase 1
  "requested_modules": ["CARTAS", "CALENDARIO"],  // 0–7 claves de MODULE_KEYS; se eliminan duplicados; default []
  "note": "Coordino el acopio de la zona norte.", // opcional, ≤ 500
  "accepts_confidentiality": true            // obligatorio y debe ser true
}

// RegisterResponse (201) — NO incluye token ni el id
{
  "email": "ana@correo.com",
  "account_status": "PENDIENTE",
  "message": "Tu solicitud fue enviada. Un administrador debe aprobarla antes de que puedas iniciar sesión."
}

// UserMe (Fase 1) — se AGREGA "phone": "2291234567" | null

// ProfileUpdateRequest (PATCH /api/auth/me) — al menos un campo; cualquier otro campo → 422
{ "first_name": "Ana", "last_name": "López Pérez", "phone": "2291234567" }   // phone acepta null para borrarlo

// UserRef (uso interno en otros esquemas)
{ "id": 1, "full_name": "Administrador General", "email": "admin@sonardespierto.org" }

// UserOut (listados)
{
  "id": 7,
  "email": "ana@correo.com",
  "first_name": "Ana",
  "last_name": "López Pérez",
  "full_name": "Ana López Pérez",
  "phone": "2291234567",
  "role": "OPERADOR",
  "account_status": "APROBADA",
  "is_active": true,
  "must_change_password": false,
  "modules": ["CARTAS"],                      // efectivos (ADMIN → los 7)
  "requested_modules": ["CARTAS", "CALENDARIO"],
  "last_login_at": "2026-10-20T15:02:11.000Z",    // o null
  "created_at": "2026-10-18T17:40:00.000Z"
}

// UserDetail = UserOut + :
{
  "registration_note": "Coordino el acopio de la zona norte.",
  "confidentiality_accepted_at": "2026-10-18T17:40:00.000Z",
  "reviewed_by": { /* UserRef */ },           // o null
  "reviewed_at": "2026-10-18T18:05:00.000Z",  // o null
  "review_note": "Por ahora solo cartas.",    // o null
  "updated_at": "2026-10-18T18:05:00.000Z"
}

// UsersSummary
{ "pending": 3, "active": 12, "inactive": 2, "rejected": 1, "admins": 2 }
// pending = PENDIENTE; active = APROBADA y activa; inactive = APROBADA e inactiva; rejected = RECHAZADA;
// admins = ADMIN APROBADA y activa

// UserCreateRequest (POST /api/users) — la contraseña la genera el servidor
{ "email": "luis@correo.com", "first_name": "Luis", "last_name": "Ramos", "phone": null,
  "role": "OPERADOR", "modules": ["VOLUNTARIOS"] }

// UserCreatedResponse (201)
{ "user": { /* UserDetail */ }, "temporary_password": "K7mXq4Tr9wZa" }

// UserUpdateRequest (PATCH /api/users/:id) — todos opcionales, al menos uno
{ "first_name": "Ana", "last_name": "López", "phone": null,
  "role": "OPERADOR", "modules": ["CARTAS", "EVENTOS"], "is_active": true }
// "modules" REEMPLAZA el conjunto. Se ignora (y no se guarda) si el rol resultante es ADMIN.

// ApproveRequest (POST /api/users/:id/approve)
{ "role": "OPERADOR", "modules": ["CARTAS"], "note": "Por ahora solo cartas." }
// role default "OPERADOR"; modules OBLIGATORIO (puede ser []); note opcional ≤ 500

// RejectRequest (POST /api/users/:id/reject)
{ "reason": "No forma parte del equipo de este año." }   // obligatorio, 5–500

// TemporaryPasswordResponse (POST /api/users/:id/reset-password)
{ "temporary_password": "P3hn8Wkd2Tqa",
  "message": "Comparte esta contraseña temporal con la persona. Deberá cambiarla al iniciar sesión." }

// AuditLogOut
{
  "id": 120,
  "created_at": "2026-10-18T18:05:00.000Z",
  "action": "ACCOUNT_APPROVED",
  "entity": "users",
  "entity_id": 7,
  "actor": { /* UserRef */ },                 // o null (sistema, CLI o intento con correo inexistente)
  "detail": { "role": "OPERADOR", "modules": ["CARTAS"], "requested_modules": ["CARTAS", "CALENDARIO"] },
  "ip_address": "127.0.0.1"
}
```

**Parámetros de consulta**

| Endpoint | Parámetros |
|---|---|
| `GET /api/users` | `page`, `page_size`; `search` (nombre, apellidos, nombre completo o correo; sin distinguir mayúsculas; `%` y `_` literales); `role`; `account_status`; `is_active` (`true`/`false`); `module` (clave de módulo: usuarios que **efectivamente** lo tienen: ADMIN u OPERADOR con ese permiso, y `APROBADA`); `order_by` ∈ {`created_at`, `-created_at` (default), `last_name`, `-last_name`, `last_login_at`, `-last_login_at`} (otro valor → `422`). Desempate siempre por `id`. |
| `GET /api/audit-logs` | `page`, `page_size` (default **50** para este endpoint); `action` (repetible: `?action=LOGIN&action=LOGOUT`; valores de `AUDIT_ACTIONS`); `entity`; `entity_id`; `actor_id`; `date_from`, `date_to` (ISO 8601; se convierten a UTC; `date_from` incluido, `date_to` **excluido**; `date_to ≤ date_from` → `422`). Orden: `created_at` desc, `id` desc. |

> Express entrega `?action=A&action=B` como arreglo y `?action=A` como texto: normalízalo con `[].concat(req.query.action ?? [])`.

**Reglas de validación del registro** (mensajes exactos en `details[].message` del `422`; `lib/validation.js`):

| Campo | Regla | Mensaje |
|---|---|---|
| `first_name` / `last_name` | obligatorio tras recortar; ≤ 80 / ≤ 120 | `Este campo es obligatorio.` / `Máximo {n} caracteres.` |
| `phone` | 10 dígitos tras quitar espacios y guiones | `El teléfono debe tener 10 dígitos.` |
| `password` | política de la Fase 1 | `La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número.` |
| `accepts_confidentiality` | debe ser `true` | `Debes aceptar el compromiso de confidencialidad.` |
| `requested_modules` | arreglo de claves de `MODULE_KEYS` | `Módulo no válido.` |
| `email` | formato de correo (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, ≤ 255) | `Escribe un correo electrónico válido.` |
| `note` | ≤ 500 | `Máximo 500 caracteres.` |

El campo `phone` de `ProfileUpdateRequest`, `UserCreateRequest` y `UserUpdateRequest` usa la misma validación cuando no es `null`. Los cuerpos con campos desconocidos en `PATCH /api/auth/me` y `PATCH /api/users/:id` → `422` con `{ field: '<campo>', message: 'Campo no permitido.' }`; cuerpo vacío → `422` con `{ field: 'body', message: 'Envía al menos un campo para actualizar.' }`.

### 3.8 Catálogo de códigos de error — nuevos en la Fase 2

| HTTP | `code` | `error` (texto exacto) |
|---|---|---|
| 403 | `ACCOUNT_PENDING` | Tu solicitud de cuenta está pendiente de aprobación. Un administrador debe revisarla. |
| 403 | `ACCOUNT_REJECTED` | Tu solicitud de cuenta fue rechazada. Contacta al administrador. |
| 403 | `REGISTRATION_DISABLED` | El registro de cuentas está desactivado. Contacta al administrador. |
| 400 | `INVALID_ACCOUNT_STATE` | Esta acción no está disponible para una cuenta {estado}. *(con `ACCOUNT_STATUS_LABELS`, p. ej. "…para una cuenta pendiente de aprobación.")* |
| 400 | `SELF_ACTION_FORBIDDEN` | No puedes realizar esta acción sobre tu propia cuenta. |
| 400 | `LAST_ADMIN` | Debe existir al menos un administrador activo. |
| 404 | `NOT_FOUND` | No existe un usuario con ese identificador. *(solo en `/api/users/:id`)* |
| 429 | `TOO_MANY_REQUESTS` | Demasiadas solicitudes de registro desde este equipo. Intenta de nuevo en {n} minutos. *(solo en el registro; incluye `Retry-After`)* |
| 409 | `EMAIL_ALREADY_EXISTS` | Ya existe un usuario con ese correo. *(ya existía; ahora también lo usa el registro)* |

### 3.9 Pantallas — nuevas o modificadas

`/` (login) y `/registro` son páginas; dentro de `/app` las vistas van por hash con el formato **`#<vista>[/<id>][?<parámetros>]`** (p. ej. `#usuarios?tab=solicitudes`, `#usuario/7`, `#bitacora?desde=2026-10-01&accion=LOGIN`). `app.js` (2.5) separa vista, id y parámetros y los pasa a `mount(contenedor, { user, view, id, params, navigate })`; `navigate(params)` actualiza el hash (los valores vacíos se omiten), así funcionan el botón atrás y el enlace directo.

| Ruta | Acceso | Contenido |
|---|---|---|
| `/` *(cambia)* | público | Enlace "¿No tienes cuenta? **Solicítala aquí**" → `/registro` (si el registro está habilitado); aviso de cuenta pendiente con tono informativo |
| `/registro` | público (con sesión → `/app`) | `public/registro.html`: formulario de solicitud de cuenta y pantalla de "Solicitud enviada" |
| `/app#inicio` *(cambia)* | autenticado | ADMIN: aviso "Tienes N solicitudes de cuenta por revisar" si hay pendientes |
| `/app#perfil` *(cambia)* | autenticado | Nombre, apellidos y teléfono editables |
| `/app#usuarios` | solo ADMIN | Pestañas **Solicitudes** y **Usuarios**; alta; acciones. Parámetros: `tab` (`solicitudes` \| `usuarios`), `estado` (Solicitudes: `PENDIENTE` default \| `RECHAZADA`; Usuarios: `activos` default \| `inactivos` \| `todos`), `q`, `rol`, `modulo`, `page` |
| `/app#usuario/<id>` | solo ADMIN | Detalle de la cuenta (+ actividad en la 2.6) |
| `/app#bitacora` | solo ADMIN | Visor de bitácora. Parámetros: `desde`, `hasta` (`YYYY-MM-DD`, días en hora de Veracruz; default: últimos 7 días incluido hoy), `accion`, `usuario` (id del actor), `objeto` (id de la cuenta afectada), `page` |

**Menú (`public/js/access.js`):**
- [2.5] la vista `usuarios` deja de ser "Próximamente"; se agrega `{ key: 'usuario', hidden: true, adminOnly: true }`. `app.js` pinta junto a "Usuarios" una píldora coral con el número de solicitudes pendientes (`aria-label="N solicitudes pendientes"`).
- [2.6] se agrega `{ key: 'bitacora', label: 'Bitácora', icon: 'scroll', adminOnly: true, section: 'Administración' }` **después** de Usuarios.

### 3.10 Componentes y utilidades compartidas del frontend

```text
public/js/ui-kit.js     UI.buildQuery(params)             [2.4]  "?a=1&b=x&b=y"; omite undefined, null y ""; arreglos repetidos; "" si no hay nada
                        UI.onForbidden(handler)           [2.5]  ante 403 MODULE_FORBIDDEN o FORBIDDEN llama handler(code) y luego lanza
public/js/components.js Components.modulePicker(el, opts) [2.4]  → { getValue(), setValue(list), setDisabled(bool) }
                        Components.paginationBar(opts)    [2.4]  → HTMLElement
                        Components.passwordStrength(input)[2.4]  (se extrae de cambiar-contrasena.js)
                        Components.secretReveal(opts)     [2.5]  → HTMLElement
public/js/phone.js      Phone.normalize, Phone.isValid, Phone.format   [2.4]
public/js/fechas.js     Fechas.formatDateTime, formatDate, formatRelative, todayLocal,
                        daysAgoLocal, localDayRangeToUtc   [2.5, 2.6]
public/js/audit.js      AUDIT_ACTIONS, AUDIT_ACTION_LABEL, AUDIT_ACTION_GROUP, ENTITY_LABEL,
                        auditActionLabel, describeAuditDetail   [2.6]
```

Las funciones puras (`UI.buildQuery`, `Phone`, `Fechas`, `audit.js`, `Access`) se exportan para `node:test` como ya hace `access.js` (`if (typeof module !== 'undefined') module.exports = …`); `ui-kit.js` expone `buildQuery` también como `module.exports.buildQuery`.

Llamadas a la API: **siempre** con `UI.api()` desde la vista (no hay caché global; cada vista recarga al montarse). **Nunca** guardes `temporary_password` en `sessionStorage`, `localStorage`, variables globales ni en la consola: solo vive en el componente `secretReveal` mientras está abierto.

---

## 4. [C] Prompts por subtarea

---

### 4.1 Subtarea 2.1 — Backend: estados de cuenta, auto-registro, paginación y catálogo de bitácora

`▶ INICIO DEL PROMPT 2.1`

**Rama:** `feat/f2-1-registro-backend` · **Depende de:** F1 en `main` · Ejecuta primero el **Paso 0 estándar** (§0.2)

#### Objetivo
Agregar los estados de cuenta a `users` (migración 2), el registro público `POST /api/auth/register` con límite por IP, `GET /api/auth/registration-info`, los nuevos rechazos del login (`ACCOUNT_PENDING`, `ACCOUNT_REJECTED`), el campo `phone` en `UserMe`, el catálogo de acciones de bitácora y la paginación compartida que usarán todos los listados.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `lib/audit-actions.js`, `lib/pagination.js`, `lib/validation.js`, `test/register.test.js`, `test/login-account-status.test.js`, `test/pagination.test.js`, `test/audit-actions.test.js`, `test/migrations.test.js` |
| Modificar | `.env.example`, `lib/config.js`, `lib/modules.js`, `lib/migrations.js`, `services/audit.js`, `services/users.js`, `services/auth.js`, `routes/auth.js`, `test/helpers.js`, `test/db.test.js` (solo si alguna aserción depende de la versión 1) |

#### Especificación

**1. Configuración.** Agrega a `lib/config.js` las 3 propiedades de §3.2 (con `toBool`/`toInt`) y a `.env.example`:
```ini
# Registro de cuentas del personal (ADR-0008). false = solo el administrador crea cuentas.
REGISTRATION_ENABLED=true
REGISTER_MAX_ATTEMPTS=5
REGISTER_WINDOW_MINUTES=60
```

**2. `lib/modules.js`** — agrega y exporta `ACCOUNT_STATUSES` y `ACCOUNT_STATUS_LABELS` exactamente como en §3.3.

**3. `lib/audit-actions.js`** — exactamente §3.5. En `services/audit.js`, `recordAudit({ action, … })` lanza `Error('Acción de bitácora desconocida: X')` si `action` no está en `AUDIT_ACTIONS` (así ninguna fase escribe acciones fuera del catálogo). `sanitize` ya limpia claves sensibles anidadas: no lo cambies.

**4. `lib/pagination.js`** — exactamente §3.6.

**5. `lib/validation.js`**
```js
normalizePhone(raw)           // null/'' → null; quita espacios y guiones; si no son 10 dígitos lanza Error
isEmail(text)                 // §3.7
textField(body, name, { required, max })  // devuelve el texto recortado o null; acumula errores en un arreglo
collect()                     // helper para acumular [{ field, message }] y lanzar validationError si hay
```
(Firmas orientativas: lo obligatorio es que los mensajes sean los de §3.7 y que las rutas acumulen **todos** los errores del cuerpo antes de responder `422`.)

**6. Migración 2** — en `lib/migrations.js`, exactamente §3.4.

**7. `services/users.js`** — agrega:
```js
createPendingAccount({ email, password, firstName, lastName, phone, requestedModules, note, ip }) → user
  // correo duplicado (en CUALQUIER estado) → AppError(409, 'EMAIL_ALREADY_EXISTS', …);
  // role 'OPERADOR', account_status 'PENDIENTE', is_active 0, must_change_password 0,
  // requested_modules = JSON de normalizeModules(...), confidentiality_accepted_at = nowIso(),
  // SIN filas en user_module_permissions; audita ACCOUNT_REQUESTED (actor = la cuenta nueva) en la
  // misma transacción.
```
`effectiveModules(user)` devuelve `[]` si `account_status !== 'APROBADA'` o `!is_active` (defensa adicional). `toUserMe` agrega `phone`.

**8. `services/auth.js`**
- `registerLimiter = new RateLimiter({ max: config.registerMaxAttempts, windowMs: config.registerWindowMinutes * 60e3 })`, exportado junto a `loginLimiter`. Clave: `` `${ip}|__register__` ``.
- `login`: sustituye la rama de cuenta desactivada por la regla 3 de §3.3 (`PENDIENTE` → `ACCOUNT_PENDING`; `RECHAZADA` → `ACCOUNT_REJECTED`; inactiva → `ACCOUNT_DISABLED`), cada una con su `LOGIN_FAILED` + `detail.reason` y sin `registerFailure`.
- `register(data, ip)`:
  1. `!config.registrationEnabled` → `AppError(403, 'REGISTRATION_DISABLED', …)`;
  2. `registerLimiter.retryAfter(key)` → `AppError(429, 'TOO_MANY_REQUESTS', \`Demasiadas solicitudes de registro desde este equipo. Intenta de nuevo en ${Math.ceil(seg / 60)} minutos.\`, { headers: { 'Retry-After': String(seg) } })`;
  3. `registerLimiter.registerFailure(key)` ← cuenta **toda** solicitud válida que llega al servicio;
  4. `users.createPendingAccount(...)` (409 si el correo existe);
  5. devuelve `RegisterResponse` con el mensaje exacto de §3.7.
- `requireAuth` y el token ya rechazan cuentas inactivas; como `PENDIENTE`/`RECHAZADA` implican `is_active = 0`, no cambian (agrega una prueba que lo confirme).

**9. `routes/auth.js`**

| Ruta | Middleware | Respuesta |
|---|---|---|
| `GET /registration-info` | — | `{ enabled }` |
| `POST /register` | — | `201 RegisterResponse` (valida con `lib/validation.js` antes de llamar al servicio) |

**10. `test/helpers.js`** — `resetDb()` también reinicia `registerLimiter`. Agrega `registerPayload(overrides)` (cuerpo válido con correo único por llamada) y `withConfig(overrides, fn)` si necesitas probar `REGISTRATION_ENABLED=false` (o prueba ese caso en un archivo propio que fije la variable antes de requerir `helpers.js`).

#### Pruebas obligatorias

| Archivo | Casos |
|---|---|
| `register.test.js` | registro válido → 201 con el mensaje exacto, sin `token`; en BD: `PENDIENTE`, `is_active=0`, `must_change_password=0`, `role=OPERADOR`, sin permisos, `requested_modules` deduplicado y ordenado, `confidentiality_accepted_at` presente; correo con mayúsculas se guarda en minúsculas; teléfono `"229-123 4567"` → `"2291234567"`; teléfono de 9 dígitos, contraseña débil, módulo inexistente, `accepts_confidentiality=false`, correo inválido → 422 con el mensaje exacto de cada uno (y todos juntos en un solo 422); correo existente (aprobado o pendiente) → 409; el registro audita `ACCOUNT_REQUESTED` sin la contraseña; 5 solicitudes y la 6.ª → 429 con `Retry-After`; `REGISTRATION_ENABLED=false` → 403 `REGISTRATION_DISABLED` y `registration-info` → `{ enabled: false }` |
| `login-account-status.test.js` | pendiente + contraseña correcta → 403 `ACCOUNT_PENDING`; rechazada → 403 `ACCOUNT_REJECTED`; pendiente + contraseña incorrecta → 401 `INVALID_CREDENTIALS`; los 403 auditan `LOGIN_FAILED` con `reason` y no bloquean (6 intentos pendientes seguidos no dan 429); `effectiveModules` de una cuenta pendiente es `[]`; `/api/auth/me` incluye `phone`; un token fabricado para una cuenta pendiente → 401 |
| `pagination.test.js` | con 45 filas: `page_size=20` → 3 páginas, la 3.ª con 5; página 4 → `items=[]`, `total=45`; 0 filas → `pages=0`; `page_size=101`, `page=0` y `page=abc` → `validationError`; `likePattern("50%_a")` escapa `%` y `_` y encuentra el texto literal |
| `audit-actions.test.js` | cada acción tiene etiqueta; `recordAudit` con una acción fuera del catálogo lanza; `detail` anidado con `temporary_password` sale limpio |
| `migrations.test.js` | BD nueva → `user_version = 2`; una BD en versión 1 con un usuario → migra a 2 y la fila queda `APROBADA`; `account_status='X'` → error `CHECK`; borrar al revisor deja `reviewed_by_id` en `NULL`; migrar dos veces no hace nada |

Todas las pruebas de la Fase 1 deben seguir pasando (ajusta solo lo que cambie por `phone` en `UserMe`).

#### Comandos de verificación
```powershell
npm test
npm run dev
# En otra terminal (PowerShell):
Invoke-RestMethod -Method Post -Uri http://localhost:8765/api/auth/register -ContentType 'application/json' -Body '{"first_name":"Ana","last_name":"Prueba","email":"ana@correo.com","phone":"2291234567","password":"Segura123","requested_modules":["CARTAS"],"accepts_confidentiality":true}'
# → 201; después, login con esa cuenta → 403 ACCOUNT_PENDING
```

#### Fuera de alcance
Aprobar, rechazar o listar cuentas (2.2); listar la bitácora (2.3); cualquier pantalla (2.4+).

#### Criterios de aceptación
- [ ] Migración 2 aplicada en BD nueva y en BD existente; las cuentas existentes quedan `APROBADA`.
- [ ] `POST /api/auth/register` cumple §3.7 y §3.8 (mensajes exactos) y nunca devuelve token.
- [ ] El login distingue pendiente / rechazada / desactivada solo con la contraseña correcta.
- [ ] Ninguna acción de bitácora fuera de `AUDIT_ACTIONS` en `services/`.
- [ ] `lib/pagination.js` listo para la 2.2 y la 2.3.
- [ ] `npm test` en verde.

**Commit final sugerido:** `feat: estados de cuenta y auto-registro del personal con aprobación pendiente`

`■ FIN DEL PROMPT 2.1`

---

### 4.2 Subtarea 2.2 — Backend: API de gestión de usuarios y perfil propio

`▶ INICIO DEL PROMPT 2.2`

**Rama:** `feat/f2-2-usuarios-api` · **Depende de:** 2.1 integrada en `main` · Ejecuta primero el **Paso 0 estándar** (§0.2)

#### Objetivo
Implementar los endpoints 4–13 de §3.7: revisión de solicitudes (aprobar, rechazar, eliminar), listado con filtros y paginación, resumen para el contador de pendientes, alta directa con contraseña temporal, edición (datos, rol, módulos, activar/desactivar), restablecimiento de contraseña y edición del perfil propio. Con todas las reglas de §3.3 y las pruebas del Gate F2.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `routes/users.js`, `test/users-api.test.js`, `test/admin-rules.test.js`, `test/gate-f2.test.js`, `test/profile.test.js` |
| Modificar | `services/users.js`, `services/auth.js`, `routes/auth.js`, `lib/app.js` (montar `/api/users` con `requireAdmin`), `test/helpers.js` (fixtures nuevos) |

#### Especificación

**1. Conversores en `services/users.js`** — `toUserRef(row)`, `toUserOut(row)` y `toUserDetail(row)` con las formas exactas de §3.7 (`full_name` calculado, booleanos reales, fechas con `toIso`, `requested_modules` como arreglo, `modules` efectivos). Nunca devuelven `password_hash` ni `token_version`.

**2. Casos de uso en `services/users.js`** (reciben `actor` = fila del usuario o `null` = sistema/CLI, que omite la regla de "propia cuenta"; todos los que escriben auditan con `ip` y usan **una** transacción):
```js
getUserOr404(id)                         // → AppError(404, 'NOT_FOUND', 'No existe un usuario con ese identificador.')
listUsers(pageParams, { search, role, accountStatus, isActive, module, orderBy })   → Page<UserOut>
  // search: lower(first_name) / lower(last_name) / lower(email) / lower(first_name || ' ' || last_name) LIKE @q ESCAPE '\'
  // module: (role = 'ADMIN' OR EXISTS (permiso con ese módulo)) AND account_status = 'APROBADA'
usersSummary()                           → UsersSummary
countActiveAdmins({ excludingId })       → número
adminCreateUser(actor, data, ip)         → { user, temporaryPassword }   // createUser (F1) con temporal y must_change_password; audita USER_CREATED
updateUser(actor, id, data, ip)          → user
approveAccount(actor, id, data, ip)      → user
rejectAccount(actor, id, data, ip)       → user
adminResetPassword(actor, id, ip)        → temporaryPassword
  // NO escribe CREDENCIALES_INICIALES.txt (eso es solo para --reset-admin). Comparte con
  // resetPasswordToTemporary (F1) una función interna; la CLI sigue igual y audita { via: 'cli' }.
deleteAccountRequest(actor, id, ip)
```

**Orden de validación en todas las acciones** (para que los errores sean predecibles): `404` → `INVALID_ACCOUNT_STATE` → `SELF_ACTION_FORBIDDEN` → validación de negocio → `LAST_ADMIN` → aplicar.

**`updateUser`**
- Solo `APROBADA`. Sobre sí mismo: prohibido enviar `role` distinto del actual o `is_active=false` (`SELF_ACTION_FORBIDDEN`); puede editar sus datos personales.
- `LAST_ADMIN` si, tras el cambio, `countActiveAdmins` sería 0 (defensa: por la API el actor siempre es un ADMIN activo; se prueba a nivel de servicio con `actor = null`).
- Rol a `ADMIN` → borra sus filas de módulos. Rol a `OPERADOR` → módulos = `data.modules` o `[]`. Sin cambio de rol → `data.modules`, si viene, reemplaza el conjunto.
- `is_active=false` o cambio de rol → `token_version = token_version + 1`.
- Auditoría en la misma transacción (§3.5): `USER_UPDATED` (si cambió `first_name`, `last_name` o `phone`), `ROLE_CHANGED`, `PERMISSIONS_CHANGED` (solo si el rol no cambió y el conjunto de un OPERADOR cambió), `USER_ACTIVATED` / `USER_DEACTIVATED`. Si nada cambió, no audita y responde 200.

**`approveAccount`** — desde `PENDIENTE` o `RECHAZADA`: `account_status='APROBADA'`, `is_active=1`, `must_change_password=0`, rol y módulos de `data` (para ADMIN sin filas), `reviewed_by_id=actor.id`, `reviewed_at=nowIso()`, `review_note=data.note`; conserva `requested_modules`. Audita `ACCOUNT_APPROVED`.

**`rejectAccount`** — solo desde `PENDIENTE`: `account_status='RECHAZADA'`, `is_active=0`, `review_note=data.reason`, revisor y fecha, `token_version + 1`. Audita `ACCOUNT_REJECTED`.

**`adminResetPassword`** — solo `APROBADA`, no sobre sí mismo: contraseña temporal nueva, `must_change_password=1`, `token_version + 1` (no cambia `is_active`). Audita `PASSWORD_RESET` con `{ via: 'admin' }`.

**`deleteAccountRequest`** — solo `PENDIENTE`/`RECHAZADA`, no sobre sí mismo: audita `USER_DELETED` (con `entity_id` = id actual) y después elimina la fila (los permisos caen por `ON DELETE CASCADE`; las filas de `audit_logs` que la referencian quedan con `user_id = NULL`).

**3. `routes/users.js`** — `express.Router()`; el actor es `req.user` (lo deja `requireAdmin`). Tabla de §3.7 (#5–#13), con `/summary` antes de `/:id`. Valida cuerpo y consulta (§3.7) y responde con los conversores. Respuestas con `temporary_password` → `res.set('Cache-Control', 'no-store')`.

**4. Perfil propio** — `services/auth.js`: `updateProfile(user, data, ip)` (audita `PROFILE_UPDATED` con los nombres de los campos que cambiaron). `routes/auth.js`: `PATCH /me` con `requireAuth` (**no** la variante que permite contraseña pendiente) → `{ user }`.

**5. `test/helpers.js`** — `pendingUser(overrides)` (crea una solicitud vía `POST /api/auth/register` y devuelve `{ id, email, password }`), `adminSession()` (`{ user, token }` de un ADMIN aprobado) y `auditRows()` (filas con `detail` parseado).

#### Pruebas obligatorias

| Archivo | Casos |
|---|---|
| `users-api.test.js` | listado paginado con `total`/`pages`; filtros `search` (nombre, apellido, nombre completo, correo, sin distinguir mayúsculas, con `%` literal), `role`, `account_status`, `is_active`, `module` (incluye ADMIN), `order_by` válido e inválido (422); `summary` cuenta bien los 5 grupos; `POST /api/users` → 201 con `temporary_password` que cumple la política, cabecera `no-store`, la cuenta entra y debe cambiar contraseña; correo duplicado → 409; `GET /api/users/999` y `/api/users/abc` → 404 con el mensaje exacto; `approve` desde pendiente y desde rechazada (con rol ADMIN → sin filas de módulos y `modules` efectivos = 7); `approve` sobre aprobada → 400 `INVALID_ACCOUNT_STATE` con "…para una cuenta aprobada."; `reject` sin motivo o con 3 caracteres → 422; `reject` sobre aprobada → 400; `reset-password` → la contraseña anterior deja de servir y los tokens anteriores → 401; `DELETE` de pendiente → 204 y el correo puede registrarse otra vez; `DELETE` de aprobada → 400; `password_hash` y contraseñas no aparecen en ninguna respuesta ni en `audit_logs.detail` |
| `admin-rules.test.js` | el ADMIN no puede quitarse el rol, desactivarse, restablecerse ni eliminarse (`SELF_ACTION_FORBIDDEN`), pero sí editar su nombre; con `actor = null`, desactivar al único ADMIN → `LAST_ADMIN`; con dos ADMIN, uno puede degradar al otro; cambiar el rol incrementa `token_version`; agregar módulos **no** lo incrementa; `PATCH {}` → 422; campo desconocido → 422; la invariante de §3.3 se cumple tras cada operación (recorre todos los usuarios) |
| `gate-f2.test.js` | **Gate F2:** (a) OPERADOR sin `CARTAS` → `/api/_test/cartas` 403 `MODULE_FORBIDDEN` y `/api/auth/me` sin `CARTAS`; (b) el ADMIN le asigna `CARTAS` → **el mismo token** → 200; (c) se lo quita → 403 de inmediato; (d) el ADMIN lo desactiva → el mismo token → 401 y el login → 403 `ACCOUNT_DISABLED`; (e) flujo completo: registro → login 403 `ACCOUNT_PENDING` → aprobar con `[CARTAS]` → login 200 con `must_change_password=false` y `modules=["CARTAS"]` → `_test/cartas` 200 → `_test/admin` 403; (f) rechazo → login 403 `ACCOUNT_REJECTED` → eliminar → registrarse de nuevo → 201; (g) un OPERADOR (aunque tenga todos los módulos) → 403 `FORBIDDEN` en cada endpoint de `/api/users` |
| `profile.test.js` | editar nombre y teléfono → `UserMe` actualizado y `PROFILE_UPDATED` con `{"changed": [...]}`; `phone: null` lo borra; teléfono inválido → 422; cuerpo vacío → 422; con `must_change_password` → 403 `PASSWORD_CHANGE_REQUIRED`; enviar `email` o `role` → 422 `Campo no permitido.` |

#### Comandos de verificación
```powershell
npm test
npm run dev   # registro → login 403 → (admin) GET /api/users?account_status=PENDIENTE → approve → login 200
```

#### Fuera de alcance
Listado de la bitácora (2.3); pantallas (2.4–2.6); niveles de permiso de solo lectura (futuro).

#### Criterios de aceptación
- [ ] Endpoints 4–13 conforme a §3.7 y §3.8 (rutas, esquemas, códigos y mensajes exactos).
- [ ] Reglas de §3.3 probadas: estados, propia cuenta, último ADMIN, invariante.
- [ ] Las 7 pruebas del Gate F2 pasan.
- [ ] Cada acción de gestión deja su registro de bitácora con el `detail` de §3.5.
- [ ] `npm test` en verde.

**Commit final sugerido:** `feat: API de gestión de usuarios con aprobación de solicitudes y perfil propio`

`■ FIN DEL PROMPT 2.2`

---

### 4.3 Subtarea 2.3 — Backend: API de bitácora

`▶ INICIO DEL PROMPT 2.3`

**Rama:** `feat/f2-3-bitacora-api` · **Depende de:** 2.1 integrada en `main` (puede hacerse en paralelo con la 2.2) · Ejecuta primero el **Paso 0 estándar** (§0.2)

#### Objetivo
Exponer `GET /api/audit-logs` (solo ADMIN) con filtros, orden y paginación, devolviendo el actor como `UserRef`.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `routes/audit-logs.js`, `test/audit-api.test.js` |
| Modificar | `services/audit.js`, `lib/app.js` |

> Si la 2.2 aún no está en `main`, define `toUserRef` en `services/users.js` exactamente como §3.7 (la 2.2 lo reutilizará; resuelve el conflicto conservando una sola definición).

#### Especificación

1. **`services/audit.js`:**
```js
listAuditLogs(pageParams, { actions = [], entity, entityId, actorId, dateFrom, dateTo }) → Page<AuditLogOut>
  // SELECT a.*, u.first_name, u.last_name, u.email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
  // ORDER BY a.created_at DESC, a.id DESC; detail se devuelve parseado (JSON.parse) o null
```
   Las fechas recibidas se convierten con `new Date(x).toISOString()` antes de comparar (la BD guarda ISO UTC, que se compara bien como texto). `dateTo <= dateFrom` → `validationError([{ field: 'date_to', message: 'La fecha final debe ser posterior a la inicial.' }])`. Fecha no válida → `validationError` con `Fecha no válida.`.
2. **`routes/audit-logs.js`:** `GET /` con `parsePageParams(req.query, { defaultPageSize: 50 })`; `action` normalizado a arreglo y validado contra `AUDIT_ACTIONS` (`422`); `entity_id` y `actor_id` enteros positivos.
3. **`lib/app.js`:** `app.use('/api/audit-logs', requireAdmin, require('../routes/audit-logs'))`.

#### Pruebas obligatorias (`test/audit-api.test.js`)
- Orden `created_at` desc y desempate por `id` desc (inserta filas con la misma fecha).
- `page_size` por defecto 50; paginación con `total`/`pages`.
- Filtros: una y varias `action`; `entity` + `entity_id`; `actor_id`; rango de fechas (incluye `date_from`, excluye `date_to`); `date_to` con zona `-06:00` se convierte bien a UTC; `date_to <= date_from` → 422 con el mensaje exacto; `action=NO_EXISTE` → 422.
- `actor` con `full_name` y `email`; `null` para un `LOGIN_FAILED` con correo inexistente.
- Tras ejecutar login, logout, cambio de contraseña y (si la 2.2 ya está) aprobación y reset, **ningún** `detail` contiene claves de contraseña o token.
- OPERADOR → 403 `FORBIDDEN`; sin token → 401.

#### Comandos de verificación
```powershell
npm test
# Con el sistema en marcha y un token de admin:
Invoke-RestMethod -Uri 'http://localhost:8765/api/audit-logs?action=LOGIN&action=LOGIN_FAILED' -Headers @{ Authorization = "Bearer $token" }
```

#### Criterios de aceptación
- [ ] `GET /api/audit-logs` cumple §3.7 (filtros, orden, paginación de 50, `AuditLogOut`).
- [ ] Sin migración nueva.
- [ ] `npm test` en verde.

**Commit final sugerido:** `feat: API de consulta de la bitácora`

`■ FIN DEL PROMPT 2.3`

---

### 4.4 Subtarea 2.4 — Frontend: registro público, login actualizado y componentes compartidos

`▶ INICIO DEL PROMPT 2.4`

**Rama:** `feat/f2-4-registro-frontend` · **Depende de:** 2.1 integrada en `main` · Ejecuta primero el **Paso 0 estándar** (§0.2)

#### Objetivo
Crear la página `/registro` (solicitud de cuenta) con el diseño de marca, enlazarla desde el login, mostrar con tono informativo el aviso de cuenta pendiente y dejar listos los componentes compartidos que usarán la 2.5, la 2.6 y las fases siguientes.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `public/registro.html`, `public/js/registro.js`, `public/js/components.js`, `public/js/phone.js`, `test/frontend-utils.test.js` |
| Modificar | `lib/app.js` (`GET /registro` → `registro.html`, con `Cache-Control: no-cache`), `public/login.html`, `public/js/login.js`, `public/js/ui-kit.js` (`UI.buildQuery`), `public/js/access.js` (estados de cuenta), `public/js/cambiar-contrasena.js` (usa `Components.passwordStrength`), `public/css/login.css`, `public/css/base.css` (estilos de los componentes) |

#### Especificación

**1. Dominio** — `access.js`: agrega `ACCOUNT_STATUSES`, `ACCOUNT_STATUS_LABEL = { PENDIENTE: 'Pendiente de aprobación', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' }` y `SENSITIVE_MODULES = ['BENEFICIARIOS']` (módulos con datos de menores). `phone.js`: `Phone.normalize(raw)` (quita espacios y guiones), `Phone.isValid(raw)` (10 dígitos tras normalizar), `Phone.format('2291234567') → '229 123 4567'`.

**2. `UI.buildQuery`** — §3.10, con `URLSearchParams`.

**3. `Components.modulePicker(container, { value, onChange, disabled, highlight, idPrefix })`** — cuadrícula de tarjetas seleccionables (una columna a 360 px, dos desde 640 px): cada tarjeta es un `<label>` con `<input type="checkbox">`, la etiqueta y la descripción de `MODULE_INFO`. Los de `SENSITIVE_MODULES` muestran una insignia con ícono `shield` y el texto "Datos de menores"; los de `highlight`, la insignia "Solicitado". Tarjeta marcada: borde y fondo coral suave (el checkbox también lo indica). `onChange` y `getValue()` devuelven siempre el orden de `MODULE_KEYS`. Navegable con teclado (Tab + Espacio).

**4. `Components.paginationBar({ page, pages, total, pageSize, itemLabel = 'registros', onPageChange })`** — texto "Mostrando 21–40 de 134 {itemLabel}" (o "Sin {itemLabel}" si `total === 0`), "Página 2 de 7" y botones "Anterior"/"Siguiente" (con `aria-label`; deshabilitados en los extremos; ocultos si `pages <= 1`). La función que calcula el texto (`paginationText`) se exporta para pruebas.

**5. `Components.passwordStrength(input)`** — extrae el indicador de `cambiar-contrasena.js` (tres barras + "Seguridad: Débil/Aceptable/Fuerte", `aria-live="polite"`); `cambiar-contrasena.js` pasa a usarlo sin cambiar su aspecto.

**6. `/registro`** — `registro.html` reutiliza la estructura del login (panel con degradado, logotipo, frase y texto institucional; `login.css`). Con sesión → `location.replace('/app')`. Título: "Solicitar cuenta · Soñar Despierto". Encabezado "Solicita tu cuenta" y subtítulo "Llena tus datos. Un administrador revisará tu solicitud y te habilitará los módulos que necesitas." Al cargar consulta `GET /api/auth/registration-info`: cargando → *spinner*; error de red → alerta con "Reintentar"; `enabled=false` → "El registro de cuentas está desactivado. Pide al administrador del sistema que te cree una cuenta." con enlace "Volver a iniciar sesión".

Formulario en secciones con encabezado:
1. **Tus datos:** Nombre(s), Apellidos, Teléfono (`inputmode="tel"`, ayuda "10 dígitos").
2. **Tu cuenta:** Correo electrónico, Contraseña (mostrar/ocultar + `passwordStrength`), Confirmar contraseña.
3. **¿Con qué módulos vas a colaborar?** `modulePicker`; ayuda: "Marca los que necesitas. El administrador decidirá cuáles te habilita; si no estás seguro, puedes dejarlo en blanco."
4. **Comentario para el administrador (opcional):** `textarea` con contador `n/500`; placeholder "Ej. Coordino el acopio de regalos de la zona norte."
5. Casilla obligatoria: "Me comprometo a usar la información del sistema —en especial la de niñas y niños— solo para las actividades de Soñar Despierto y a no compartirla."

Validaciones en el navegador con los mismos mensajes del backend (§3.7) más "Las contraseñas no coinciden." y "Este campo es obligatorio.", mostradas bajo cada campo (`.field-error`, `aria-invalid`). Al enviar: teléfono normalizado, módulos en orden del catálogo, `note: null` si está vacía y **sin** la confirmación. Errores de la API: `409 EMAIL_ALREADY_EXISTS` → bajo el correo; `422` con `details` → bajo cada campo; otro → alerta sobre el botón. Botón "Enviar solicitud" con `UI.setBusy`.

Éxito → reemplaza el formulario por un panel: ícono de correo, "¡Solicitud enviada!", "Registramos tu solicitud con el correo **{email}**. Cuando un administrador la apruebe podrás iniciar sesión con ese correo y la contraseña que elegiste. Si es urgente, avísale a la coordinación." y botón "Ir a iniciar sesión". Al pie: "¿Ya tienes cuenta? Inicia sesión".

**7. Login** — el recuadro inferior pasa a "¿No tienes cuenta? **Solicítala aquí**" (enlace a `/registro`) cuando `registration-info` responde `enabled: true`; si responde `false` o falla, conserva el texto actual. Si el error del login tiene `code === 'ACCOUNT_PENDING'`, el aviso usa tono informativo (`alert-warning`, `role="status"`, ícono de reloj) en lugar del rojo.

#### Pruebas obligatorias (`test/frontend-utils.test.js`)

| Caso |
|---|
| `UI.buildQuery`: omite `undefined`, `null` y `""`; arreglos repetidos (`action=A&action=B`); booleanos y números; acentos y espacios codificados; sin parámetros → `""` |
| `Phone`: `"229-123 4567"` → `"2291234567"` válido; 9 dígitos inválido; `format` |
| `paginationText`: rango correcto en la primera, una intermedia y la última página; `total=0` → "Sin registros" |
| `Access`: `ACCOUNT_STATUS_LABEL` cubre los 3 estados; `SENSITIVE_MODULES` ⊂ `MODULE_KEYS` |

#### Verificación manual
1. `npm run dev` → `http://localhost:8765` → recuadro "Solicítala aquí" → `/registro`.
2. Enviar vacío → errores por campo; corregir y enviar → "¡Solicitud enviada!".
3. Volver al login e intentar entrar con esa cuenta → aviso amarillo "Tu solicitud de cuenta está pendiente…".
4. Registrar el mismo correo otra vez → error bajo el campo de correo.
5. Con `REGISTRATION_ENABLED=false` en `.env` (reinicia) → el login muestra el texto anterior y `/registro` el aviso de desactivado.
6. A 360 px y en tema oscuro: el formulario es usable y los módulos se ven en una columna.

#### Criterios de aceptación
- [ ] El login se ve igual que antes salvo el enlace de registro.
- [ ] El registro valida igual que el backend y nunca guarda la contraseña fuera del formulario.
- [ ] `modulePicker`, `paginationBar`, `passwordStrength` y `UI.buildQuery` listos y probados.
- [ ] `npm test` en verde.

**Commit final sugerido:** `feat: pantalla de solicitud de cuenta y componentes compartidos de listados`

`■ FIN DEL PROMPT 2.4`

---

### 4.5 Subtarea 2.5 — Frontend: pantalla de Usuarios, perfil editable y refresco de permisos

`▶ INICIO DEL PROMPT 2.5`

**Rama:** `feat/f2-5-usuarios-frontend` · **Depende de:** 2.2 y 2.4 integradas en `main` · Ejecuta primero el **Paso 0 estándar** (§0.2)

#### Objetivo
Construir la administración de usuarios para el ADMIN (solicitudes, listado con filtros, alta, edición, restablecimiento, activar/desactivar, detalle), el contador de solicitudes pendientes en el menú y en Inicio, el perfil editable, y hacer que el menú y las guardas reaccionen solos cuando el ADMIN cambia los permisos de alguien.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `public/js/fechas.js`, `public/js/usuarios.js`, `public/js/usuario-detalle.js`, `public/js/usuarios-dialogos.js` |
| Modificar | `public/app.html` (cargar los scripts nuevos), `public/js/app.js`, `public/js/access.js`, `public/js/ui-kit.js` (`UI.onForbidden`, ícono `scroll`, `userPlus`, `userCheck`), `public/js/components.js` (`secretReveal`), `public/js/inicio.js`, `public/js/perfil.js`, `public/css/app.css`, `test/frontend-utils.test.js` |

#### Especificación

**1. `fechas.js`** (zona `America/Mexico_City`, locale `es-MX`, con `Intl`): `formatDateTime(iso)` ("18 oct 2026, 11:40"), `formatDate(iso)`, `formatRelative(iso)` ("hace 2 horas", con `Intl.RelativeTimeFormat`), `todayLocal()` (`YYYY-MM-DD`). `UI.formatDate` de la Fase 1 se conserva.

**2. Navegación por hash con parámetros** (`app.js`) — §3.9: `#vista/id?params`. Las vistas reciben `{ user, view, id, params, navigate }`. Una vista desconocida → `#inicio`; sin permiso → `sin-acceso`.

**3. Refresco de permisos** (cumple el Gate "no ve el menú")
- `UI.onForbidden(handler)`: ante un `403` con `code` `MODULE_FORBIDDEN` o `FORBIDDEN`, llama al manejador y después lanza el error.
- `app.js` registra el manejador → recarga `/api/auth/me` (como máximo una vez cada 5 s). Además, mientras haya sesión: recarga `/api/auth/me` cada 120 s si `document.visibilityState === 'visible'`, y al volver a la pestaña si la última recarga fue hace más de 60 s. Si cambian los módulos o el rol, vuelve a pintar el menú y re-evalúa la vista actual (una vista sin permiso pasa a `sin-acceso`).

**4. Contador** — si el usuario es ADMIN, `app.js` consulta `GET /api/users/summary` al cargar, cada 60 s y tras cada acción de usuarios (evento `window` `sd:users-changed`), y pinta la píldora de §3.9. `inicio.js`: si `pending > 0`, panel destacado arriba de los módulos: ícono `userCheck`, "Tienes {n} solicitud(es) de cuenta por revisar." y botón "Revisar" → `#usuarios?tab=solicitudes`.

**5. `#usuarios` (`usuarios.js`)** — parámetros de §3.9; búsqueda con *debounce* de 300 ms; cambiar un filtro regresa a `page: 1`.
- Encabezado "Usuarios", descripción "Revisa las solicitudes de cuenta y administra quién tiene acceso a cada módulo.", botón "Nuevo usuario".
- Pestañas (`role="tablist"`): **Solicitudes** (con el número de pendientes) y **Usuarios**.
- **Solicitudes:** selector "Pendientes | Rechazadas" y búsqueda. Tarjetas: nombre completo, correo, teléfono (`tel:` con `Phone.format`), "Solicitó:" con insignias por módulo (o "Sin módulos solicitados"), la nota entre comillas, "Solicitada el {fecha} ({relativa})". En rechazadas, además: "Rechazada por {revisor} el {fecha} · Motivo: {review_note}". Acciones: pendiente → **Revisar solicitud** (principal) y "Eliminar"; rechazada → "Aprobar de todos modos" y "Eliminar". Eliminar usa `UI.confirm`: "¿Eliminar la solicitud de {nombre}? Podrá volver a registrarse con el mismo correo." Vacíos: "No hay solicitudes pendientes. Cuando alguien se registre, aparecerá aquí." / "No hay solicitudes rechazadas."
- **Usuarios:** siempre `account_status=APROBADA`; filtros búsqueda, Rol (Todos / Administrador / Operador), Estado (Activos / Inactivos / Todos) y Módulo (Todos + 7). Escritorio: tabla Nombre (enlace a `#usuario/<id>`) · Correo · Rol · Módulos (insignias; "Todos" para ADMIN; máximo 3 y "+N") · Estado ("Activo"/"Inactivo" con ícono y texto) · Último acceso (relativo; "Nunca") · Acciones (Ver detalle, Editar, Restablecer contraseña, Desactivar / Activar). Menos de 768 px: tarjetas con los mismos datos. La fila propia lleva "(tú)" y solo ofrece Ver detalle y Editar. `paginationBar` al pie (`itemLabel: 'usuarios'`).
- Estados de carga (esqueletos), vacío (con "Nuevo usuario") y error (con "Reintentar").

**6. Diálogos (`usuarios-dialogos.js`)** — construidos sobre el modal de `ui-kit.js` (mismas clases, foco atrapado, Esc cierra):
- `reviewRequest(user, { mode = 'review' | 'approve' })`: resumen del solicitante y su nota; **Rol** (radios): "Operador — solo los módulos que marques" (por defecto) o "Administrador — acceso total, incluida la gestión de usuarios y la bitácora" (con aviso en tono de advertencia); **Módulos:** `modulePicker` precargado con `requested_modules` y `highlight` = solicitados, deshabilitado con "Los administradores tienen todos los módulos." si el rol es ADMIN; si es OPERADOR sin módulos: aviso "Sin módulos, la persona solo verá Inicio y Mi perfil." (se permite); "Nota (opcional, queda en la bitácora)". Pie: "Rechazar" (contorno; oculto en `mode='approve'`) → cambia el cuerpo a "Motivo del rechazo" (obligatorio, 5–500, contador) con "Confirmar rechazo" y "Volver"; "Aprobar cuenta" (principal). Éxito → toast "Cuenta de {nombre} aprobada" / "Solicitud rechazada" y cierra. Error → mensaje de la API dentro del diálogo, que **sigue abierto**.
- `userForm({ mode: 'create' | 'edit', user })`: Nombre(s), Apellidos, Correo (solo al crear; en edición, texto de solo lectura), Teléfono (opcional), Rol, Módulos (`modulePicker`, deshabilitado para ADMIN) y, en edición, el interruptor "Cuenta activa". Si es la cuenta propia: Rol y "Cuenta activa" deshabilitados con "No puedes cambiar tu propio rol ni desactivar tu cuenta." En edición envía **solo los campos que cambiaron** (la función `changedFields(antes, despues)` se exporta para pruebas). Al crear con éxito, el cuerpo pasa a `secretReveal` con la contraseña temporal y el botón "Listo".
- `resetPassword(user)`: "¿Restablecer la contraseña de {nombre}? Su sesión se cerrará en todas las computadoras y tendrá que elegir una nueva al entrar." → `secretReveal`.
- Desactivar: `UI.confirm` "¿Desactivar a {nombre}? Perderá el acceso de inmediato en todas las computadoras." Activar: sin confirmación, toast "{nombre} vuelve a tener acceso".
- `Components.secretReveal({ secret, title, hint })`: la contraseña en letra monoespaciada grande, botón "Copiar" (`navigator.clipboard.writeText`; si falla, selecciona el texto y muestra "Selecciona y copia la contraseña"), toast "Copiada" y el aviso: "Cópiala ahora: por seguridad no se volverá a mostrar. La persona deberá cambiarla al iniciar sesión."

Toda acción exitosa dispara `sd:users-changed` y recarga la lista; si afecta a la cuenta propia, recarga `/api/auth/me`.

**7. `#usuario/<id>` (`usuario-detalle.js`)** — id no numérico o `404` → "No encontramos este usuario." con enlace de regreso. Encabezado con el nombre completo y "← Usuarios". Paneles: **Cuenta** (correo, teléfono, rol, estado de la cuenta con `ACCOUNT_STATUS_LABEL`, activa, último acceso, creada), **Módulos** (efectivos; si la cuenta vino de una solicitud, "Solicitó:" marcando con texto los solicitados que no se concedieron), **Solicitud** (solo si tiene `confidentiality_accepted_at`: nota, aceptó confidencialidad el …, revisada por … el …, nota o motivo). Botones según el estado (los mismos diálogos). Deja `// TODO(2.6): actividad del usuario` al final.

**8. Perfil** — `perfil.js`: formulario Nombre(s), Apellidos, Teléfono → `PATCH /api/auth/me` → actualiza la sesión (`onUserChange`) → toast "Perfil actualizado"; debajo, datos de solo lectura (correo, rol, módulos, último acceso con `Fechas.formatDateTime`) y enlace a "Cambiar contraseña".

#### Pruebas obligatorias (`test/frontend-utils.test.js`, ampliar)

| Caso |
|---|
| `Fechas.formatDateTime('2026-10-18T17:40:00Z')` muestra 11:40 (hora de Veracruz); `formatRelative` en pasado |
| `changedFields`: solo devuelve lo que cambió; `modules` se compara como conjunto |
| `Access.visibleMenu`: un OPERADOR nunca ve `usuarios` ni `usuario`; la vista `usuario` no aparece en el menú |
| parser del hash: `'#usuario/7?x=1'` → `{ key: 'usuario', id: '7', params: { x: '1' } }`; `'#'` → `inicio` |

#### Verificación manual (con BD limpia)
1. Registra a "Ana" en `/registro` pidiendo Cartas y Calendario.
2. Entra como admin → **Usuarios** muestra "1" en el menú y el aviso en Inicio.
3. Revisar solicitud → quita Calendario → Aprobar. Ana entra (ventana privada) con su contraseña y solo ve Cartas y Búsqueda por código.
4. Con Ana en `#cartas`, el admin le quita Cartas → en menos de 2 minutos (o al hacer cualquier acción o volver a la pestaña) Ana pasa a "Sin acceso" y su menú se actualiza.
5. El admin desactiva a Ana → su siguiente acción la lleva al login.
6. Crear usuario → aparece la contraseña temporal una sola vez; restablecer contraseña igual.
7. Rechaza una segunda solicitud → aparece en "Rechazadas" con el motivo → elimínala.
8. El admin no puede desactivarse ni cambiar su rol (opciones deshabilitadas u ocultas).
9. A 360 px y en tema oscuro: pestañas, tarjetas y diálogos usables.

#### Criterios de aceptación
- [ ] Los 9 pasos de la verificación manual se cumplen.
- [ ] Ninguna contraseña temporal queda en `sessionStorage`, `localStorage`, variables globales ni en la consola.
- [ ] Toda pantalla nueva con estados de carga, vacío y error.
- [ ] `npm test` en verde.

**Commit final sugerido:** `feat: administración de usuarios y solicitudes de cuenta en la interfaz`

`■ FIN DEL PROMPT 2.5`

---

### 4.6 Subtarea 2.6 — Frontend: visor de bitácora, actividad por usuario, prueba de humo y documentación (Gate F2)

`▶ INICIO DEL PROMPT 2.6`

**Rama:** `feat/f2-6-bitacora-gate` · **Depende de:** 2.3 y 2.5 integradas en `main` · Ejecuta primero el **Paso 0 estándar** (§0.2)

#### Objetivo
Crear el visor de bitácora y el panel de actividad en el detalle de cada usuario, agregar Bitácora al menú, ampliar la prueba de humo del paquete con el flujo de registro y aprobación, y actualizar la documentación para cerrar la Fase 2.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `public/js/audit.js`, `public/js/bitacora.js` |
| Modificar | `public/app.html`, `public/js/access.js`, `public/js/fechas.js`, `public/js/usuario-detalle.js`, `public/css/app.css`, `test/frontend-utils.test.js`, `scripts/empaquetar.js`, `config.env.template`, `LEEME_USUARIO.txt`, `README.md`, `docs/API_Spec.md`, `docs/Modelo_Datos.md`, `docs/Pantallas_UI.md`, `docs/Roadmap_Fases.md` |

#### Especificación

**1. `public/js/audit.js`** — espejo de §3.5:
```js
AUDIT_ACTIONS            // las 16 claves en el orden de §3.5
AUDIT_ACTION_LABEL       // etiquetas exactas de §3.5
AUDIT_ACTION_GROUP       // sesion: LOGIN, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED, PASSWORD_RESET
                         // cuentas: ACCOUNT_*, USER_CREATED, USER_UPDATED, USER_DELETED, PROFILE_UPDATED
                         // permisos: ROLE_CHANGED, PERMISSIONS_CHANGED, USER_ACTIVATED, USER_DEACTIVATED
ENTITY_LABEL = { users: 'Usuario' }
auditActionLabel(action) // acción desconocida (de una fase futura) → la clave tal cual
describeAuditDetail(log) // '' si no hay nada que decir
```
Textos de `describeAuditDetail` (usa `MODULE_INFO`, `ROLE_LABEL` y `ACCOUNT_STATUS_LABEL`):

| Acción | Texto |
|---|---|
| `LOGIN_FAILED` | `reason`: pending → "Cuenta pendiente de aprobación"; rejected → "Solicitud rechazada"; disabled → "Cuenta desactivada"; sin `reason` → "Correo: {email}" |
| `ACCOUNT_REQUESTED` | "Solicitó: Cartas de Navidad, Calendario" o "Sin módulos solicitados" |
| `ACCOUNT_APPROVED` / `USER_CREATED` | "Como Operador · Módulos: Cartas de Navidad" o "Como Administrador" |
| `ACCOUNT_REJECTED` | "Motivo: {reason}" |
| `USER_UPDATED` / `PROFILE_UPDATED` | "Campos: nombre, teléfono" (`first_name`→nombre, `last_name`→apellidos, `phone`→teléfono) |
| `ROLE_CHANGED` | "Operador → Administrador" |
| `PERMISSIONS_CHANGED` | "Agregó: Cartas de Navidad · Quitó: Inventario" (omite la parte vacía) |
| `PASSWORD_RESET` | via admin → "Por un administrador"; via cli → "Desde la computadora anfitriona" |
| `USER_DELETED` | "{email} ({estado})" |

**2. `fechas.js`** — agrega `localDayRangeToUtc(desde, hasta)` → `{ date_from, date_to }`: inicio del día `desde` e inicio del día **siguiente** a `hasta`, en hora de `America/Mexico_City`, como ISO UTC. Calcula el desfase con `Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })` (no supongas −06:00 fijo). Agrega `daysAgoLocal(n)`.

**3. `#bitacora` (`bitacora.js`)** — parámetros de §3.9; título "Bitácora", descripción "Registro de inicios de sesión y cambios en cuentas y permisos."
- Filtros: Desde y Hasta (`<input type="date">`; Hasta no puede ser anterior a Desde: error bajo el campo y no se aplica), Acción (`<select>` con `<optgroup>` por grupo y "Todas"), Usuario (`<select>` alimentado por `GET /api/users?page_size=100&order_by=last_name`, con "Todos"), chip "Sobre: {email o Usuario #id} ✕" si viene `objeto`, y "Limpiar filtros".
- Tabla (escritorio): Fecha y hora · Usuario (actor: nombre y correo, o "Sistema / desconocido") · Acción (insignia con ícono por grupo y la etiqueta) · Sobre (`ENTITY_LABEL` + enlace a `#usuario/<id>` cuando `entity='users'`; texto = `detail.email` si existe, si no "Usuario #{id}") · Detalle (`describeAuditDetail` o "—") · IP. Cada fila con "Ver detalle técnico" que despliega el `detail` como JSON con sangría en un `<pre>` (escapado). Menos de 768 px → tarjetas.
- `paginationBar` (`itemLabel: 'registros'`); vacío "No hay registros con estos filtros."
- `access.js`: agrega la vista Bitácora (§3.9).

**4. Actividad en el detalle** — en `usuario-detalle.js`, panel "Actividad" con pestañas "Sobre esta cuenta" (`entity=users&entity_id=id`) y "Hecho por esta persona" (`actor_id=id`), 10 registros cada una (renglones compactos) y enlace "Ver todo en la bitácora" → `#bitacora?objeto=id` o `#bitacora?usuario=id` (sin filtro de fechas: `desde`/`hasta` vacíos significan "sin límite" cuando viene `objeto` o `usuario`). Sustituye el `TODO(2.6)`.

**5. Prueba de humo (`scripts/empaquetar.js`)** — después de los pasos actuales (admin con la contraseña cambiada), agrega en orden:
1. `GET /api/auth/registration-info` → `enabled === true`.
2. `POST /api/auth/register` (correo `smoke@prueba.local`, módulos `["CARTAS","CALENDARIO"]`) → 201 sin token.
3. Login con esa cuenta → 403 `ACCOUNT_PENDING`.
4. `GET /api/users/summary` → `pending === 1`; `GET /api/users?account_status=PENDIENTE` → obtener el id.
5. `POST /api/users/:id/approve` con `{"role":"OPERADOR","modules":["CARTAS"]}` → 200.
6. Login de la cuenta → 200, `modules` = `["CARTAS"]`, `must_change_password === false`.
7. `GET /api/audit-logs?action=ACCOUNT_APPROVED` → `total === 1`.
8. `PATCH /api/users/:id` con `{"is_active": false}` → `GET /api/auth/me` con el token del paso 6 → 401.
9. `GET /registro` y `GET /app` → HTML.

**6. Configuración y usuario final**
- `config.env.template`: agrega
```ini
# true  = el personal puede solicitar su cuenta en la pantalla de inicio de sesión;
#         un administrador debe aprobarla (menú Usuarios → Solicitudes).
# false = solo el administrador crea cuentas.
REGISTRATION_ENABLED=true
```
- `LEEME_USUARIO.txt`: secciones nuevas en español sencillo: "Cómo pedir una cuenta" (enlace del login, esperar la aprobación, avisar a la coordinación), "Cómo aprobar solicitudes" (Usuarios → Solicitudes → Revisar), "Si alguien deja el equipo" (desactivar, no eliminar), "Cómo cerrar el registro" (`REGISTRATION_ENABLED=false`) y "La bitácora".

**7. Documentación** (en `docs/`):
- `API_Spec.md`: reemplaza §3.1 (Auth) y §3.2 (Usuarios) por los contratos de §3.7–§3.8 de este documento (indica arriba "Actualizado en la Fase 2 (ADR-0004, ADR-0007, ADR-0008, ADR-0009)"); agrega §3.9 Bitácora; en el resumen de endpoints marca como "fase de nube" los de voluntarios con cuenta.
- `Modelo_Datos.md`: tabla `users` con las columnas de las migraciones 1 y 2, `user_module_permissions` y la máquina de estados de cuenta de §3.3.
- `Pantallas_UI.md`: P01 (enlace a solicitud), P02 reinterpretada como "Solicitud de cuenta del personal", P03 (perfil editable), P10 (Usuarios: solicitudes, alta, edición), P10b (Bitácora) — con las rutas `/registro` y `/app#…`.
- `Roadmap_Fases.md`: F2 marcada ✅ con la fecha del Gate.
- `README.md`: estado de las fases y una línea sobre el auto-registro.

#### Pruebas obligatorias (`test/frontend-utils.test.js`, ampliar)

| Caso |
|---|
| las 16 acciones tienen etiqueta y grupo; `describeAuditDetail` para cada fila de la tabla de textos; acción desconocida → la clave |
| `localDayRangeToUtc('2026-10-17', '2026-10-17')` → `2026-10-17T06:00:00.000Z` / `2026-10-18T06:00:00.000Z`; rango de varios días |
| `Access.visibleMenu`: ADMIN ve 14 elementos (Bitácora después de Usuarios); OPERADOR nunca ve Bitácora |

#### Comandos de verificación
```powershell
npm run empaquetar      # debe terminar con PRUEBA DE HUMO OK y "Paquete listo"
```

#### Criterios de aceptación
- [ ] La bitácora filtra por fechas (hora de Veracruz), acción, usuario y cuenta afectada, con paginación.
- [ ] El detalle de cada usuario muestra su actividad.
- [ ] `npm run empaquetar` en verde con los 9 pasos nuevos de la prueba de humo.
- [ ] Documentación actualizada (API, modelo, pantallas, hoja de ruta, README, LEEME).
- [ ] `npm test` en verde.

**Commit final sugerido:** `feat: visor de bitácora, prueba de humo del registro y documentación de la Fase 2`

`■ FIN DEL PROMPT 2.6`

---

## 5. Gate de la Fase 2 (criterio de salida)

La fase se considera **terminada** solo si se cumple todo lo siguiente sobre `main`:

**Automático**
- [ ] `npm run empaquetar` (sin `--sin-pruebas`) en verde: `npm test` (incluidas las 7 pruebas de `test/gate-f2.test.js`) y `PRUEBA DE HUMO OK` con el flujo de registro y aprobación.
- [ ] Una `sonar.db` de la Fase 1 con datos migra a la versión 2 y sus cuentas quedan `APROBADA`.

**Manual — guion de demostración para la directiva (10 minutos)**
1. Login → "¿No tienes cuenta? Solicítala aquí" → registrar a Ana (Cartas y Calendario) → "¡Solicitud enviada!".
2. Ana intenta entrar → aviso de cuenta pendiente.
3. El administrador entra: ve **Usuarios (1)** en el menú y el aviso en Inicio → Revisar → quita Calendario → Aprobar.
4. Ana entra con **su** contraseña (sin cambio obligatorio) → solo ve Cartas y Búsqueda por código; `/app#inventario` → "Sin acceso".
5. El administrador le quita Cartas → el menú de Ana se actualiza solo y la API le responde `403`.
6. El administrador desactiva a Ana → Ana pierde la sesión en su siguiente acción e intenta entrar → "Tu cuenta está desactivada".
7. El administrador crea a Luis desde "Nuevo usuario" → copia la contraseña temporal → Luis entra y debe cambiarla.
8. Una solicitud falsa se rechaza con motivo y se elimina.
9. **Bitácora**: se ven todos los pasos anteriores, filtrables por fecha, acción y usuario; el detalle de Ana muestra su actividad.
10. Vista móvil (360 px) de Registro, Usuarios y Bitácora, en tema claro y oscuro.

**Documentación**
- [ ] `API_Spec.md`, `Modelo_Datos.md`, `Pantallas_UI.md`, `README.md` y `LEEME_USUARIO.txt` actualizados.
- [ ] Desviaciones de las subtareas registradas (ADR nuevo si alguna cambió una decisión).
- [ ] `docs/Roadmap_Fases.md`: F2 marcada como completada con la fecha.

---

## 6. Problemas conocidos y cómo resolverlos

| Síntoma | Causa probable | Solución |
|---|---|---|
| `SqliteError: Cannot add a column with non-constant default` o error al agregar la FK | Restricciones de `ALTER TABLE ADD COLUMN` en SQLite | Usa exactamente el SQL de §3.4: la FK nueva debe permitir `NULL` y no llevar `DEFAULT` distinto de `NULL` |
| `GET /api/users/summary` responde `404 NOT_FOUND` | La ruta `/:id` se declaró antes | Declarar `/summary` primero (2.2) |
| `?action=LOGIN` falla y `?action=LOGIN&action=LOGOUT` funciona | Express entrega texto o arreglo según cuántos haya | `[].concat(req.query.action ?? [])` (§3.7) |
| Búsqueda con `%` o `_` devuelve de más | Falta `ESCAPE '\'` | `lower(col) LIKE @q ESCAPE '\'` con `likePattern()` |
| El contador de solicitudes no baja tras aprobar | No se disparó `sd:users-changed` | Toda acción exitosa de usuarios lo dispara (2.5, paso 6) |
| El menú de un operador no cambia tras quitarle un módulo | Sin peticiones desde su navegador | Se actualiza en ≤ 120 s, al volver a la pestaña o en su siguiente acción (`UI.onForbidden`) |
| Varias personas de la oficina reciben `429` al registrarse | Salen a la red con la misma IP | Subir `REGISTER_MAX_ATTEMPTS` en `config.env` o que el administrador cree las cuentas |
| Se quiere impedir que extraños pidan cuenta en modo LAN | Registro abierto | `REGISTRATION_ENABLED=false` en `config.env` y reiniciar; o rechazar y eliminar las solicitudes |
| Alguien olvidó su contraseña | No hay correo configurado | El administrador usa "Restablecer contraseña" en Usuarios; si es el único administrador: `SonarDespierto.bat --reset-admin` |
| `npm run empaquetar` falla en la prueba de humo con `better-sqlite3` | Paquete generado en otra plataforma | Generarlo en Windows x64 con `npm install` hecho en esa misma PC |

---

## Anexo A — ADR-0008

El texto completo está en [`../adr/0008-auto-registro-con-aprobacion.md`](../adr/0008-auto-registro-con-aprobacion.md).
