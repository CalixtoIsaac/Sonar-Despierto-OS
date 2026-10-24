# Fase 1 — Prompts Task Document: Fundación y esqueleto ejecutable

> 🗄️ **Documento histórico (2026-10-23).** La Fase 1 se implementó con Python/FastAPI + React y después se **reimplementó en Node.js + Express + SQLite + HTML/CSS/JS** para usar el mismo stack que SEMA y My Best DataBase ([ADR-0009](../adr/0009-stack-node-express-sqlite-como-sema.md)). El comportamiento (login, cambio de contraseña obligatorio, roles y permisos por módulo, bitácora, arranque local, modo LAN, `--reset-admin`) es el mismo, pero los archivos, comandos y contratos técnicos de este documento ya **no aplican**. Referencia vigente: [`Arquitectura_y_Convenciones.md`](../Arquitectura_y_Convenciones.md) y el `README.md`.

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local)
- **Versión del documento:** 1.0 · **Fecha:** 2026-10-17 · **Estado:** Aprobado para ejecución
- **Punto de partida:** rama `main`, commit `b11e96a` (esqueleto FastAPI + `/health`)
- **Decisiones que aplica:** [ADR-0001 a ADR-0007](../adr/README.md) · Hoja de ruta: [`Roadmap_Fases.md`](../Roadmap_Fases.md)
- **Insumos:** `docs/*.md` del repositorio y el export de Lovable (`C:\Users\isaac\Downloads\Sonar-Despierto-OS-DESIGN`)

---

## 0. Cómo usar este documento

1. **Una subtarea = una sesión de IA (o un desarrollador) = una rama = un pull request.**
2. Para cada subtarea, entrega a la IA, **en este orden**:
   - **[A]** el *Bloque de contexto global* (§2), completo;
   - **[B]** los *Contratos compartidos* (§3), completos;
   - **[C]** el prompt de la subtarea (§4.x), desde `▶ INICIO DEL PROMPT` hasta `■ FIN DEL PROMPT`.

   Si la IA tiene acceso al repositorio, basta con escribir: *"Lee `docs/fases/Fase_1_Prompts_Task_Document.md` §2, §3 y §4.x y ejecuta la subtarea 1.x"*.
3. Al terminar, **verifica tú mismo** los criterios de aceptación ejecutando los comandos indicados. No aceptes el trabajo solo por el reporte de la IA.
4. Si la IA propone cambiar un contrato de §3, recházalo o escálalo al líder técnico. Si el cambio se aprueba, **primero se actualiza este documento** y después el código.
5. Integra a `main` en el orden de la tabla. Antes de cada merge: `pytest` + `npm test` en verde.

### 0.1 Subtareas, dependencias y orden

| ID | Subtarea | Rama | Depende de | Estimación orientativa | Entregable verificable |
|---|---|---|---|---|---|
| 1.1 | Saneamiento del repositorio y estructura modular | `feat/f1-1-estructura` | — | 2–3 h | Repo limpio, estructura `modules/`, pruebas actuales en verde |
| 1.2 | Núcleo backend: configuración, datos locales, SQLite, Alembic, SPA | `feat/f1-2-nucleo-backend` | 1.1 | 5–7 h | API arranca con SQLite en `.data/`, sirve la SPA, pruebas en verde |
| 1.3 | Usuarios, autenticación JWT y permisos por módulo | `feat/f1-3-auth` | 1.2 | 8–10 h | Endpoints `/auth/*` probados (≈30 pruebas), admin inicial |
| 1.4 | Migración del diseño Lovable a SPA (Vite) | `feat/f1-4-frontend-base` | 1.1 | 6–8 h | `npm run dev/build` funcionando con la UI de Lovable, sin modo demo |
| 1.5 | Integración de autenticación frontend ↔ API | `feat/f1-5-auth-frontend` | 1.3, 1.4 | 6–8 h | Login real, guardas de ruta, menú según permisos, cambio de contraseña |
| 1.6 | Lanzador, build y ejecutable Windows | `feat/f1-6-ejecutable` | 1.2, 1.3, 1.5 | 6–8 h | `SonarDespierto.exe` + prueba de humo automatizada |

```text
1.1 ──► 1.2 ──► 1.3 ──┐
  │                   ├──► 1.5 ──► 1.6 ──► GATE F1
  └──► 1.4 ───────────┘
```

**Orden de merge a `main`:** 1.1 → 1.2 → 1.4 → 1.3 → 1.5 → 1.6. La 1.4 puede integrarse en cuanto pase sus criterios, porque no depende del backend.

---

## 1. Objetivo de la Fase 1

Construir la **base técnica completa** sobre la que se montarán todos los módulos. Al cerrar la fase debe poder demostrarse:

> Doble clic en `SonarDespierto.exe` → se abre la consola con el banner y el navegador en `http://localhost:8765` → pantalla de **Login** con el diseño de Lovable → el administrador entra con las credenciales iniciales → el sistema le **obliga a cambiar su contraseña** → ve el **panel** con el menú lateral según su rol y permisos (con los módulos aún como "Próximamente") → cierra sesión. Con `LAN_MODE=true`, otra PC de la oficina entra por `http://<IP>:8765`.

**Fuera del alcance de la Fase 1:** CRUD de usuarios desde la interfaz (F2), cualquier módulo de negocio (F3–F7), instalador formal y respaldos (F8).

---

## 2. [A] Bloque de contexto global — copiar al inicio de CADA prompt

```text
ROL: Eres un desarrollador senior full-stack (Python/FastAPI y React/TypeScript) que trabaja en el
proyecto "Sistema de Gestión Soñar Despierto", bajo la dirección de un líder técnico. Ejecuta
ÚNICAMENTE la subtarea indicada y respeta al pie de la letra los "Contratos compartidos".

PROYECTO
- Cliente: Soñar Despierto Veracruz (asociación sin fines de lucro). Organiza eventos de Navidad y
  Día del Niño: voluntarios, niños beneficiarios, escuelas, tutores, cartas de Navidad, calendario de
  actividades e inventario.
- Repositorio Git: "Sonar-Despierto-OS". Sistema operativo objetivo: Windows 10/11. Comandos en
  PowerShell.
- MVP LOCAL: el usuario hace doble clic en SonarDespierto.exe → arranca un servidor local → se abre el
  navegador en http://localhost:8765 → Login → panel con los módulos permitidos. Opcionalmente
  (LAN_MODE=true) otras 2–3 PCs de la oficina entran por http://<IP-del-anfitrión>:8765.
- FUTURO: migración a la nube (MySQL/PostgreSQL, HTTPS, registro público por enlace). El código debe
  ser modular, desacoplado y portable.

STACK (decisiones aprobadas en docs/adr/)
- Backend: Python 3.12, FastAPI 0.115, Uvicorn, SQLAlchemy 2.0 (estilo tipado Mapped[...]), Alembic,
  Pydantic v2 + pydantic-settings, bcrypt, PyJWT. Pruebas: pytest + TestClient. Calidad: Ruff.
- Base de datos: SQLite en el MVP local, con reglas de portabilidad para migrar a MySQL/PostgreSQL
  (ADR-0002): enums como VARCHAR+CHECK, ids con IdType, fechas UTC, naming convention, Alembic con
  render_as_batch.
- Frontend: SPA con React 19 + TypeScript strict + Vite + Tailwind CSS 4 + shadcn/ui, TanStack Router
  (rutas por archivo) y TanStack Query, basada en el diseño exportado de Lovable (ADR-0001).
  Pruebas: Vitest + Testing Library. Node 22 LTS solo para desarrollo.
- Ejecución: un solo proceso; FastAPI sirve la API (/api/v1) y la SPA compilada (frontend/dist) en el
  mismo puerto. PyInstaller (one-folder) genera dist/SonarDespierto/SonarDespierto.exe (ADR-0003).
- Acceso: roles ADMIN (todo) y OPERADOR (solo módulos asignados). Voluntarios, niños y tutores son
  registros SIN cuenta (ADR-0004). Autenticación JWT según ADR-0007.
- Backend organizado por módulos de dominio: backend/app/modules/<modulo>/{models,schemas,service,
  router}.py (ADR-0005).

REGLAS OBLIGATORIAS
1. Alcance: implementa SOLO lo que pide la subtarea. Si detectas algo necesario fuera de alcance, NO lo
   implementes: déjalo como comentario "TODO(F<fase>): ..." y repórtalo.
2. Contratos: los nombres de archivos, rutas, variables de entorno, endpoints, esquemas JSON, códigos
   de error, tipos y claves de módulo de los "Contratos compartidos" son obligatorios. Si uno te parece
   incorrecto, detente y repórtalo en lugar de improvisar.
3. Idioma: código, tablas, columnas, variables y rutas de API en inglés. Textos de interfaz, mensajes
   de error de la API (campo "message") y comentarios en español.
4. Seguridad: nunca escribas en logs ni en consola contraseñas, tokens ni datos personales de niños.
   Los permisos se validan SIEMPRE en el backend; el frontend solo oculta.
5. Portabilidad: pathlib para rutas de archivos; nada de rutas absolutas fijas; nada de SQL específico
   de un motor; todo cambio de esquema mediante una migración de Alembic.
6. Calidad: type hints obligatorios en Python; TypeScript strict sin any implícito; cada funcionalidad
   con pruebas automatizadas. Deben pasar (según lo que exista): "ruff check .", "ruff format --check .",
   "pytest", "npm run lint", "npm run typecheck", "npm test".
7. Dependencias: usa exactamente las versiones indicadas. No agregues dependencias no listadas sin
   justificarlo en tu entrega.
8. No modifiques archivos que pertenecen a otras subtareas, salvo los que tu subtarea enumera.
9. Git: trabaja en la rama indicada; commits pequeños, en español, con prefijo convencional
   (feat:, fix:, chore:, test:, docs:, refactor:, build:).

FORMATO DE TU ENTREGA (al terminar)
A. Resumen de lo realizado (5–10 líneas).
B. Tabla de archivos creados / modificados / eliminados.
C. Salida resumida de los comandos de verificación que ejecutaste.
D. Checklist de criterios de aceptación con ✅/❌ y evidencia de cada uno.
E. Desviaciones respecto al documento y su justificación (o "Ninguna").
F. TODOs y riesgos detectados para fases siguientes.
```

---

## 3. [B] Contratos compartidos de la Fase 1 — fuente única de verdad

### 3.1 Estructura del repositorio al cerrar la Fase 1

Entre corchetes, la subtarea que crea o modifica cada elemento.

```text
Sonar-Despierto-OS/
├── .gitattributes                         [1.1]
├── .gitignore                             [1.1]
├── README.md                              [1.1 → 1.6]
├── docs/
│   ├── adr/ (README + 0001..0007)         [ya existe]
│   ├── fases/Fase_1_Prompts_Task_Document.md
│   ├── Roadmap_Fases.md
│   └── Requerimientos_Tecnicos.md, Modelo_Datos.md, API_Spec.md, Pantallas_UI.md, Arquitectura_y_Convenciones.md
├── backend/
│   ├── .env.example                       [1.2]
│   ├── alembic.ini                        [1.2]
│   ├── alembic/
│   │   ├── env.py, script.py.mako         [1.2]
│   │   └── versions/0001_usuarios_permisos_auditoria.py   [1.3]
│   ├── app/
│   │   ├── __init__.py                    [1.1]  (__version__ = "0.1.0")
│   │   ├── main.py                        [1.2, 1.3]  create_app() + app
│   │   ├── core/
│   │   │   ├── paths.py                   [1.2]  directorios del programa y de datos
│   │   │   ├── config.py                  [1.2]  Settings
│   │   │   ├── logging.py                 [1.2]
│   │   │   ├── errors.py                  [1.2]  AppError + manejadores
│   │   │   ├── modules.py                 [1.3]  UserRole, ModuleKey, MODULE_LABELS
│   │   │   ├── security.py                [1.3]  bcrypt, JWT, política de contraseñas
│   │   │   └── deps.py                    [1.3]  get_db, get_current_user, require_admin, require_module
│   │   ├── db/
│   │   │   ├── base.py                    [1.2]  Base + naming convention + TimestampMixin
│   │   │   ├── types.py                   [1.2]  IdType, utcnow, enum_column
│   │   │   ├── session.py                 [1.2]  get_engine, new_session, get_db
│   │   │   ├── migrate.py                 [1.2]  run_migrations()
│   │   │   ├── models_registry.py         [1.2, 1.3]
│   │   │   └── startup.py                 [1.2, 1.3]  run_startup_tasks()
│   │   ├── shared/
│   │   │   ├── schemas.py                 [1.3]  ORMModel, UtcDateTime
│   │   │   └── spa.py                     [1.2]  mount_spa()
│   │   └── modules/
│   │       ├── health/router.py           [1.1, 1.2]
│   │       ├── users/{models,schemas,service}.py   [1.3]
│   │       ├── audit/{models,service}.py  [1.3]
│   │       └── auth/{router,service,schemas,rate_limit}.py  [1.3]
│   ├── scripts/
│   │   ├── __init__.py                    [1.3]
│   │   ├── seed.py, create_user.py        [1.3]
│   │   └── create_database_mysql.sql      [1.1]  (solo referencia para la nube)
│   ├── tests/                             [1.2, 1.3, 1.6]
│   ├── pyproject.toml                     [1.1]  (Ruff + pytest)
│   ├── requirements.txt / requirements-dev.txt / requirements-mysql.txt   [1.1, 1.2]
├── frontend/                              [1.4, 1.5]
│   ├── index.html, package.json, vite.config.ts, vitest.config.ts, tsconfig.json,
│   │   eslint.config.js, components.json, .prettierrc, .prettierignore
│   ├── public/ (favicon.ico, robots.txt)
│   └── src/
│       ├── main.tsx, router.tsx, routeTree.gen.ts (generado y versionado), styles.css
│       ├── components/ui/ (shadcn de Lovable), components/sd/ (shell, ui, module-placeholder)
│       ├── features/auth/ (login-form.tsx, change-password-form.tsx, password-strength.tsx)
│       ├── hooks/, lib/ (utils.ts, password.ts, navigation.ts, page-title.ts,
│       │   domain/access.ts, domain/letters.ts, api/types.ts, api/client.ts,
│       │   auth/tokens.ts, auth/auth-context.tsx, auth/guards.ts)
│       ├── routes/ (__root, index, login, app, app/*)
│       └── test/
├── launcher/                              [1.6]
│   ├── launcher.py, sonar_despierto.spec, config.env.template, LEEME_USUARIO.txt
│   └── assets/icon.ico
└── scripts/                               [1.1, 1.4, 1.6]
    ├── setup-dev.ps1, dev-backend.ps1, dev-frontend.ps1, build.ps1
    ├── crear-acceso-directo.ps1, smoke_test.py, Iniciar-SonarDespierto.bat
```

### 3.2 Puertos y URLs

| Contexto | API | Interfaz |
|---|---|---|
| Desarrollo | `http://127.0.0.1:8000/api/v1` (`uvicorn --reload`) · Swagger `http://127.0.0.1:8000/docs` | `http://localhost:5173` (Vite; proxy de `/api` → `127.0.0.1:8000`) |
| Ejecutable (local) | `http://localhost:8765/api/v1` | `http://localhost:8765/` (mismo origen) |
| Ejecutable (LAN) | `http://<IP-anfitrión>:8765/api/v1` | `http://<IP-anfitrión>:8765/` |

### 3.3 Directorio de datos (`DATA_DIR`)

Orden de resolución (en `app/core/paths.py`):

1. variable de entorno `SD_DATA_DIR` (si existe);
2. si corre como ejecutable (`sys.frozen`): `%LOCALAPPDATA%\SonarDespierto`;
3. si corre desde el código fuente: `<raíz del repo>/.data`.

Contenido:

```text
{DATA_DIR}/
├── sonar.db  (+ sonar.db-wal, sonar.db-shm)   base de datos SQLite
├── secret.key                                  clave JWT generada en el primer arranque
├── config.env                                  configuración editable por el usuario (PORT, LAN_MODE)
├── CREDENCIALES_INICIALES.txt                  temporal: se borra cuando el admin cambia su contraseña
├── logs/sonar.log                              rotativo (5 MB × 5)
├── uploads/                                    archivos subidos (Fase 4)
└── backups/                                    respaldos (Fase 8)
```

### 3.4 Configuración (`app/core/config.py` → `Settings`)

**Precedencia:** variables de entorno > `{DATA_DIR}/config.env` > `backend/.env` > valores por defecto.

| Variable | Tipo | Valor por defecto | Descripción |
|---|---|---|---|
| `APP_ENV` | `development` \| `test` \| `production` | `production` si es ejecutable, si no `development` | Entorno |
| `DATABASE_URL` | str | `""` → `sqlite:///{DATA_DIR}/sonar.db` | URL SQLAlchemy |
| `HOST` | str | `127.0.0.1` | Interfaz de escucha cuando `LAN_MODE=false` |
| `PORT` | int | `8765` | Puerto del ejecutable (en desarrollo lo decide `uvicorn`) |
| `LAN_MODE` | bool | `false` | `true` → escucha en `0.0.0.0` |
| `JWT_SECRET_KEY` | str | `""` → leída o creada en `{DATA_DIR}/secret.key` | Valores que empiezan con `CAMBIAR` se tratan como vacíos |
| `JWT_ALGORITHM` | str | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `30` | |
| `REFRESH_TOKEN_EXPIRE_HOURS` | int | `12` | Sustituye a `REFRESH_TOKEN_EXPIRE_DAYS` |
| `CORS_ORIGINS` | list[str] (JSON) | `["http://localhost:5173","http://127.0.0.1:5173"]` | Solo se aplica si `APP_ENV != production` |
| `SPA_DIR` | str | `""` → `paths.DEFAULT_SPA_DIR` | Carpeta con `index.html` compilado |
| `AUTO_MIGRATE` | bool | `true` | Ejecutar migraciones y semilla al arrancar |
| `ENABLE_DOCS` | bool \| None | `None` → `true` salvo en `production` | Swagger `/docs`, `/redoc`, `/openapi.json` |
| `FIRST_ADMIN_EMAIL` | str | `admin@sonardespierto.org` | Admin inicial |
| `FIRST_ADMIN_PASSWORD` | str | `""` → aleatoria | Si se genera, se escribe en `CREDENCIALES_INICIALES.txt` |
| `LOGIN_MAX_ATTEMPTS` | int | `5` | Intentos fallidos permitidos… |
| `LOGIN_WINDOW_MINUTES` | int | `15` | …dentro de esta ventana |
| `MAX_UPLOAD_MB` | int | `5` | (Fase 4) |

Propiedades derivadas obligatorias: `database_url`, `is_sqlite`, `bind_host` (`"0.0.0.0"` si `LAN_MODE`), `spa_dir: Path`, `docs_enabled: bool`, `data_dir: Path`.

### 3.5 Roles y catálogo de módulos (`app/core/modules.py`)

```python
from enum import StrEnum

class UserRole(StrEnum):
    ADMIN = "ADMIN"
    OPERADOR = "OPERADOR"

class ModuleKey(StrEnum):          # el orden define el orden del menú
    VOLUNTARIOS = "VOLUNTARIOS"
    BENEFICIARIOS = "BENEFICIARIOS"   # niños, escuelas, tutores (datos de menores)
    EVENTOS = "EVENTOS"
    CARTAS = "CARTAS"
    CALENDARIO = "CALENDARIO"
    INVENTARIO = "INVENTARIO"
    REPORTES = "REPORTES"

MODULE_LABELS: dict[ModuleKey, str] = {
    ModuleKey.VOLUNTARIOS: "Voluntarios",
    ModuleKey.BENEFICIARIOS: "Beneficiarios",
    ModuleKey.EVENTOS: "Eventos",
    ModuleKey.CARTAS: "Cartas de Navidad",
    ModuleKey.CALENDARIO: "Calendario",
    ModuleKey.INVENTARIO: "Inventario",
    ModuleKey.REPORTES: "Reportes",
}
ALL_MODULES: tuple[ModuleKey, ...] = tuple(ModuleKey)
```

Reglas: `ADMIN` tiene **todos** los módulos y las funciones de administración. `OPERADOR` solo tiene los módulos de `user_module_permissions`. La gestión de usuarios **no** es un módulo: es exclusiva de `ADMIN`. El frontend replica estos valores en `src/lib/domain/access.ts`.

### 3.6 Modelo de datos de la Fase 1

Convenciones (ADR-0002): ids `IdType`; enums `VARCHAR` + `CHECK` (`native_enum=False`, `create_constraint=True`, con `name=`); fechas `DateTime` UTC sin zona; `created_at`/`updated_at` con `TimestampMixin`.

**`users`**

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id` | IdType | PK |
| `email` | String(255) | NOT NULL, UNIQUE (`uq_users_email`), guardado en minúsculas y sin espacios |
| `password_hash` | String(255) | NOT NULL, bcrypt; nunca sale en la API |
| `role` | Enum `user_role` (`ADMIN`,`OPERADOR`) | NOT NULL, default `OPERADOR` |
| `first_name` | String(80) | NOT NULL |
| `last_name` | String(120) | NOT NULL |
| `phone` | String(20) | NULL |
| `is_active` | Boolean | NOT NULL, default `true` |
| `must_change_password` | Boolean | NOT NULL, default `true` |
| `token_version` | Integer | NOT NULL, default `0` (ADR-0007) |
| `last_login_at` | DateTime | NULL |
| `created_at`, `updated_at` | DateTime | NOT NULL |

Índice: `idx_users_role_is_active (role, is_active)`.

**`user_module_permissions`**

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | IdType | PK |
| `user_id` | IdType | FK → `users.id` `ON DELETE CASCADE`, NOT NULL |
| `module` | Enum `module_key` (valores de `ModuleKey`) | NOT NULL |
| `created_at` | DateTime | NOT NULL |

`UNIQUE (user_id, module)` → `uq_user_module_permissions_user_id_module`.

**`audit_logs`** (igual que `Modelo_Datos.md` §4.10)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | IdType | PK |
| `user_id` | IdType | FK → `users.id` `ON DELETE SET NULL`, NULL |
| `action` | String(30) | `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET` (más en fases siguientes) |
| `entity` | String(50) | p. ej. `users` |
| `entity_id` | BigInteger | NULL |
| `detail` | JSON | NULL; **nunca** contraseñas ni tokens |
| `ip_address` | String(45) | NULL |
| `created_at` | DateTime | NOT NULL |

Índices: `idx_audit_logs_entity_entity_id`, `idx_audit_logs_user_id_created_at`.

### 3.7 Contrato de la API de la Fase 1 (base `/api/v1`)

| # | Método y ruta | Acceso | Respuesta OK | Errores |
|---|---|---|---|---|
| 1 | `GET /health` | público | `200 {"status":"ok","app":"sonar-despierto","version":"0.1.0"}` | — |
| 2 | `GET /health/db` | público | `200 {"status":"ok","database":"sqlite"}` (nombre del dialecto) | `503 DB_UNAVAILABLE` |
| 3 | `POST /auth/login` | público | `200 TokenResponse` | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `429 TOO_MANY_REQUESTS` (+ `Retry-After`), `422` |
| 4 | `POST /auth/refresh` | público | `200 TokenResponse` (par nuevo) | `401 TOKEN_EXPIRED`, `401 TOKEN_INVALID`, `422` |
| 5 | `POST /auth/logout` | autenticado (permite contraseña pendiente) | `204` | `401` |
| 6 | `GET /auth/me` | autenticado (permite contraseña pendiente) | `200 UserMe` | `401` |
| 7 | `POST /auth/change-password` | autenticado (permite contraseña pendiente) | `200 TokenResponse` (par nuevo) | `400 INVALID_CURRENT_PASSWORD`, `400 PASSWORD_REUSED`, `422`, `401` |

**Esquemas**

```jsonc
// LoginRequest
{ "email": "admin@sonardespierto.org", "password": "********" }

// RefreshRequest
{ "refresh_token": "eyJ..." }

// ChangePasswordRequest
{ "current_password": "********", "new_password": "********" }

// UserMe
{
  "id": 1,
  "email": "admin@sonardespierto.org",
  "first_name": "Administrador",
  "last_name": "General",
  "role": "ADMIN",
  "is_active": true,
  "must_change_password": true,
  "modules": ["VOLUNTARIOS","BENEFICIARIOS","EVENTOS","CARTAS","CALENDARIO","INVENTARIO","REPORTES"],
  "last_login_at": "2026-10-17T23:50:00Z"
}

// TokenResponse
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": { /* UserMe */ }
}

// Error (formato existente de API_Spec.md §1.5)
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Correo o contraseña incorrectos.", "details": null } }
```

**Reglas:**

- `email` del login: se recorta y se pasa a minúsculas; **no** se valida el formato (no revelar información).
- Política de contraseña (`new_password`): de 8 a 72 caracteres (máximo 72 **bytes** UTF-8), al menos una letra y un número. Si no se cumple → `422 VALIDATION_ERROR` con `details[].message` = `"La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número."`.
- Fechas-hora en la API: ISO 8601 en UTC con sufijo `Z`.
- Cualquier endpoint protegido (que no sea #5–#7) con un usuario `must_change_password=true` → `403 PASSWORD_CHANGE_REQUIRED`.
- `require_module(m)` sin permiso → `403 MODULE_FORBIDDEN` (`"No tienes acceso al módulo {etiqueta}."`). `require_admin` sin ser ADMIN → `403 FORBIDDEN`.

**Catálogo de códigos de error de la Fase 1**

| HTTP | `code` | `message` (exacto) |
|---|---|---|
| 401 | `NOT_AUTHENTICATED` | No has iniciado sesión o tu sesión expiró. |
| 401 | `TOKEN_EXPIRED` | Tu sesión expiró. Inicia sesión de nuevo. |
| 401 | `TOKEN_INVALID` | La sesión no es válida. Inicia sesión de nuevo. |
| 401 | `INVALID_CREDENTIALS` | Correo o contraseña incorrectos. |
| 403 | `ACCOUNT_DISABLED` | Tu cuenta está desactivada. Contacta al administrador. |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Debes cambiar tu contraseña antes de continuar. |
| 403 | `FORBIDDEN` | No tienes permiso para realizar esta acción. |
| 403 | `MODULE_FORBIDDEN` | No tienes acceso al módulo {etiqueta}. |
| 400 | `INVALID_CURRENT_PASSWORD` | La contraseña actual no es correcta. |
| 400 | `PASSWORD_REUSED` | La nueva contraseña debe ser distinta de la actual. |
| 409 | `EMAIL_ALREADY_EXISTS` | Ya existe un usuario con ese correo. |
| 422 | `VALIDATION_ERROR` | Revisa los datos enviados. |
| 429 | `TOO_MANY_REQUESTS` | Demasiados intentos fallidos. Intenta de nuevo en {n} minutos. |
| 503 | `DB_UNAVAILABLE` | No se pudo conectar a la base de datos. |
| 500 | `INTERNAL_ERROR` | Ocurrió un error inesperado. |

### 3.8 JWT

- Firma `HS256` con `settings.JWT_SECRET_KEY` (resuelta según §3.4).
- Claims: `sub` (id como **texto**), `role`, `type` (`"access"` \| `"refresh"`), `ver` (= `users.token_version`), `iat`, `exp`.
- Validación en cada petición: firma y `exp` (si expiró → `TOKEN_EXPIRED`); `type` correcto (si no → `TOKEN_INVALID`); usuario existente y activo (si no → `401 NOT_AUTHENTICATED`); `ver == token_version` (si no → `TOKEN_INVALID`).
- `logout` y `change-password` incrementan `token_version`.

### 3.9 Rutas del frontend

| Ruta | Acceso | Contenido en la Fase 1 |
|---|---|---|
| `/` | — | Redirige a `/app` si hay sesión, si no a `/login` |
| `/login` | público (con sesión → `/app`) | Login (diseño de Lovable) |
| `/app` | autenticado | Inicio: saludo y tarjetas de los módulos visibles |
| `/app/calendario` | módulo `CALENDARIO` | Placeholder "Fase 5" |
| `/app/eventos` | `EVENTOS` | Placeholder "Fase 4" |
| `/app/cartas` | `CARTAS` | Placeholder "Fase 4" |
| `/app/buscar` | `CARTAS` | Placeholder "Fase 4" (búsqueda por código) |
| `/app/ninos` | `BENEFICIARIOS` | Placeholder "Fase 3" |
| `/app/escuelas` | `BENEFICIARIOS` | Placeholder "Fase 3" |
| `/app/tutores` | `BENEFICIARIOS` | Placeholder "Fase 3" |
| `/app/voluntarios` | `VOLUNTARIOS` | Placeholder "Fase 3" |
| `/app/inventario` | `INVENTARIO` | Placeholder "Fase 6" |
| `/app/reportes` | `REPORTES` | Placeholder "Fase 7" |
| `/app/usuarios` | solo `ADMIN` | Placeholder "Fase 2" |
| `/app/perfil` | autenticado | Datos de la cuenta (solo lectura) |
| `/app/cambiar-contrasena` | autenticado | Formulario funcional; obligatorio si `must_change_password` |
| `/app/sin-acceso` | autenticado | Mensaje "No tienes acceso a este módulo" |

Guardas: sin sesión → `/login?redirect=<ruta>` (solo se aceptan destinos que empiecen con `/app`). Con `must_change_password` → cualquier ruta de `/app` redirige a `/app/cambiar-contrasena` y el menú se oculta. Ruta de módulo sin permiso → `/app/sin-acceso`.

### 3.10 Dependencias exactas

**`backend/requirements.txt`** (al cerrar la 1.2)

```text
fastapi==0.115.6
uvicorn[standard]==0.32.1
sqlalchemy==2.0.36
alembic==1.14.0
pydantic-settings==2.7.0
email-validator==2.2.0
bcrypt==4.2.1
PyJWT==2.10.1
```

**`backend/requirements-dev.txt`**

```text
-r requirements.txt
pytest==8.3.4
httpx==0.28.1
ruff==0.8.4
pyinstaller==6.11.1
```

**`backend/requirements-mysql.txt`** (solo para la futura nube)

```text
-r requirements.txt
pymysql==1.1.1
cryptography==44.0.0
```

**Frontend:** el `package.json` completo está en el prompt 1.4. Requiere **Node 22 LTS** (≥ 22.12).

---

## 4. [C] Prompts por subtarea

---

### 4.1 Subtarea 1.1 — Saneamiento del repositorio y estructura modular

`▶ INICIO DEL PROMPT 1.1`

**Rama:** `feat/f1-1-estructura` (desde `main`, commit `b11e96a`) · **Depende de:** nada

#### Objetivo
Dejar el repositorio limpio y con la estructura modular de ADR-0005, sin cambiar comportamiento: normalizar los fines de línea, actualizar `.gitignore`, eliminar archivos obsoletos, mover el router de salud a `app/modules/health/`, agregar la configuración de Ruff y pytest, actualizar las dependencias y crear el script de preparación del entorno.

#### Contexto específico
- Estado actual del repo: `Main.py` (vacío, en la raíz), `frontend/index.html` (placeholder), `backend/app/{main.py, core/config.py, core/errors.py, db/base.py, db/session.py, routers/health.py}`, `backend/tests/test_health.py`, `backend/pytest.ini`, `backend/uploads/.gitkeep`, `backend/scripts/create_database.sql`, `docs/`.
- `git status` muestra unos 19 archivos "modificados", pero **son solo cambios de fin de línea** (la copia de trabajo tiene CRLF y el índice LF; `git ls-files --eol` muestra `i/lf w/crlf`). No hay cambios de contenido en el código.
- Los **únicos** cambios reales pendientes están en `docs/`: los ADR (`docs/adr/`), la hoja de ruta (`docs/Roadmap_Fases.md`), este documento (`docs/fases/`) y un aviso de actualización al inicio de los 5 documentos de diseño. Se integran en el commit del Paso 2.

#### Pasos

**Paso 1 — Verificar y crear la rama**
```powershell
git checkout main
git diff --ignore-cr-at-eol --stat -- . ":(exclude)docs"   # DEBE salir vacío. Si muestra cambios reales fuera de docs/: DETENTE y repórtalo.
git checkout -b feat/f1-1-estructura
```

**Paso 2 — Normalizar fines de línea.** Crea `.gitattributes` con exactamente:
```gitattributes
* text=auto eol=lf
*.ps1 text eol=crlf
*.bat text eol=crlf
*.cmd text eol=crlf
*.png binary
*.jpg binary
*.jpeg binary
*.ico binary
*.db binary
*.sqlite3 binary
```
Después:
```powershell
git add .gitattributes
git add --renormalize .
git add docs                   # ADR, hoja de ruta, prompts de la Fase 1 y avisos en los documentos de diseño
git commit -m "chore: normaliza fines de línea y agrega ADR, hoja de ruta y prompts de la Fase 1"
git rm -r --cached . -q
git reset --hard HEAD          # reescribe la copia de trabajo con los fines de línea correctos (seguro: todo quedó en el commit anterior)
git status                     # debe decir: nothing to commit, working tree clean
```

**Paso 3 — Reemplazar `.gitignore`** con:
```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
venv/
.pytest_cache/
.ruff_cache/
.coverage
htmlcov/

# Configuración local y secretos
.env
*.env.local
secret.key
CREDENCIALES_INICIALES.txt

# Datos locales: BD SQLite, logs, archivos subidos (ADR-0003)
.data/
*.db
*.db-wal
*.db-shm
*.sqlite3
logs/
*.log

# Node / frontend
node_modules/
frontend/dist/
frontend/.tanstack/
coverage/

# Empaquetado (PyInstaller)
build/
dist/

# Editor / sistema operativo
.vscode/*
!.vscode/extensions.json
.idea/
.DS_Store
Thumbs.db
```

**Paso 4 — Eliminar lo obsoleto**
```powershell
git rm Main.py
git rm -r frontend            # el placeholder se reemplaza por la SPA en la subtarea 1.4
git rm -r backend/uploads     # los archivos subidos viven en el directorio de datos (ADR-0003)
git rm backend/pytest.ini     # su configuración pasa a backend/pyproject.toml
```

**Paso 5 — Estructura modular del backend**
```powershell
New-Item -ItemType Directory -Force backend/app/modules/health, backend/app/shared | Out-Null
git mv backend/app/routers/health.py backend/app/modules/health/router.py
git rm backend/app/routers/__init__.py
```
Crea archivos `__init__.py` vacíos (con un docstring de una línea) en `backend/app/modules/`, `backend/app/modules/health/` y `backend/app/shared/`.
En `backend/app/main.py` cambia **solo** la importación y el registro del router:
```python
from app.modules.health.router import router as health_router
...
app.include_router(health_router, prefix=settings.API_PREFIX)
```
En `backend/app/modules/health/router.py` cambia el `summary` de `/health/db` a `"Estado de la conexión a la base de datos"`. Nada más (la subtarea 1.2 lo reescribe).

**Paso 6 — Versión de la app.** En `backend/app/__init__.py`:
```python
"""Sistema de Gestión Soñar Despierto — backend."""

__version__ = "0.1.0"
```

**Paso 7 — Script SQL de MySQL como referencia.** `git mv backend/scripts/create_database.sql backend/scripts/create_database_mysql.sql` y agrega al inicio:
```sql
-- SOLO REFERENCIA PARA LA FUTURA MIGRACIÓN A LA NUBE (MySQL 8).
-- El MVP local usa SQLite y no necesita este script (ver docs/adr/0002-sqlite-local-con-orm-portable.md).
```

**Paso 8 — Dependencias**
- `backend/requirements.txt`: la lista de §3.10 **más** temporalmente `pymysql==1.1.1` y `cryptography==44.0.0`, porque el código actual aún crea el motor con la URL de MySQL. La subtarea 1.2 los moverá a `requirements-mysql.txt`.
- `backend/requirements-dev.txt`: exactamente como en §3.10.

**Paso 9 — `backend/pyproject.toml`** (solo configuración de herramientas):
```toml
[tool.ruff]
line-length = 100
target-version = "py312"
extend-exclude = ["alembic/versions"]

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "S", "SIM"]
ignore = ["S101"]           # assert permitido (pruebas)

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S105", "S106"]   # contraseñas de prueba en literales

[tool.ruff.lint.isort]
known-first-party = ["app", "scripts"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
addopts = "-q"
```

**Paso 10 — Scripts de desarrollo** (carpeta `scripts/` en la raíz, con CRLF por `.gitattributes`):

`scripts/setup-dev.ps1`:
```powershell
# Prepara el entorno de desarrollo. Uso: powershell -ExecutionPolicy Bypass -File scripts\setup-dev.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Backend: entorno virtual con Python 3.12" -ForegroundColor Cyan
if (-not (Test-Path "backend\.venv")) {
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3.12 -m venv backend\.venv }
    else { python -m venv backend\.venv }
}
& backend\.venv\Scripts\python.exe --version
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip
& backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
if (-not (Test-Path "backend\.env")) {
    Copy-Item backend\.env.example backend\.env
    Write-Host "    Se creó backend\.env a partir de .env.example"
}

if (Test-Path "frontend\package.json") {
    Write-Host "==> Frontend: dependencias (requiere Node 22 LTS)" -ForegroundColor Cyan
    node --version
    Push-Location frontend; npm install; Pop-Location
}
Write-Host "Listo. Backend: scripts\dev-backend.ps1  |  Frontend: scripts\dev-frontend.ps1" -ForegroundColor Green
```

`scripts/dev-backend.ps1`:
```powershell
# Levanta la API en modo desarrollo con recarga automática (http://127.0.0.1:8000/docs)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $Root "backend")
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Paso 11 — Carpeta del lanzador.** Crea `launcher/README.md` con: `# Lanzador\n\nSe implementa en la subtarea 1.6 (ver docs/fases/Fase_1_Prompts_Task_Document.md).`

**Paso 12 — README.** Actualiza `README.md`: conserva el título, la descripción y la imagen. Reemplaza "Requisitos" y "Puesta en marcha" por:
- Requisitos de desarrollo: Windows 10/11, Python 3.12, Node 22 LTS, Git.
- Puesta en marcha: `powershell -ExecutionPolicy Bypass -File scripts\setup-dev.ps1`, después `scripts\dev-backend.ps1`.
- Enlaces a `docs/Roadmap_Fases.md`, `docs/adr/` y `docs/fases/`.
- Sección "Estado": Fase 1 en curso, con la lista de subtareas 1.1–1.6 (1.1 marcada).

**Paso 13 — Verificar**
```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\ruff.exe format .
.\.venv\Scripts\ruff.exe check . --fix
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\python.exe -m pytest
```
Las 3 pruebas existentes (`test_health.py`) deben pasar **sin modificarlas** (salvo el formato de Ruff). Nota: hoy `/health/db` intenta conectar a MySQL; ninguna prueba lo usa todavía.

#### Fuera de alcance
Cambiar configuración, base de datos o lógica (1.2); crear el frontend (1.4).

#### Criterios de aceptación
- [ ] `git status` limpio tras el Paso 2; `git ls-files --eol` muestra `i/lf w/lf` en `.py`/`.md` (y `crlf` en `.ps1`).
- [ ] No existen: `Main.py`, `frontend/`, `backend/uploads/`, `backend/pytest.ini`, `backend/app/routers/`.
- [ ] Existen: `backend/app/modules/health/router.py`, `backend/app/modules/__init__.py`, `backend/app/shared/__init__.py`, `backend/pyproject.toml`, `backend/requirements-dev.txt`, `backend/scripts/create_database_mysql.sql`, `scripts/setup-dev.ps1`, `scripts/dev-backend.ps1`, `launcher/README.md`.
- [ ] `ruff check .` y `ruff format --check .` sin errores (desde `backend/`).
- [ ] `pytest`: 3 pruebas pasan.
- [ ] `scripts\setup-dev.ps1` termina sin errores en una copia limpia del repo (sin `.venv`).
- [ ] `scripts\dev-backend.ps1` levanta la API y `http://127.0.0.1:8000/api/v1/health` responde `{"status":"ok"}`.
- [ ] README actualizado.

**Commit final sugerido:** `chore: reestructura el repositorio en módulos y agrega herramientas de desarrollo`

`■ FIN DEL PROMPT 1.1`

---

### 4.2 Subtarea 1.2 — Núcleo backend: configuración, datos locales, SQLite, Alembic y SPA

`▶ INICIO DEL PROMPT 1.2`

**Rama:** `feat/f1-2-nucleo-backend` · **Depende de:** 1.1 integrada en `main`

#### Objetivo
Dejar listo el núcleo del backend del que dependen todos los módulos: rutas de programa y de datos (desarrollo y ejecutable), configuración por capas, motor SQLite portable con *pragmas*, base declarativa con *naming convention*, tipos portables, Alembic configurado (incluido el ejecutable), logging a archivo, *factory* `create_app()` con *lifespan*, servicio de la SPA compilada con *fallback* y cabeceras de seguridad.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `backend/app/core/paths.py`, `backend/app/core/logging.py`, `backend/app/db/types.py`, `backend/app/db/migrate.py`, `backend/app/db/models_registry.py`, `backend/app/db/startup.py`, `backend/app/shared/spa.py`, `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/.gitkeep`, `backend/requirements-mysql.txt`, `backend/tests/conftest.py`, `backend/tests/test_config.py`, `backend/tests/test_database.py`, `backend/tests/test_spa.py`, `backend/tests/test_migrations.py` |
| Reescribir | `backend/app/core/config.py`, `backend/app/db/base.py`, `backend/app/db/session.py`, `backend/app/main.py`, `backend/app/modules/health/router.py`, `backend/.env.example` |
| Modificar | `backend/app/core/errors.py`, `backend/requirements.txt` (quitar `pymysql` y `cryptography`), `backend/tests/test_health.py` |

#### Especificación

**1. `app/core/paths.py`** — sin dependencias de `config` (se importa primero):
```python
"""Rutas del programa y del directorio de datos (ADR-0003). Funciona desde el código fuente y como ejecutable."""
import os
import sys
from pathlib import Path

APP_FOLDER_NAME = "SonarDespierto"
IS_FROZEN: bool = bool(getattr(sys, "frozen", False))

if IS_FROZEN:  # PyInstaller one-folder: los datos empaquetados viven en sys._MEIPASS
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS"))
    BACKEND_DIR = BUNDLE_DIR / "backend"
else:
    BACKEND_DIR = Path(__file__).resolve().parents[2]  # .../backend
    BUNDLE_DIR = BACKEND_DIR.parent                     # raíz del repositorio

ALEMBIC_DIR = BACKEND_DIR / "alembic"
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
DEFAULT_SPA_DIR = BUNDLE_DIR / "frontend" / "dist"


def resolve_data_dir() -> Path:
    """Orden: SD_DATA_DIR > %LOCALAPPDATA%/SonarDespierto (ejecutable) > <repo>/.data (fuente)."""
    env_dir = os.environ.get("SD_DATA_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()
    if IS_FROZEN:
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / APP_FOLDER_NAME
    return BUNDLE_DIR / ".data"


DATA_DIR: Path = resolve_data_dir()


def ensure_data_dirs(data_dir: Path = DATA_DIR) -> None:
    for sub in ("", "logs", "uploads", "backups"):
        (data_dir / sub).mkdir(parents=True, exist_ok=True)
```

**2. `app/core/config.py`** — `Settings(BaseSettings)` con **todas** las variables de §3.4, sus valores por defecto y las propiedades derivadas:
- `model_config = SettingsConfigDict(env_file=(BACKEND_DIR / ".env", DATA_DIR / "config.env"), env_file_encoding="utf-8", extra="ignore")`. En pydantic-settings, el **último** archivo de la tupla tiene prioridad (por eso `config.env` va al final); las variables de entorno ganan a ambos.
- `APP_NAME = "Soñar Despierto"`, `APP_ID = "sonar-despierto"` (el lanzador lo usa para reconocer su instancia), `API_PREFIX = "/api/v1"`.
- `model_validator(mode="after")` que resuelve `JWT_SECRET_KEY`: si está vacía o empieza con `"CAMBIAR"`, llama a `ensure_data_dirs()` y lee `{DATA_DIR}/secret.key`; si no existe, la crea con `secrets.token_urlsafe(64)` y la guarda.
- Propiedades: `data_dir` (→ `DATA_DIR`), `database_url` (si `DATABASE_URL` está vacía → `f"sqlite:///{(DATA_DIR / 'sonar.db').as_posix()}"`), `is_sqlite`, `bind_host` (`"0.0.0.0"` si `LAN_MODE`, si no `HOST`; usa `# noqa: S104`), `spa_dir` (`Path(SPA_DIR)` si tiene valor, si no `DEFAULT_SPA_DIR`), `docs_enabled` (`ENABLE_DOCS` si no es `None`, si no `APP_ENV != "production"`), `is_production`.
- `@lru_cache def get_settings() -> Settings` y `settings = get_settings()`.

**3. `app/core/logging.py`** — `setup_logging(settings) -> None`, **idempotente** (no duplica *handlers* si se llama dos veces): configura el *logger* raíz en `INFO` (en `DEBUG` si `APP_ENV == "development"`), con un `StreamHandler` y un `RotatingFileHandler(DATA_DIR/"logs"/"sonar.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8")`. Formato: `"%(asctime)s %(levelname)s [%(name)s] %(message)s"`. Baja `sqlalchemy.engine` y `watchfiles` a `WARNING`. Los *loggers* de uvicorn deben propagar al raíz.

**4. `app/core/errors.py`** — conserva el formato actual y agrega:
- parámetro opcional `headers: dict[str, str] | None` en `AppError`, que el manejador incluye en la respuesta (para `Retry-After`);
- entradas `413: ("FILE_TOO_LARGE", "El archivo es demasiado grande.")` y `429: ("TOO_MANY_REQUESTS", "Demasiadas solicitudes. Intenta más tarde.")` en `HTTP_CODES`;
- el manejador genérico de `Exception` **no** debe incluir el mensaje de la excepción en la respuesta (ya cumple).

**5. `app/db/base.py`**
```python
"""Base declarativa con convención de nombres (necesaria para Alembic batch en SQLite)."""
from datetime import datetime

from sqlalchemy import DateTime, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.types import utcnow

NAMING_CONVENTION = {
    "ix": "idx_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
```

**6. `app/db/types.py`**
```python
"""Tipos y utilidades portables entre SQLite, MySQL y PostgreSQL (ADR-0002)."""
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from sqlalchemy import BigInteger, Integer
from sqlalchemy import Enum as SAEnum

IdType = BigInteger().with_variant(Integer(), "sqlite")


def utcnow() -> datetime:
    """Fecha-hora actual en UTC *sin* tzinfo (así se guarda en la BD)."""
    return datetime.now(UTC).replace(tzinfo=None)


def enum_column(enum_cls: type[Enum], name: str, length: int = 30) -> SAEnum:
    """Enum portable: VARCHAR + CHECK con nombre (no ENUM nativo)."""
    return SAEnum(
        enum_cls, name=name, native_enum=False, create_constraint=True, length=length,
        validate_strings=True, values_callable=lambda e: [m.value for m in e],
    )
```

**7. `app/db/session.py`**
- Motor **perezoso**: `get_engine()` lo crea la primera vez con `settings.database_url`. En SQLite: `connect_args={"check_same_thread": False, "timeout": 15}` y un *listener* `@event.listens_for(engine, "connect")` que ejecuta `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, `PRAGMA synchronous=NORMAL`. En otros motores: `pool_pre_ping=True, pool_recycle=3600`.
- `SessionFactory = sessionmaker(autoflush=False, expire_on_commit=False)`; `new_session() -> Session` (con `bind=get_engine()`); `get_db()` como generador de dependencia para FastAPI; `check_db_connection() -> bool`; `dispose_engine() -> None` (libera el archivo en Windows; lo usan las pruebas y el lanzador).

**8. Alembic**
- `backend/alembic.ini`: `script_location = alembic`, `sqlalchemy.url =` (vacío), `file_template = %%(rev)s_%%(slug)s`, `truncate_slug_length = 40` y las secciones estándar de logging (`loggers`, `handlers`, `formatters`).
- `backend/alembic/script.py.mako`: la plantilla estándar de Alembic.
- `backend/alembic/env.py`:
```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.db.models_registry  # noqa: F401  registra todos los modelos en Base.metadata
from app.core.config import get_settings
from app.db.base import Base

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logging", True):
    fileConfig(config.config_file_name)
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata,
                      literal_binds=True, render_as_batch=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}),
                                     prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          render_as_batch=connection.dialect.name == "sqlite", compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```
- `app/db/migrate.py`:
```python
"""Migraciones programáticas (las usa el arranque de la app y el lanzador)."""
from alembic import command
from alembic.config import Config

from app.core.config import get_settings
from app.core.paths import ALEMBIC_DIR, ALEMBIC_INI


def build_alembic_config() -> Config:
    cfg = Config(str(ALEMBIC_INI)) if ALEMBIC_INI.is_file() else Config()
    cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
    cfg.attributes["configure_logging"] = False   # no pisar el logging de la app
    return cfg


def run_migrations() -> None:
    command.upgrade(build_alembic_config(), "head")
```
- `app/db/models_registry.py`: docstring que explique su propósito; por ahora, sin importaciones (la 1.3 agrega los modelos).

**9. `app/db/startup.py`** — `run_startup_tasks() -> None`: llama a `ensure_data_dirs()`; si `settings.AUTO_MIGRATE`, ejecuta `run_migrations()`; registra `"Base de datos lista: <dialecto>"` (sin la URL completa, que en la nube podría contener credenciales). Deja `# TODO(1.3): crear administrador inicial`.

**10. `app/shared/spa.py`** — `mount_spa(app: FastAPI, spa_dir: Path) -> None`. **Se llama al final** de `create_app()`:
- Si **no** existe `spa_dir/index.html`: registra solo `GET /` (`include_in_schema=False`), que devuelve un HTML simple en español: *"La interfaz no está compilada. Ejecuta `scripts\build.ps1` o usa `npm run dev` en http://localhost:5173. La API está en /docs."*. Así no se registra ninguna ruta comodín.
- Si existe: monta `StaticFiles` en `/assets` (si la carpeta existe) y registra `GET /{full_path:path}` (`include_in_schema=False`) que:
  1. si `full_path` es `"api"` o empieza con `api/`, `docs`, `redoc` u `openapi.json` → `raise HTTPException(404)` (responde el formato estándar `NOT_FOUND`);
  2. si `full_path` no está vacío y `(spa_root / full_path).resolve()` es un **archivo dentro** de `spa_root` (`is_relative_to`) → `FileResponse` (p. ej. `favicon.ico`, `robots.txt`);
  3. en otro caso → `FileResponse(index.html)` con cabecera `Cache-Control: no-cache`.

**11. `app/main.py`**
```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    run_startup_tasks()
    yield
    dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings)
    app = FastAPI(
        title=f"{settings.APP_NAME} API", version=__version__, lifespan=lifespan,
        description="API del Sistema de Gestión Integral de Soñar Despierto.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    if settings.CORS_ORIGINS and not settings.is_production:
        app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS,
                           allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    app.middleware("http")(security_headers)   # función async definida en main.py: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: same-origin
    register_error_handlers(app)
    app.include_router(health_router, prefix=settings.API_PREFIX)
    # TODO(1.3): app.include_router(auth_router, prefix=settings.API_PREFIX)
    mount_spa(app, settings.spa_dir)           # SIEMPRE AL FINAL (ruta comodín)
    return app


app = create_app()
```

**12. `modules/health/router.py`** — `GET /health` → `{"status": "ok", "app": settings.APP_ID, "version": __version__}`; `GET /health/db` → `{"status": "ok", "database": get_engine().dialect.name}` o `503 DB_UNAVAILABLE` (lanza `AppError(503, "DB_UNAVAILABLE", "No se pudo conectar a la base de datos.")`).

**13. `backend/.env.example`** (desarrollo):
```ini
# Configuración de DESARROLLO: copiar a backend/.env.  El ejecutable usa {DATA_DIR}\config.env.
APP_ENV=development
# Vacío = SQLite en <repo>/.data/sonar.db.  Nube (futuro): mysql+pymysql://usuario:clave@host:3306/sonar_despierto
DATABASE_URL=
HOST=127.0.0.1
# PORT solo lo usa el lanzador; en desarrollo el puerto lo define uvicorn (8000)
PORT=8765
LAN_MODE=false
# Vacío = se genera y guarda en {DATA_DIR}/secret.key
JWT_SECRET_KEY=
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_HOURS=12
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
SPA_DIR=
AUTO_MIGRATE=true
FIRST_ADMIN_EMAIL=admin@sonardespierto.org
# Vacío = contraseña aleatoria escrita en {DATA_DIR}/CREDENCIALES_INICIALES.txt
FIRST_ADMIN_PASSWORD=
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MINUTES=15
MAX_UPLOAD_MB=5
```
Si tu `backend/.env` local tiene la URL de MySQL de la versión anterior, actualízalo (deja `DATABASE_URL=` vacía).

**14. Pruebas**

`tests/conftest.py` (base; la 1.3 lo amplía). Las variables deben definirse **antes** de importar `app`:
```python
"""Configuración global de pruebas: directorio de datos y BD SQLite temporales."""
import os
import shutil
import tempfile
from collections.abc import Iterator
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="sd-test-"))
os.environ.update({
    "SD_DATA_DIR": str(_TMP),
    "APP_ENV": "test",
    "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
    "JWT_SECRET_KEY": "clave-de-pruebas-" + "x" * 48,
    "FIRST_ADMIN_EMAIL": "admin@sonardespierto.org",
    "FIRST_ADMIN_PASSWORD": "Admin12345",
    "AUTO_MIGRATE": "true",
    "SPA_DIR": str(_TMP / "sin-frontend"),   # sin SPA → sin ruta comodín
    "ENABLE_DOCS": "true",
})

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def app() -> FastAPI:
    return create_app()


@pytest.fixture(scope="session")
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:   # ejecuta el lifespan (migraciones)
        yield test_client


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    from app.db.session import dispose_engine
    dispose_engine()
    shutil.rmtree(_TMP, ignore_errors=True)
```

Casos mínimos:

| Archivo | Casos |
|---|---|
| `test_health.py` | `/health` → `status`, `app == "sonar-despierto"`, `version == "0.1.0"`; `/health/db` → `database == "sqlite"`; ruta inexistente `/api/v1/no-existe` → `404` con `error.code == "NOT_FOUND"`; `/docs` → 200; cabecera `X-Content-Type-Options: nosniff` presente |
| `test_config.py` | `Settings(DATABASE_URL="").database_url` termina en `/sonar.db` dentro de `DATA_DIR`; `Settings(JWT_SECRET_KEY="")` crea `secret.key` y una segunda instancia lee **la misma** clave; `Settings(JWT_SECRET_KEY="CAMBIAR_X")` también usa el archivo; `Settings(LAN_MODE=True).bind_host == "0.0.0.0"`; `Settings(APP_ENV="production", ENABLE_DOCS=None).docs_enabled is False` |
| `test_database.py` | `PRAGMA foreign_keys` → 1; `PRAGMA journal_mode` → `wal`; `check_db_connection()` → `True`; `utcnow().tzinfo is None` |
| `test_migrations.py` | `run_migrations()` se puede ejecutar dos veces sin error (idempotente) |
| `test_spa.py` | Con una carpeta temporal `dist/` (`index.html`, `assets/app.js`, `favicon.ico`) y una `FastAPI()` nueva con `register_error_handlers` + `mount_spa`: `GET /` → index; `GET /app/cartas` → index (*deep link*); `GET /assets/app.js` → JS; `GET /favicon.ico` → archivo; `GET /api/v1/x` → 404 JSON `NOT_FOUND`; `GET /..%2F..%2Fsecret.txt` → **no** devuelve el archivo fuera de `dist`; sin `index.html` → `GET /` contiene "La interfaz no está compilada" |

#### Comandos de verificación
```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\python.exe -m pytest
cd .. ; .\scripts\dev-backend.ps1
# En otra terminal:
#   http://127.0.0.1:8000/api/v1/health      → {"status":"ok","app":"sonar-despierto","version":"0.1.0"}
#   http://127.0.0.1:8000/api/v1/health/db   → {"status":"ok","database":"sqlite"}
#   http://127.0.0.1:8000/                   → página "La interfaz no está compilada"
#   Debe existir <repo>\.data\ con sonar.db, secret.key y logs\sonar.log
.\backend\.venv\Scripts\alembic.exe -c backend\alembic.ini current   # sin error (aún sin revisiones)
```

#### Fuera de alcance
Modelos de usuarios, autenticación y semilla (1.3); frontend (1.4); lanzador (1.6).

#### Criterios de aceptación
- [ ] La API arranca sin MySQL ni `pymysql` instalados; crea `<repo>/.data/` con `sonar.db`, `secret.key` y `logs/sonar.log`.
- [ ] `SD_DATA_DIR=C:\temp\sd-prueba` hace que todo se cree en esa carpeta.
- [ ] Un `{DATA_DIR}/config.env` con `ENABLE_DOCS=false` desactiva `/docs` (precedencia correcta).
- [ ] `alembic upgrade head` funciona desde la CLI (`cd backend; alembic upgrade head`) **y** de forma programática (`run_migrations()`).
- [ ] La ruta comodín de la SPA no intercepta `/api/*`, `/docs` ni `/openapi.json`, y no permite *path traversal*.
- [ ] `requirements.txt` coincide con §3.10; existe `requirements-mysql.txt`.
- [ ] Todas las pruebas pasan; Ruff sin errores; ningún `print()` en el código de la app.

**Commit final sugerido:** `feat: núcleo backend con SQLite portable, Alembic, logging y servicio de la SPA`

`■ FIN DEL PROMPT 1.2`

---

### 4.3 Subtarea 1.3 — Usuarios, autenticación JWT y permisos por módulo

`▶ INICIO DEL PROMPT 1.3`

**Rama:** `feat/f1-3-auth` · **Depende de:** 1.2 integrada en `main`

#### Objetivo
Implementar el modelo de usuarios con permisos por módulo y la bitácora; la autenticación JWT completa (login, refresh, logout, me, change-password) según §3.7, §3.8 y ADR-0007; las dependencias de autorización reutilizables (`get_current_user`, `require_admin`, `require_module`); el límite de intentos de login; el administrador inicial; los scripts de soporte; y la primera migración de Alembic. Todo con pruebas.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `app/core/modules.py`, `app/core/security.py`, `app/core/deps.py`, `app/shared/schemas.py`, `app/modules/users/{__init__,models,schemas,service}.py`, `app/modules/audit/{__init__,models,service}.py`, `app/modules/auth/{__init__,router,service,schemas,rate_limit}.py`, `alembic/versions/0001_usuarios_permisos_auditoria.py`, `scripts/__init__.py`, `scripts/seed.py`, `scripts/create_user.py`, `tests/auth/__init__.py`, `tests/auth/test_login.py`, `tests/auth/test_rate_limit.py`, `tests/auth/test_tokens.py`, `tests/auth/test_change_password.py`, `tests/auth/test_permissions.py`, `tests/users/__init__.py`, `tests/users/test_seed.py`, `tests/users/test_service.py` |
| Modificar | `app/main.py` (incluir `auth_router`), `app/db/models_registry.py`, `app/db/startup.py`, `tests/conftest.py`, `tests/test_migrations.py` |

(Todas las rutas son relativas a `backend/`.)

#### Especificación

**1. `app/core/modules.py`** — exactamente el código de §3.5.

**2. `app/shared/schemas.py`**
```python
from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer


def _to_utc_iso(value: datetime) -> str:
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return aware.isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
```

**3. Modelos**

`app/modules/users/models.py`:
- `class User(TimestampMixin, Base)` → tabla `users` con las columnas exactas de §3.6. `role` usa `enum_column(UserRole, "user_role", 20)`. `email` con `unique=True`. `__table_args__ = (Index(None, "role", "is_active"),)` (el nombre lo pone la *naming convention*).
- Relación `module_permissions: Mapped[list["UserModulePermission"]] = relationship(back_populates="user", cascade="all, delete-orphan", lazy="selectin")`.
- `class UserModulePermission(Base)` → tabla `user_module_permissions` (§3.6), `module` con `enum_column(ModuleKey, "module_key", 30)`, `UniqueConstraint("user_id", "module")`, FK con `ondelete="CASCADE"`, `created_at` con `default=utcnow`.

`app/modules/audit/models.py`: `class AuditLog(Base)` → tabla `audit_logs` (§3.6), `detail: Mapped[dict | None] = mapped_column(JSON)`, FK `user_id` con `ondelete="SET NULL"`, dos índices compuestos.

`app/db/models_registry.py`: importa `app.modules.users.models` y `app.modules.audit.models`.

**4. `app/core/security.py`**
```python
BCRYPT_ROUNDS = 12
PASSWORD_POLICY_MESSAGE = "La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número."

def hash_password(password: str) -> str: ...            # bcrypt.hashpw(pw.encode(), bcrypt.gensalt(BCRYPT_ROUNDS)).decode()
def verify_password(password: str, password_hash: str) -> bool: ...   # False ante ValueError
def verify_dummy_password(password: str) -> None: ...   # compara contra un hash ficticio calculado una sola vez (iguala tiempos)
def check_password_policy(password: str) -> bool: ...   # 8..72 caracteres, ≤72 bytes UTF-8, ≥1 letra (str.isalpha) y ≥1 dígito
def create_token(user: "User", token_type: Literal["access", "refresh"]) -> str: ...
def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict[str, Any]: ...
```
- `create_token`: claims de §3.8; `exp` = ahora + `ACCESS_TOKEN_EXPIRE_MINUTES` o `REFRESH_TOKEN_EXPIRE_HOURS`.
- `decode_token`: `jwt.decode(..., algorithms=[settings.JWT_ALGORITHM], options={"require": ["exp", "sub", "type", "ver"]})`; `ExpiredSignatureError` → `AppError(401, "TOKEN_EXPIRED", ...)`; cualquier otro `InvalidTokenError` o `type` distinto → `AppError(401, "TOKEN_INVALID", ...)`.

**5. `app/modules/users/service.py`** (funciones puras que reciben `db: Session`; las que escriben hacen `commit`):
```python
def normalize_email(email: str) -> str                      # strip().lower()
def get_user(db: Session, user_id: int) -> User | None
def get_user_by_email(db: Session, email: str) -> User | None
def effective_modules(user: User) -> list[ModuleKey]        # ADMIN → list(ALL_MODULES); OPERADOR → sus módulos en el orden de ALL_MODULES
def has_module(user: User, module: ModuleKey) -> bool
def create_user(db: Session, *, email: str, password: str, first_name: str, last_name: str,
                role: UserRole = UserRole.OPERADOR, modules: Iterable[ModuleKey] = (),
                must_change_password: bool = True, phone: str | None = None) -> User
    # correo duplicado → AppError(409, "EMAIL_ALREADY_EXISTS", ...); contraseña fuera de política → ValueError;
    # para ADMIN no se guardan filas de módulos (los tiene todos implícitamente)
def generate_temporary_password(length: int = 12) -> str
    # secrets; letras y dígitos sin ambiguos (sin 0/O/1/l/I); garantiza ≥1 letra y ≥1 dígito
def write_credentials_file(email: str, password: str, reason: str) -> Path
    # escribe {DATA_DIR}/CREDENCIALES_INICIALES.txt en español: motivo, URL http://localhost:<PORT>,
    # correo, contraseña temporal y la nota "Este archivo se borra automáticamente cuando cambies la contraseña."
def remove_credentials_file_if_owner(email: str) -> None    # lo borra si existe y contiene ese correo
def ensure_first_admin(db: Session, settings: Settings | None = None) -> str | None
    # si NO hay usuarios: crea ADMIN "Administrador General" con FIRST_ADMIN_EMAIL y FIRST_ADMIN_PASSWORD
    # (o una temporal generada que se escribe con write_credentials_file); must_change_password=True;
    # registra en el log "Se creó el administrador inicial (<correo>)" SIN la contraseña.
    # Devuelve el correo creado, o None si ya había usuarios.
def reset_password_to_temporary(db: Session, email: str | None = None) -> tuple[User, str]
    # email None → el primer ADMIN activo (por id). Asigna una contraseña temporal, must_change_password=True,
    # is_active=True, token_version += 1, audita PASSWORD_RESET, escribe el archivo de credenciales.
    # Si no existe → AppError(404, "NOT_FOUND", "No existe un usuario con ese correo.")
```

**6. `app/modules/audit/service.py`**
```python
def record_audit(db: Session, *, action: str, entity: str, entity_id: int | None = None,
                 user_id: int | None = None, detail: dict[str, Any] | None = None,
                 ip_address: str | None = None) -> AuditLog
```
Agrega la fila a la sesión **sin** hacer `commit` (lo hace el servicio que la llama, en la misma transacción). Valida que `detail` no contenga claves `password`, `token`, `access_token` ni `refresh_token` (si las contiene, las elimina).

**7. `app/modules/auth/rate_limit.py`**
```python
class LoginRateLimiter:
    """Ventana deslizante en memoria por (ip, email). Válido para el proceso único del MVP local (ADR-0007)."""
    def __init__(self, max_attempts: int, window_seconds: int, clock: Callable[[], float] = time.monotonic): ...
    def retry_after(self, key: tuple[str, str]) -> int | None: ...   # segundos restantes si está bloqueado
    def register_failure(self, key: tuple[str, str]) -> None: ...
    def reset(self, key: tuple[str, str]) -> None: ...
    def reset_all(self) -> None: ...

login_rate_limiter = LoginRateLimiter(settings.LOGIN_MAX_ATTEMPTS, settings.LOGIN_WINDOW_MINUTES * 60)
```
Protegido con `threading.Lock`. Está bloqueado cuando hay `max_attempts` fallos o más dentro de la ventana.

**8. `app/modules/auth/schemas.py`**
- `LoginRequest`: `email: str` (3–255), `password: str` (1–128).
- `RefreshRequest`: `refresh_token: str` (min 10).
- `ChangePasswordRequest`: `current_password: str` (1–128), `new_password: str` con `field_validator` que, si `check_password_policy` falla, lanza `PydanticCustomError("password_policy", PASSWORD_POLICY_MESSAGE)` (así el mensaje sale **sin** el prefijo "Value error,").
- `UserMe` (§3.7) con `last_login_at: UtcDateTime | None` y `@classmethod from_user(cls, user) -> "UserMe"` que usa `effective_modules`.
- `TokenResponse` (§3.7) con `token_type: Literal["bearer"] = "bearer"`.

**9. `app/modules/auth/service.py`**
```python
def build_token_response(user: User) -> TokenResponse
def login(db: Session, email: str, password: str, ip: str) -> TokenResponse
def refresh_tokens(db: Session, refresh_token: str) -> TokenResponse
def logout(db: Session, user: User, ip: str) -> None
def change_password(db: Session, user: User, current_password: str, new_password: str, ip: str) -> TokenResponse
```
Algoritmo de `login` (obligatorio):
1. `email = normalize_email(email)`; `key = (ip, email)`; si `login_rate_limiter.retry_after(key)` → `AppError(429, "TOO_MANY_REQUESTS", f"Demasiados intentos fallidos. Intenta de nuevo en {ceil(seg/60)} minutos.", headers={"Retry-After": str(seg)})`.
2. Busca el usuario. Si no existe → `verify_dummy_password(password)` y **fallo**.
3. Si la contraseña no coincide → **fallo**.
4. Si `not user.is_active` (contraseña correcta) → audita `LOGIN_FAILED` con `{"reason": "disabled"}`, `commit`, `AppError(403, "ACCOUNT_DISABLED", ...)`.
5. Éxito: `login_rate_limiter.reset(key)`; `last_login_at = utcnow()`; audita `LOGIN`; `commit`; devuelve `build_token_response`.
6. **Fallo** = `register_failure(key)`; audita `LOGIN_FAILED` con `{"email": email}` (y `user_id` si existe); `commit`; `AppError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.")`. El mensaje es **idéntico** si el correo no existe o si la contraseña es incorrecta.

`refresh_tokens`: `decode_token(..., "refresh")`; usuario existente, activo y con `ver == token_version`; si no → `TOKEN_INVALID`. Devuelve un par nuevo.
`logout`: `token_version += 1`; audita `LOGOUT`; `commit`.
`change_password`: actual incorrecta → `400 INVALID_CURRENT_PASSWORD`; nueva igual a la actual → `400 PASSWORD_REUSED`; guarda el hash nuevo, `must_change_password=False`, `token_version += 1`, audita `PASSWORD_CHANGED`, `commit`, `remove_credentials_file_if_owner(user.email)`, devuelve un par nuevo.

**10. `app/core/deps.py`**
```python
bearer_scheme = HTTPBearer(auto_error=False, description="Pega aquí el access_token")

def client_ip(request: Request) -> str                       # request.client.host o "unknown"
def get_current_user_allow_pending(credentials=Depends(bearer_scheme), db: Session = Depends(get_db)) -> User
    # sin credenciales → 401 NOT_AUTHENTICATED; decode_token(..., "access"); usuario por int(sub);
    # inexistente o inactivo → 401 NOT_AUTHENTICATED; ver distinto → 401 TOKEN_INVALID
def get_current_user(user: User = Depends(get_current_user_allow_pending)) -> User
    # must_change_password → 403 PASSWORD_CHANGE_REQUIRED
def require_admin(user: User = Depends(get_current_user)) -> User           # no ADMIN → 403 FORBIDDEN
def require_module(module: ModuleKey) -> Callable[..., User]
    # fábrica de dependencias; ADMIN pasa siempre; OPERADOR sin el módulo → 403 MODULE_FORBIDDEN
    # con message f"No tienes acceso al módulo {MODULE_LABELS[module]}."
```
Uso esperado en fases futuras: `router = APIRouter(prefix="/letters", dependencies=[Depends(require_module(ModuleKey.CARTAS))])`.

**11. `app/modules/auth/router.py`** — `APIRouter(prefix="/auth", tags=["Autenticación"])`:

| Ruta | Dependencias | Respuesta |
|---|---|---|
| `POST /login` | `client_ip` | `TokenResponse` |
| `POST /refresh` | — | `TokenResponse` |
| `POST /logout` | `get_current_user_allow_pending` | `204` (`Response(status_code=204)`) |
| `GET /me` | `get_current_user_allow_pending` | `UserMe` |
| `POST /change-password` | `get_current_user_allow_pending` | `TokenResponse` |

Cada endpoint con `summary` y `description` en español y `responses={...}` con los errores de §3.7 (para Swagger). Los routers **no** contienen lógica: llaman al servicio. En `main.py`: `app.include_router(auth_router, prefix=settings.API_PREFIX)` **antes** de `mount_spa`.

**12. `app/db/startup.py`** — después de migrar: `with new_session() as db: ensure_first_admin(db)`.

**13. Migración `alembic/versions/0001_usuarios_permisos_auditoria.py`**
```powershell
cd backend
.\.venv\Scripts\alembic.exe revision --autogenerate -m "usuarios permisos auditoria"
```
Renombra el archivo a `0001_usuarios_permisos_auditoria.py` y fija `revision = "0001"` y `down_revision = None`. **Revísala a mano:** los enums deben ser `sa.Enum(..., name="user_role" | "module_key", native_enum=False, create_constraint=True)`; todas las restricciones con nombre según la convención; `downgrade()` elimina las tablas en orden inverso. Verifica que `alembic upgrade head` → `downgrade base` → `upgrade head` funcione.

**14. Scripts** (se ejecutan desde `backend/` con `python -m scripts.<nombre>`):
- `scripts/seed.py`: ejecuta `run_migrations()` y `ensure_first_admin()`; imprime si se creó o si ya existía, y dónde quedó el archivo de credenciales (nunca imprime la contraseña si vino de `FIRST_ADMIN_PASSWORD`).
- `scripts/create_user.py` (herramienta de desarrollo y soporte hasta que exista la UI de la F2): `argparse` con `--email`, `--first-name`, `--last-name`, `--role {ADMIN,OPERADOR}`, `--modules CARTAS,CALENDARIO` (validados contra `ModuleKey`), `--password` (opcional; si falta, genera una temporal y la imprime **una vez**) y `--no-must-change`. Errores legibles en español.

**15. Pruebas.** Amplía `tests/conftest.py`:
```python
# Agregar a conftest.py
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_admin, require_module
from app.core.modules import ModuleKey, UserRole
from app.db.base import Base
from app.db.session import new_session
from app.modules.auth.rate_limit import login_rate_limiter
from app.modules.users.service import create_user, ensure_first_admin

_test_router = APIRouter()

@_test_router.get("/cartas", dependencies=[Depends(require_module(ModuleKey.CARTAS))])
def _solo_cartas() -> dict[str, bool]:
    return {"ok": True}

@_test_router.get("/admin", dependencies=[Depends(require_admin)])
def _solo_admin() -> dict[str, bool]:
    return {"ok": True}

# En el fixture `app` existente:  app = create_app(); app.include_router(_test_router, prefix="/api/v1/_test")

@pytest.fixture(autouse=True)
def clean_db(client: TestClient) -> Iterator[None]:
    with new_session() as s:
        for table in reversed(Base.metadata.sorted_tables):
            s.execute(table.delete())
        s.commit()
        ensure_first_admin(s)               # admin@sonardespierto.org / Admin12345 (must_change_password=True)
    login_rate_limiter.reset_all()
    yield

@pytest.fixture
def db() -> Iterator[Session]: ...            # new_session() con cierre

@pytest.fixture
def make_user(db: Session) -> Callable[..., tuple[User, str]]: ...
    # crea usuarios con must_change_password=False por defecto; devuelve (user, password)

@pytest.fixture
def login(client: TestClient) -> Callable[[str, str], dict[str, str]]: ...
    # hace POST /auth/login y devuelve {"Authorization": "Bearer ..."}

@pytest.fixture
def admin_headers(make_user, login) -> dict[str, str]: ...       # ADMIN sin cambio pendiente

@pytest.fixture
def operator_headers(make_user, login) -> dict[str, str]: ...    # OPERADOR con [CARTAS]
```

Casos obligatorios (≈30):

| Archivo | Casos |
|---|---|
| `auth/test_login.py` | login correcto → 200 con tokens, `token_type`, `expires_in == 1800` y `user.modules` (los 7 para ADMIN); correo con mayúsculas o espacios funciona; contraseña incorrecta → 401 `INVALID_CREDENTIALS`; correo inexistente → 401 con el **mismo** `message`; usuario inactivo con contraseña correcta → 403 `ACCOUNT_DISABLED`; actualiza `last_login_at`; registra `LOGIN` y `LOGIN_FAILED` en `audit_logs` y ningún `detail` contiene la contraseña; body vacío → 422 `VALIDATION_ERROR` |
| `auth/test_rate_limit.py` | 5 fallos y el 6.º intento → 429 con `Retry-After`; bloqueado incluso con la contraseña correcta; otro correo desde la misma IP no se bloquea; la ventana expira (prueba unitaria de `LoginRateLimiter` con reloj falso); un login correcto reinicia el contador |
| `auth/test_tokens.py` | `/auth/me` sin token → 401 `NOT_AUTHENTICATED`; token basura → 401 `TOKEN_INVALID`; token expirado (fabricado con `exp` pasado) → 401 `TOKEN_EXPIRED`; refresh usado como access → 401 `TOKEN_INVALID`; access usado en `/auth/refresh` → 401; refresh válido → par nuevo; tras `logout`, el access anterior → 401 y el refresh anterior → 401; usuario desactivado tras el login → 401; las fechas de `UserMe` terminan en `Z` |
| `auth/test_change_password.py` | admin inicial (`must_change_password`): `/auth/me` → 200 con `must_change_password: true`; `/api/v1/_test/cartas` → 403 `PASSWORD_CHANGE_REQUIRED`; actual incorrecta → 400 `INVALID_CURRENT_PASSWORD`; nueva débil (`"abcdefgh"`, `"12345678"`, `"abc1"`) → 422 con el mensaje exacto de la política; igual a la actual → 400 `PASSWORD_REUSED`; éxito → 200 con tokens nuevos, `must_change_password: false`, el token anterior → 401 y el nuevo funciona en `/_test/cartas`; se borra `CREDENCIALES_INICIALES.txt` si existía |
| `auth/test_permissions.py` | ADMIN → 200 en `/_test/cartas` y `/_test/admin`; OPERADOR con `CARTAS` → 200 en cartas y 403 `FORBIDDEN` en admin; OPERADOR sin módulos → 403 `MODULE_FORBIDDEN` con el `message` "No tienes acceso al módulo Cartas de Navidad." |
| `users/test_seed.py` | con BD vacía y `FIRST_ADMIN_PASSWORD=""` (pasa `settings.model_copy(update=...)`) → crea el ADMIN, escribe el archivo de credenciales con una contraseña que cumple la política, `must_change_password` en true; una segunda llamada → `None` (idempotente); `reset_password_to_temporary` cambia la contraseña e invalida tokens |
| `users/test_service.py` | correo duplicado → 409 `EMAIL_ALREADY_EXISTS`; `effective_modules` (ADMIN → todos en orden; OPERADOR → solo los suyos, en orden del catálogo); `generate_temporary_password` cumple la política (100 iteraciones) |
| `test_migrations.py` (ampliar) | tras migrar existen `users`, `user_module_permissions`, `audit_logs`; insertar `role='HACKER'` con SQL crudo → `IntegrityError` (CHECK); borrar un usuario borra sus permisos (FK `CASCADE` con `foreign_keys=ON`) |

#### Comandos de verificación
```powershell
cd backend
.\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\alembic.exe downgrade base ; .\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m scripts.seed
.\.venv\Scripts\python.exe -m scripts.create_user --email operador@sonardespierto.org --first-name Ana --last-name Prueba --role OPERADOR --modules CARTAS,CALENDARIO --password Operador123 --no-must-change
cd .. ; .\scripts\dev-backend.ps1
# Swagger http://127.0.0.1:8000/docs: login → "Authorize" con el access_token → /auth/me
```

#### Fuera de alcance
CRUD de usuarios por API e interfaz y visor de bitácora (F2); cualquier pantalla (1.5).

#### Criterios de aceptación
- [ ] Los 5 endpoints cumplen exactamente §3.7 (rutas, esquemas, códigos y mensajes).
- [ ] `require_module` y `require_admin` son reutilizables y están probados.
- [ ] El primer arranque con BD vacía crea el administrador; con `FIRST_ADMIN_PASSWORD` vacía, la contraseña **solo** aparece en `CREDENCIALES_INICIALES.txt` (no en logs ni en la consola de uvicorn).
- [ ] La migración `0001` sube y baja limpia; los enums son `VARCHAR` + `CHECK` (inspecciona con `sqlite3` o DB Browser: `.schema users`).
- [ ] Ninguna respuesta de la API contiene `password_hash`.
- [ ] Todas las pruebas pasan (≥ 30 nuevas); Ruff sin errores.

**Commit final sugerido:** `feat: autenticación JWT, usuarios con permisos por módulo y bitácora`

`■ FIN DEL PROMPT 1.3`

---

### 4.4 Subtarea 1.4 — Migración del diseño Lovable a una SPA con Vite

`▶ INICIO DEL PROMPT 1.4`

**Rama:** `feat/f1-4-frontend-base` · **Depende de:** 1.1 integrada en `main` (puede hacerse en paralelo con 1.2 y 1.3)

#### Objetivo
Crear `frontend/` como una SPA de Vite que reutiliza **fielmente** el diseño de Lovable (tokens de marca, `Logo`, `AppShell`, componentes `sd/*` y shadcn), sin SSR, sin dependencias de Lovable, sin datos simulados ni "Modo demostración", con fuentes locales, todas las rutas de §3.9 (como *placeholders*), formularios de login y cambio de contraseña **como componentes puros** (la conexión con la API es la 1.5) y pruebas.

#### Contexto específico: qué hay en el export de Lovable
- `C:\Users\isaac\Downloads\Sonar-Despierto-OS-DESIGN` es un proyecto **TanStack Start** (SSR + Nitro + `@lovable.dev/vite-tanstack-config`).
- **Se reutiliza:** `src/components/ui/*` (47 componentes shadcn), `src/components/sd/ui.tsx` (`Logo`, `StatusChip`, `Pill`, `PageHeader`, `Panel`, `Kpi`, `DataState`, `ConfirmModal`, `useBusy`, `SegProgress`), `src/components/sd/shell.tsx` (`AppShell`), `src/routes/index.tsx` (Login), `src/hooks/use-mobile.tsx`, `src/lib/utils.ts`, `src/styles.css` (tokens oklch de la paleta oficial, fuentes `--font-display`/`--font-geo`/`--font-serif`, utilidades `bg-sun-gradient` y `shadow-soft`), `public/favicon.ico`, `src/assets/carta.jpg`, `components.json`, `.prettierrc`, `.prettierignore`, `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`, `src/test/setup.ts`.
- **NO se copia:** `.lovable/`, `AGENTS.md`, `bun.lock`, `bunfig.toml`, `vite.config.ts`, `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/__root.tsx`, `src/routes/app.tsx`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/lib/lovable-error-reporting.ts`, `src/lib/mock.ts`, `src/lib/store.tsx`, `src/test/app-routing.test.tsx`.

#### Paso 1 — Copiar los archivos reutilizables (desde la raíz del repo)
```powershell
$L = "C:\Users\isaac\Downloads\Sonar-Despierto-OS-DESIGN"    # ajusta la ruta si cambió
$F = "frontend"
New-Item -ItemType Directory -Force "$F\src\components", "$F\src\hooks", "$F\src\lib", "$F\src\assets", "$F\src\routes\app", "$F\src\test", "$F\public" | Out-Null
Copy-Item -Recurse "$L\src\components\ui" "$F\src\components\ui"
Copy-Item -Recurse "$L\src\components\sd" "$F\src\components\sd"
Copy-Item "$L\src\hooks\use-mobile.tsx" "$F\src\hooks\"
Copy-Item "$L\src\lib\utils.ts" "$F\src\lib\"
Copy-Item "$L\src\styles.css" "$F\src\"
Copy-Item "$L\src\assets\carta.jpg" "$F\src\assets\"
Copy-Item "$L\src\routes\index.tsx" "$F\src\routes\login.tsx"
Copy-Item "$L\src\test\setup.ts" "$F\src\test\"
Copy-Item "$L\public\favicon.ico" "$F\public\"
Copy-Item "$L\components.json", "$L\.prettierrc", "$L\.prettierignore", "$L\eslint.config.js", "$L\tsconfig.json", "$L\vitest.config.ts" "$F\"
```

#### Paso 2 — Archivos de configuración

`frontend/package.json` (exacto; conserva las versiones de Lovable):
```json
{
  "name": "sonar-despierto-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "overrides": { "rolldown": "1.2.1" },
  "dependencies": {
    "@fontsource/figtree": "^5.1.0",
    "@fontsource/jost": "^5.1.0",
    "@fontsource/nunito": "^5.1.0",
    "@fontsource/playfair-display": "^5.1.0",
    "@hookform/resolvers": "^5.2.2",
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-aspect-ratio": "^1.1.8",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-context-menu": "^2.2.16",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-hover-card": "^1.1.15",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-menubar": "^1.1.16",
    "@radix-ui/react-navigation-menu": "^1.2.14",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-progress": "^1.1.8",
    "@radix-ui/react-radio-group": "^1.3.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slider": "^1.3.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toggle": "^1.1.10",
    "@radix-ui/react-toggle-group": "^1.1.11",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@tanstack/react-query": "^5.101.1",
    "@tanstack/react-router": "1.170.41",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.1.0",
    "embla-carousel-react": "^8.6.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.575.0",
    "react": "^19.2.0",
    "react-day-picker": "^9.14.0",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.71.2",
    "react-resizable-panels": "^4.6.5",
    "recharts": "^2.15.4",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "vaul": "^1.1.2",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@eslint/js": "^9.32.0",
    "@tailwindcss/vite": "^4.2.1",
    "@tanstack/router-plugin": "1.168.42",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22.16.5",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.2.0",
    "eslint": "^9.32.0",
    "eslint-config-prettier": "^10.1.1",
    "eslint-plugin-prettier": "^5.2.6",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^15.15.0",
    "jsdom": "^20.0.3",
    "prettier": "^3.7.3",
    "tailwindcss": "^4.2.1",
    "tw-animate-css": "^1.3.4",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.56.1",
    "vite": "8.1.5",
    "vite-tsconfig-paths": "^6.0.2",
    "vitest": "^4.1.10"
  }
}
```
> Si `npm install` falla por el `override` de `rolldown`, elimínalo, vuelve a instalar y repórtalo como desviación.

`frontend/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// SPA pura (ADR-0001). El plugin del router debe ir ANTES que react().
export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Sistema de gestión de Soñar Despierto Veracruz" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Soñar Despierto Veracruz</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Otros ajustes:
- `tsconfig.json`: conserva **todas** las opciones estrictas de Lovable; en `types` deja `["vite/client", "vitest/globals", "node"]`.
- `eslint.config.js`: quita la regla `no-restricted-imports` de `server-only` (era de TanStack Start); agrega `"src/routeTree.gen.ts"` y `"src/components/ui/**"` a `ignores` (código de shadcn generado).
- `.prettierignore`: agrega `src/routeTree.gen.ts` y `dist`.
- `public/robots.txt`: `User-agent: *` y `Disallow: /`.
- `vitest.config.ts`: el de Lovable ya sirve; verifica que `include` sea `src/**/*.{test,spec}.{ts,tsx}`.
- `src/routeTree.gen.ts` **se versiona** (lo genera el plugin con `npm run dev` o `npm run build`; hace falta para `typecheck` y las pruebas).
- `scripts/dev-frontend.ps1` (raíz del repo):
```powershell
# Interfaz en modo desarrollo: http://localhost:5173 (requiere la API en :8000 -> scripts\dev-backend.ps1)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "frontend")
npm run dev
```

#### Paso 3 — Estilos y fuentes locales
- `src/styles.css`: se queda **igual** (tokens, `@theme`, utilidades). No debe referenciar Google Fonts.
- Las fuentes se importan en `src/main.tsx` desde `@fontsource`:
```ts
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "@fontsource/jost/300.css";
import "@fontsource/jost/400.css";
import "@fontsource/playfair-display/600-italic.css";
import "./styles.css";
```

#### Paso 4 — Dominio, tipos y navegación (archivos nuevos)

`src/lib/domain/access.ts` (espejo de §3.5):
```ts
export const USER_ROLES = ["ADMIN", "OPERADOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ROLE_LABEL: Record<UserRole, string> = { ADMIN: "Administrador", OPERADOR: "Operador" };

export const MODULE_KEYS = ["VOLUNTARIOS", "BENEFICIARIOS", "EVENTOS", "CARTAS", "CALENDARIO", "INVENTARIO", "REPORTES"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_INFO: Record<ModuleKey, { label: string; phase: number; description: string }> = {
  VOLUNTARIOS: { label: "Voluntarios", phase: 3, description: "Registro de voluntarios, contacto de emergencia, talla y área de apoyo." },
  BENEFICIARIOS: { label: "Beneficiarios", phase: 3, description: "Niños, escuelas y tutores responsables, con consentimiento del tutor." },
  EVENTOS: { label: "Eventos", phase: 4, description: "Macro-eventos de Navidad y Día del Niño y su logística." },
  CARTAS: { label: "Cartas de Navidad", phase: 4, description: "Cartas, padrinos, estatus del regalo e historial completo." },
  CALENDARIO: { label: "Calendario", phase: 5, description: "Juntas, capacitaciones, acopios y eventos en vista mensual y semanal." },
  INVENTARIO: { label: "Inventario", phase: 6, description: "Insumos, mobiliario y materiales por centro de acopio." },
  REPORTES: { label: "Reportes", phase: 7, description: "Indicadores por evento y exportaciones." },
};
```

`src/lib/domain/letters.ts`: `LETTER_STATUSES = ["PENDIENTE","ASIGNADO","RECIBIDO","ENTREGADO"] as const`, `type LetterStatus`, `LETTER_STATUS_LABEL` = `{ PENDIENTE: "Pendiente", ASIGNADO: "Con padrino", RECIBIDO: "Regalo recibido", ENTREGADO: "Entregado ✓" }` (etiquetas de `Pantallas_UI.md` §1.1).

`src/lib/api/types.ts` (espejo de §3.7):
```ts
import type { ModuleKey, UserRole } from "@/lib/domain/access";

export interface UserMe {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  modules: ModuleKey[];
  last_login_at: string | null;
}
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserMe;
}
export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}
```

`src/lib/navigation.ts`:
```ts
export type AppPath =
  | "/app" | "/app/calendario" | "/app/eventos" | "/app/cartas" | "/app/buscar" | "/app/ninos"
  | "/app/escuelas" | "/app/tutores" | "/app/voluntarios" | "/app/inventario" | "/app/reportes"
  | "/app/usuarios" | "/app/perfil";

export interface NavItem { to: AppPath; label: string; icon: LucideIcon; module?: ModuleKey; adminOnly?: boolean }

export const NAV_ITEMS: NavItem[] = [
  { to: "/app", label: "Inicio", icon: Home },
  { to: "/app/calendario", label: "Calendario", icon: CalendarRange, module: "CALENDARIO" },
  { to: "/app/eventos", label: "Eventos", icon: CalendarDays, module: "EVENTOS" },
  { to: "/app/cartas", label: "Cartas", icon: Mail, module: "CARTAS" },
  { to: "/app/buscar", label: "Búsqueda por código", icon: ScanSearch, module: "CARTAS" },
  { to: "/app/ninos", label: "Niños", icon: Baby, module: "BENEFICIARIOS" },
  { to: "/app/escuelas", label: "Escuelas", icon: School, module: "BENEFICIARIOS" },
  { to: "/app/tutores", label: "Tutores", icon: Contact, module: "BENEFICIARIOS" },
  { to: "/app/voluntarios", label: "Voluntarios", icon: Users, module: "VOLUNTARIOS" },
  { to: "/app/inventario", label: "Inventario", icon: Boxes, module: "INVENTARIO" },
  { to: "/app/reportes", label: "Reportes", icon: BarChart3, module: "REPORTES" },
  { to: "/app/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
  { to: "/app/perfil", label: "Mi perfil", icon: UserCircle },
];

/** Menú visible: vacío si debe cambiar contraseña; adminOnly solo ADMIN; módulo solo si lo tiene. */
export function visibleMenu(user: Pick<UserMe, "role" | "modules" | "must_change_password">): NavItem[]
```

`src/lib/password.ts` (espejo de la política del backend):
```ts
export const PASSWORD_POLICY_MESSAGE = "La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número.";
export function meetsPasswordPolicy(pw: string): boolean   // 8..72 caracteres, ≤72 bytes (TextEncoder), ≥1 letra (/\p{L}/u), ≥1 dígito
export type PasswordStrength = "debil" | "aceptable" | "fuerte";
export function passwordStrength(pw: string): PasswordStrength   // no cumple → débil; cumple y <12 → aceptable; ≥12 con mayúsculas, minúsculas, dígito y símbolo → fuerte
```

`src/lib/page-title.ts`: `usePageTitle(title: string)` → `document.title = \`${title} · Soñar Despierto Veracruz\``.

#### Paso 5 — Adaptar los componentes de Lovable

**`src/components/sd/ui.tsx`**
- Quita las importaciones de `@/lib/mock` y `@/lib/store`; usa `LetterStatus` y `LETTER_STATUS_LABEL` de `@/lib/domain/letters`. `chipCls` con las claves `PENDIENTE`/`ASIGNADO`/`RECIBIDO`/`ENTREGADO` (mismas clases `bg-st-*`; `ASIGNADO` → `bg-st-padrino`). El orden de `SegProgress` es `ENTREGADO, RECIBIDO, ASIGNADO, PENDIENTE`.
- `DataState` **sin** temporizadores ni modo demo. Firma nueva:
  `DataState({ isLoading, isError, onRetry, isEmpty, emptyText, emptyAction, errorText = "No pudimos cargar la información.", children })`. Conserva el mismo aspecto visual de skeleton, error (con botón "Reintentar" que llama a `onRetry`) y vacío.
- `ConfirmModal`: `onConfirm: (comment: string) => void | Promise<void>`; quita `await wait()`; usa `try { await onConfirm(comment); onOpenChange(false); setComment(""); } finally { setBusy(false); }`. Si `onConfirm` lanza un error, el modal **sigue abierto** (quien lo llama muestra el toast).
- `useBusy`: `run(fn: () => Promise<void>)` con `try/finally`, sin retraso artificial.
- `Logo`, `Pill`, `PageHeader`, `Panel` y `Kpi` no cambian.

**`src/components/sd/shell.tsx`**
- Elimina la barra "Modo demostración", `EventSelect`, `MENU`, `DEMO_USERS` y todo uso de `useStore`/`mock`.
- Nueva firma:
  ```ts
  interface AppShellProps {
    user: Pick<UserMe, "first_name" | "last_name" | "email" | "role">;
    items: NavItem[];
    onLogout: () => void;
    children: ReactNode;
  }
  ```
- Header: logo enlazado a `/app`. Quita la píldora del evento (volverá en la F4 con el evento activo). Menú de usuario: nombre completo, `ROLE_LABEL[role]`, enlaces a `/app/perfil` y `/app/cambiar-contrasena`, y un **botón** "Cerrar sesión" que llama a `onLogout`.
- Barra lateral (≥ `lg`), migas de pan (`CRUMB` actualizado con todos los segmentos de §3.9) y navegación inferior móvil (3 accesos + "Más" en `Sheet`): **mismo diseño** que Lovable. Si `items` está vacío, no se muestra navegación.

**`src/components/sd/module-placeholder.tsx`** (nuevo): `ModulePlaceholder({ module, title?, description? })` → `PageHeader` con el título (por defecto `MODULE_INFO[module].label`) + `Panel` con ícono, el texto `MODULE_INFO[module].description` y la píldora `Próximamente · Fase {phase}`. Llama a `usePageTitle`.

#### Paso 6 — Formularios como componentes puros (`src/features/auth/`)
- `login-form.tsx`: `LoginForm({ onSubmit }: { onSubmit: (v: { email: string; password: string }) => Promise<void> })`. Usa react-hook-form + zod (correo requerido y con formato; contraseña requerida). Conserva el diseño de Lovable: campos `h-12`, botón mostrar/ocultar con `aria-label`, botón "Iniciar sesión" con *spinner* mientras envía. Si `onSubmit` lanza un error, lo muestra en un bloque `role="alert"` sobre el botón con `error.message`. Errores de campo debajo de cada campo con `aria-describedby`. **No** precarga credenciales.
- `password-strength.tsx`: barra de tres segmentos + texto ("Débil", "Aceptable", "Fuerte"), nunca solo color.
- `change-password-form.tsx`: `ChangePasswordForm({ onSubmit, forced }: { onSubmit: (v: { current_password: string; new_password: string }) => Promise<void>; forced?: boolean })`. Campos: contraseña actual, nueva y confirmación. Validación zod: política (`PASSWORD_POLICY_MESSAGE`), confirmación igual ("Las contraseñas no coinciden.") y nueva distinta de la actual ("La nueva contraseña debe ser distinta de la actual."). Incluye `PasswordStrength`. Si `forced`, muestra arriba un aviso: "Por seguridad, cambia tu contraseña temporal antes de continuar." Si `onSubmit` lanza un error, lo muestra con `role="alert"`.

#### Paso 7 — Router y rutas
- `src/router.tsx`: exporta `queryClient` (`refetchOnWindowFocus: false`, `retry: 1`) y `createAppRouter()` con `createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent", scrollRestoration: true })`, más la declaración `Register`.
- `src/main.tsx`: fuentes + estilos, `QueryClientProvider` y `RouterProvider`, dentro de `StrictMode`.
- `src/routes/__root.tsx`: `createRootRouteWithContext<{ queryClient: QueryClient }>()` con `component` (`<Outlet />` + `<Toaster richColors position="top-center" />`), `notFoundComponent` en español ("Página no encontrada", botón "Ir al inicio" → `/app`) y `errorComponent` en español ("Esta página no se pudo cargar", botones "Reintentar" y "Ir al inicio"). Sin `HeadContent`/`Scripts` (eran de SSR) y sin reporte a Lovable.
- `src/routes/index.tsx`: `beforeLoad` → `throw redirect({ to: "/login" })` (la 1.5 lo hace condicional).
- `src/routes/login.tsx` (adaptado del Login de Lovable): mismo diseño a dos columnas (panel `bg-sun-gradient` con logo, frase y texto institucional). Sustituye el formulario por `<LoginForm onSubmit={...} />`. En esta subtarea, `onSubmit` solo muestra `toast.info("La conexión con el servidor se habilita en la subtarea 1.5")`. Reemplaza el recuadro "¿Quieres ser voluntario? Regístrate" por: "¿No tienes cuenta? Solicítala al administrador del sistema." Título de la página: "Iniciar sesión".
- `src/dev/preview-user.ts` (**TEMPORAL; la 1.5 lo elimina**): `export const DEV_PREVIEW_USER: UserMe` = ADMIN con los 7 módulos y `must_change_password: false`.
- `src/routes/app.tsx`: ruta de diseño de `/app` que renderiza `<AppShell user={DEV_PREVIEW_USER} items={visibleMenu(DEV_PREVIEW_USER)} onLogout={() => navigate({ to: "/login" })}><Outlet /></AppShell>`.
- `src/routes/app/index.tsx` (Inicio): `PageHeader` "Hola, {first_name}" + `Panel` "Tus módulos" con una cuadrícula de tarjetas (una por cada `NavItem` visible con módulo; ícono, etiqueta, descripción y píldora "Próximamente · Fase N"), enlazadas a su ruta.
- Una ruta por *placeholder* de §3.9. Ejemplo:
```tsx
// src/routes/app/cartas.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";

export const Route = createFileRoute("/app/cartas")({
  component: () => <ModulePlaceholder module="CARTAS" />,
});
```
  Títulos explícitos: `/app/buscar` → "Búsqueda por código" (CARTAS); `/app/ninos` → "Niños"; `/app/escuelas` → "Escuelas"; `/app/tutores` → "Tutores" (las tres con BENEFICIARIOS). `/app/usuarios` → `PageHeader` "Usuarios" + `Panel` "Gestión de usuarios y permisos · Próximamente · Fase 2".
- `src/routes/app/perfil.tsx`: tarjeta de solo lectura con nombre, correo, rol y módulos (como `Pill`) del usuario (en esta subtarea, `DEV_PREVIEW_USER`).
- `src/routes/app/cambiar-contrasena.tsx`: `<ChangePasswordForm onSubmit={...} />` con `toast.info(...)` provisional.
- `src/routes/app/sin-acceso.tsx`: `validateSearch` acepta `modulo?: string`; mensaje "No tienes acceso a este módulo. Pide al administrador que te lo asigne." (con la etiqueta del módulo si viene) y botón "Volver al inicio".

#### Paso 8 — Pruebas (Vitest + Testing Library)

| Archivo | Casos |
|---|---|
| `src/test/navigation.test.ts` | ADMIN ve los 13 elementos; OPERADOR con `["CARTAS"]` ve exactamente Inicio, Cartas, Búsqueda por código y Mi perfil; OPERADOR sin módulos ve Inicio y Mi perfil; `must_change_password` → `[]` |
| `src/test/password.test.ts` | política: válidas (`"Segura123"`), inválidas (`"abc"`, `"abcdefgh"`, `"12345678"`, 73 caracteres); `passwordStrength` en los tres niveles |
| `src/test/login-form.test.tsx` | enviar vacío → errores de campo y `onSubmit` no se llama; correo inválido → error; datos válidos → `onSubmit` recibe `{email, password}`; si `onSubmit` rechaza con `Error("Correo o contraseña incorrectos.")` → se muestra en `role="alert"`; el botón mostrar/ocultar cambia el `type` |
| `src/test/change-password-form.test.tsx` | confirmación distinta → error; nueva débil → mensaje de política; nueva igual a la actual → error; válida → `onSubmit` con `{current_password, new_password}`; `forced` muestra el aviso |
| `src/test/data-state.test.tsx` | `isLoading` → `aria-busy`; `isError` → mensaje y "Reintentar" llama a `onRetry`; `isEmpty` → `emptyText`; si no, renderiza `children` |
| `src/test/routing.test.tsx` | con `createRouter({ routeTree, context })`, `router.matchRoutes(path)` encuentra una ruta propia (no la raíz ni notFound) para `/login`, `/app`, cada `NavItem.to`, `/app/cambiar-contrasena` y `/app/sin-acceso` |

#### Comandos de verificación
```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173/login  y  http://localhost:5173/app
npm run lint ; npm run typecheck ; npm test
npm run build          # genera frontend/dist
# Opcional, con la 1.2 integrada: scripts\dev-backend.ps1 y abrir http://127.0.0.1:8000/app/cartas → carga la SPA (deep link)
Select-String -Path src\**\*.ts*, index.html -Pattern "lovable|googleapis|useStore|lib/mock" -List   # no debe encontrar nada
```

#### Fuera de alcance
Llamadas a la API, tokens y guardas (1.5); pantallas reales de los módulos (F2+).

#### Criterios de aceptación
- [ ] `/login` es visualmente idéntico al de Lovable (salvo el recuadro de registro y las credenciales precargadas, que se eliminan). Compáralo lado a lado con el proyecto de Lovable corriendo.
- [ ] `/app` muestra el `AppShell` de Lovable **sin** barra "Modo demostración"; todas las rutas del menú cargan su *placeholder*; a 360 px se ve la navegación inferior con "Más".
- [ ] Con DevTools en modo *Offline* (después de la primera carga), las fuentes Nunito, Figtree, Jost y Playfair siguen viéndose: no hay peticiones a `fonts.googleapis.com`.
- [ ] No existen referencias a Lovable, `mock`, `store`, `@tanstack/react-start` ni `nitro` en `frontend/`.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` sin errores; `src/routeTree.gen.ts` versionado.
- [ ] `src/dev/preview-user.ts` es el **único** lugar con datos de usuario simulados.

**Commit final sugerido:** `feat: migra el diseño de Lovable a una SPA con Vite y rutas base`

`■ FIN DEL PROMPT 1.4`

---

### 4.5 Subtarea 1.5 — Integración de autenticación frontend ↔ API

`▶ INICIO DEL PROMPT 1.5`

**Rama:** `feat/f1-5-auth-frontend` · **Depende de:** 1.3 y 1.4 integradas en `main`

#### Objetivo
Conectar la SPA con la API de §3.7: cliente HTTP con manejo uniforme de errores y renovación automática del token, contexto de autenticación, arranque de la sesión, guardas de ruta (§3.9), menú según rol y módulos, login real, cambio de contraseña obligatorio, perfil, cierre de sesión y eliminación del usuario simulado.

#### Archivos

| Acción | Archivo (en `frontend/`) |
|---|---|
| Crear | `src/lib/auth/tokens.ts`, `src/lib/api/client.ts`, `src/lib/auth/auth-context.tsx`, `src/lib/auth/guards.ts`, `src/components/sd/splash.tsx`, `src/test/client.test.ts`, `src/test/auth-context.test.tsx`, `src/test/guards.test.ts` |
| Modificar | `src/test/routing.test.tsx` (agregar `auth` al contexto del router de prueba), `src/main.tsx`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/login.tsx`, `src/routes/app.tsx`, `src/routes/app/*.tsx` (guardas), `src/routes/app/index.tsx`, `src/routes/app/perfil.tsx`, `src/routes/app/cambiar-contrasena.tsx` |
| Eliminar | `src/dev/preview-user.ts` (y la carpeta `src/dev/`) |

#### Especificación

**1. `src/lib/auth/tokens.ts`** — `sessionStorage` (ADR-0007), claves `sd.access_token` y `sd.refresh_token`: `getAccessToken()`, `getRefreshToken()`, `setTokens(access, refresh)`, `clearTokens()`, `hasStoredSession()`. Todas protegidas con `try/catch` (el almacenamiento puede no estar disponible).

**2. `src/lib/api/client.ts`**
```ts
export const API_BASE = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;                 // default true: agrega Authorization y aplica la lógica de 401
  notifyOnUnauthorized?: boolean; // default true: llama al manejador de sesión expirada
  signal?: AbortSignal;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void;
export function refreshSession(): Promise<boolean>;     // una sola renovación en curso (single-flight)
export async function apiFetch<T>(path: string, options?: RequestOptions): Promise<T>;
```
Reglas de `apiFetch` (obligatorias):
1. Cabeceras `Accept: application/json`; `Content-Type: application/json` solo si hay `body`; `Authorization: Bearer <access>` si `auth` y hay token. Con `noPropertyAccessFromIndexSignature` usa `headers["Authorization"]`. Con `exactOptionalPropertyTypes` pasa `body: null` y `signal: signal ?? null` en lugar de `undefined`.
2. Error de red (`fetch` lanza) → `ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor. Verifica que el programa Soñar Despierto siga abierto.")`.
3. `401` con `auth=true`: lee el cuerpo; si `code` es `TOKEN_EXPIRED` o `TOKEN_INVALID`, aún no se reintentó y `await refreshSession()` es `true` → repite la petición **una sola vez**. Si no → `clearTokens()`, llama al manejador (si `notifyOnUnauthorized`) y lanza el `ApiError`.
4. Otros errores → `ApiError(status, error.code ?? "HTTP_ERROR", error.message ?? "Ocurrió un error inesperado.", error.details ?? null)`.
5. `204` → `undefined as T`; si no, `await res.json()`.
6. `refreshSession`: `POST /auth/refresh` **sin** `Authorization`; si responde bien, `setTokens(...)` y `true`; ante cualquier fallo, `false`. Varias peticiones simultáneas con `401` comparten **una** renovación.

**3. `src/lib/auth/auth-context.tsx`**
```ts
export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: UserMe | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasModule: (module: ModuleKey) => boolean;
  login: (email: string, password: string) => Promise<UserMe>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<UserMe | null>;
  applyTokenResponse: (response: TokenResponse) => void;   // guarda tokens y usuario (cambio de contraseña)
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element;
export function useAuth(): AuthContextValue;   // lanza un error si se usa fuera del provider
```
- **Arranque:** si `hasStoredSession()` → `GET /auth/me` → `authenticated`; si falla → `clearTokens()` y `anonymous`. Si no hay tokens → `anonymous` **sin** llamar a la API.
- Registra `setSessionExpiredHandler` → estado `anonymous` + `toast.error("Tu sesión expiró. Inicia sesión de nuevo.")`.
- `login`: `apiFetch<TokenResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false })` → `setTokens` → `authenticated` con `response.user`.
- `logout`: `apiFetch("/auth/logout", { method: "POST", notifyOnUnauthorized: false })` ignorando errores; **siempre** `clearTokens()`, estado `anonymous`, `queryClient.clear()` y `toast.success("Sesión cerrada")`.
- `hasModule(m)`: `user?.modules.includes(m) ?? false`. `isAdmin`: `user?.role === "ADMIN"`.

**4. `src/lib/auth/guards.ts`** (funciones puras, se usan en `beforeLoad`):
```ts
export function safeRedirect(target: string | undefined): string;   // solo rutas que empiezan con "/app" (y no con "//"); si no → "/app"
export function requireAuth(auth: AuthContextValue, location: { href: string; pathname: string }): void;
  // sin sesión → throw redirect({ to: "/login", search: { redirect: location.href } })
  // must_change_password y pathname distinto de "/app/cambiar-contrasena" → throw redirect({ to: "/app/cambiar-contrasena" })
export function requireModule(auth: AuthContextValue, module: ModuleKey): void;
  // sin el módulo → throw redirect({ to: "/app/sin-acceso", search: { modulo: module } })
export function requireAdmin(auth: AuthContextValue): void;   // → /app/sin-acceso
```

**5. Router con contexto de autenticación**
- `src/router.tsx`: `export interface RouterContext { queryClient: QueryClient; auth: AuthContextValue }` y `createRouter({ routeTree, context: { queryClient, auth: undefined as unknown as AuthContextValue }, ... })`.
- `src/routes/__root.tsx`: `createRootRouteWithContext<RouterContext>()`.
- `src/main.tsx`:
```tsx
const router = createAppRouter();

function InnerApp() {
  const auth = useAuth();
  useEffect(() => {
    void router.invalidate();          // reevalúa las guardas al cambiar la sesión
  }, [auth.status, auth.user]);
  if (auth.status === "loading") return <Splash />;   // logo centrado + "Cargando…"
  return <RouterProvider router={router} context={{ auth }} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

**6. Rutas**
- `index.tsx`: `beforeLoad: ({ context }) => { throw redirect({ to: context.auth.isAuthenticated ? "/app" : "/login" }); }`.
- `login.tsx`: `validateSearch` → `{ redirect?: string }`; `beforeLoad`: si ya hay sesión → `throw redirect({ href: safeRedirect(search.redirect) })`. `onSubmit` de `LoginForm` = `await auth.login(email, password)`. Al cambiar el estado, `router.invalidate()` vuelve a ejecutar `beforeLoad` y redirige solo (no navegues a mano). Los errores de la API (401, 403, 429, red) llegan como `ApiError` y `LoginForm` muestra su `message` tal cual.
- `app.tsx`: `beforeLoad: ({ context, location }) => requireAuth(context.auth, location)`. Componente: `<AppShell user={auth.user} items={visibleMenu(auth.user)} onLogout={() => void auth.logout()}>`.
- Rutas de módulo: agrega `beforeLoad: ({ context }) => requireModule(context.auth, "<MÓDULO>")` según §3.9; `usuarios.tsx` → `requireAdmin`.
- `app/index.tsx`: usa `auth.user` (saludo con `first_name` y tarjetas de los módulos visibles). Si el usuario no tiene módulos: `DataState` vacío con "Aún no tienes módulos asignados. Pide al administrador que te habilite los que necesites."
- `app/perfil.tsx`: datos de `auth.user`; último acceso formateado con `Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" })`.
- `app/cambiar-contrasena.tsx`: `forced = auth.user.must_change_password`; `onSubmit` → `apiFetch<TokenResponse>("/auth/change-password", { method: "POST", body })` → `auth.applyTokenResponse(response)` → `toast.success("Contraseña actualizada")` → `navigate({ to: "/app" })`.
- Elimina `src/dev/` y cualquier referencia a `DEV_PREVIEW_USER`.

**7. Pruebas** (`vi.stubGlobal("fetch", vi.fn())`; limpia `sessionStorage` en `beforeEach`)

| Archivo | Casos |
|---|---|
| `client.test.ts` | agrega `Authorization` cuando hay token; convierte el cuerpo de error en `ApiError` con `status`, `code` y `message`; `401 TOKEN_EXPIRED` → llama a `/auth/refresh` → reintenta → devuelve los datos; dos peticiones simultáneas con 401 → **una** sola llamada a refresh; refresh fallido → tokens borrados, manejador llamado una vez, lanza `ApiError`; `401 INVALID_CREDENTIALS` con `auth:false` → **no** intenta refresh ni llama al manejador; fallo de red → `NETWORK_ERROR`; `204` → `undefined` |
| `auth-context.test.tsx` | sin tokens → `anonymous` sin llamar a `fetch`; con tokens y `/auth/me` OK → `authenticated` con el usuario; `/auth/me` 401 → `anonymous` y tokens borrados; `login` guarda los tokens y expone el usuario; `logout` borra los tokens aunque la API falle; `hasModule` e `isAdmin` correctos |
| `guards.test.ts` | `safeRedirect`: `"/app/cartas"` sí; `"https://x.com"`, `"//x"`, `"/login"` y `undefined` → `"/app"`; `requireAuth` anónimo → lanza redirect a `/login` con `redirect`; con `must_change_password` → redirect a `/app/cambiar-contrasena` (salvo en esa misma ruta); `requireModule` ADMIN pasa, OPERADOR sin módulo → redirect a `/app/sin-acceso`; `requireAdmin` |

#### Verificación de punta a punta (manual, con la API real)
```powershell
# Terminal 1 (BD limpia para probar el primer arranque):
Remove-Item -Recurse -Force .data -ErrorAction SilentlyContinue ; .\scripts\dev-backend.ps1
# Terminal 2:
.\scripts\dev-frontend.ps1
```
1. Abre `http://localhost:5173` → redirige a `/login`.
2. Credenciales incorrectas → "Correo o contraseña incorrectos."; seis intentos fallidos seguidos → mensaje de demasiados intentos.
3. Entra con el admin (correo de `.env` y contraseña de `.data\CREDENCIALES_INICIALES.txt`) → te lleva a **Cambiar contraseña**, sin menú. Intentar abrir `/app/cartas` → regresa a cambiar contraseña.
4. Cambia la contraseña → toast, Inicio con todos los módulos; el archivo de credenciales desapareció.
5. Recarga la página (F5) → sigue la sesión. Abre `/app/calendario` directo → carga.
6. Crea un operador con `python -m scripts.create_user ... --modules CARTAS --no-must-change` (ver 1.3), entra en otra ventana privada → solo ve Inicio, Cartas, Búsqueda por código y Mi perfil; `/app/inventario` → "Sin acceso".
7. Cerrar sesión → `/login` y toast "Sesión cerrada". El botón "atrás" del navegador no vuelve a mostrar datos.
8. Con la sesión abierta, detén la API → cualquier acción muestra el error de conexión (no queda en blanco).
9. `npm run build` y abre `http://127.0.0.1:8000/` (FastAPI sirviendo `dist`) → el mismo flujo funciona en el mismo origen.

#### Fuera de alcance
Gestión de usuarios desde la interfaz (F2); módulos de negocio.

#### Criterios de aceptación
- [ ] Los 9 pasos de la verificación de punta a punta se cumplen.
- [ ] Ningún componente llama a `fetch` directamente: todo pasa por `apiFetch`.
- [ ] Los tokens solo están en `sessionStorage` (nunca en `localStorage` ni en la URL) y no se imprimen en consola.
- [ ] No queda `DEV_PREVIEW_USER` ni la carpeta `src/dev/`.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` (pruebas de la 1.4 + las nuevas) y `npm run build` sin errores.

**Commit final sugerido:** `feat: integra login, sesión y permisos de la SPA con la API`

`■ FIN DEL PROMPT 1.5`

---

### 4.6 Subtarea 1.6 — Lanzador, build y ejecutable Windows

`▶ INICIO DEL PROMPT 1.6`

**Rama:** `feat/f1-6-ejecutable` · **Depende de:** 1.2, 1.3 y 1.5 integradas en `main`

#### Objetivo
Implementar el flujo de doble clic de ADR-0003: un lanzador que prepara el directorio de datos, detecta una instancia abierta, elige el puerto, arranca Uvicorn con la app, espera a que responda, muestra un banner (con la IP de la red local si `LAN_MODE=true`) y abre el navegador. Además: el `.spec` de PyInstaller, el script de build de un solo comando, la prueba de humo automatizada contra el ejecutable, la recuperación de la contraseña del admin, el acceso directo y la documentación para el usuario final.

#### Archivos

| Acción | Archivo |
|---|---|
| Crear | `launcher/launcher.py`, `launcher/sonar_despierto.spec`, `launcher/config.env.template`, `launcher/LEEME_USUARIO.txt`, `launcher/assets/icon.ico` (copia de `frontend/public/favicon.ico`; provisional hasta tener el logo oficial), `scripts/build.ps1`, `scripts/Iniciar-SonarDespierto.bat`, `scripts/crear-acceso-directo.ps1`, `scripts/smoke_test.py`, `backend/tests/launcher/__init__.py`, `backend/tests/launcher/test_launcher_utils.py` |
| Modificar | `README.md` (versión final de la Fase 1); eliminar `launcher/README.md` |

#### Especificación

**1. `launcher/config.env.template`** (se copia a `{DATA_DIR}/config.env` solo si no existe):
```ini
# ------------------------------------------------------------------
#  Configuración de Soñar Despierto
#  Guarda los cambios y vuelve a abrir el programa para aplicarlos.
# ------------------------------------------------------------------

# Puerto donde se abre el sistema (http://localhost:PUERTO)
PORT=8765

# false = solo esta computadora puede entrar al sistema.
# true  = otras computadoras de la oficina pueden entrar con http://IP-DE-ESTA-PC:PUERTO
#         (Windows pedirá permiso en el Firewall: marca "Redes privadas").
LAN_MODE=false
```

**2. `launcher/launcher.py`** — estructura obligatoria (funciones pequeñas y probables):
```python
"""Lanzador de Soñar Despierto: prepara los datos, inicia el servidor local y abre el navegador (ADR-0003)."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

APP_ID = "sonar-despierto"
PORT_SEARCH_RANGE = 20
STARTUP_TIMEOUT_S = 60


if not getattr(sys, "frozen", False):      # desde el código fuente: hace importable el paquete `app`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    # --no-browser, --port N, --lan, --data-dir RUTA, --reset-admin, --email CORREO
    ...


def apply_env(args: argparse.Namespace) -> None:
    """Se ejecuta ANTES de importar app.* (paths y config leen el entorno al importarse)."""
    # --data-dir → SD_DATA_DIR ; --port → PORT ; --lan → LAN_MODE=true ;
    # si es ejecutable (sys.frozen) → APP_ENV=production por defecto (setdefault)
    ...


def configure_console() -> None:      # stdout/stderr en UTF-8 (reconfigure) y título de la ventana en Windows
    ...

def template_path() -> Path:          # junto a launcher.py, o en sys._MEIPASS/launcher si es ejecutable
    ...

def write_default_config(data_dir: Path) -> bool:   # copia la plantilla si no existe config.env; True si la creó
    ...

def health_info(port: int, timeout: float = 1.5) -> dict | None:   # GET http://127.0.0.1:{port}/api/v1/health
    ...

def is_our_instance(port: int) -> bool:   # health_info(...)["app"] == APP_ID
    ...

def port_is_free(host: str, port: int) -> bool:   # bind sin SO_REUSEADDR (en Windows permitiría puertos ocupados)
    ...

def find_free_port(host: str, start: int, span: int = PORT_SEARCH_RANGE) -> int:   # RuntimeError si no hay
    ...

def lan_ipv4_addresses() -> list[str]:   # IPv4 locales sin 127.*: getaddrinfo(hostname) + truco UDP (sin enviar tráfico)
    ...

def print_banner(local_url: str, lan_urls: list[str], data_dir: Path, version: str) -> None:
    ...

def print_initial_credentials(data_dir: Path) -> None:
    # si existe CREDENCIALES_INICIALES.txt, imprime su contenido enmarcado y la ruta del archivo
    ...

def announce_when_ready(server, port: int, settings, open_browser: bool) -> None:
    # hilo: espera server.started y health_info(port) (máx. STARTUP_TIMEOUT_S);
    # luego banner + credenciales + webbrowser.open(f"http://localhost:{port}/")
    ...

def reset_admin(email: str | None) -> int:
    # run_migrations(); with new_session(): reset_password_to_temporary(db, email);
    # imprime la contraseña temporal UNA vez y la ruta del archivo de credenciales; devuelve 0 (o 1 con error legible)
    ...

def pause_if_frozen() -> None:   # en el ejecutable: input("Presiona Enter para cerrar...") para que la ventana no desaparezca
    ...


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    apply_env(args)
    configure_console()

    from app.core import paths                     # importación diferida (después de apply_env)
    paths.ensure_data_dirs(paths.DATA_DIR)
    write_default_config(paths.DATA_DIR)

    from app.core.config import get_settings
    settings = get_settings()

    if args.reset_admin:
        return reset_admin(args.email)

    if is_our_instance(settings.PORT):
        print("Soñar Despierto ya está abierto. Abriendo el navegador…")
        if not args.no_browser:
            webbrowser.open(f"http://localhost:{settings.PORT}/")
        return 0

    port = settings.PORT if port_is_free(settings.bind_host, settings.PORT) else \
        find_free_port(settings.bind_host, settings.PORT + 1)
    if port != settings.PORT:
        print(f"Aviso: el puerto {settings.PORT} está ocupado por otro programa; se usará {port}.")

    import uvicorn
    from app.main import app

    config = uvicorn.Config(app, host=settings.bind_host, port=port, log_config=None,
                            access_log=False, http="h11", loop="asyncio", lifespan="on")
    server = uvicorn.Server(config)
    threading.Thread(target=announce_when_ready, args=(server, port, settings, not args.no_browser),
                     daemon=True).start()
    try:
        server.run()                               # hilo principal: Ctrl+C lo maneja uvicorn
    except (KeyboardInterrupt, SystemExit):
        pass
    if not server.started:
        print("No se pudo iniciar el sistema. Revisa el registro en:", paths.DATA_DIR / "logs" / "sonar.log")
        pause_if_frozen()
        return 1
    print("Sistema detenido. Ya puedes cerrar esta ventana.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```
Banner esperado:
```text
============================================================
  Soñar Despierto — Sistema de Gestión  v0.1.0
------------------------------------------------------------
  Abierto en esta computadora:  http://localhost:8765
  Desde otras PCs de la red:    http://192.168.1.25:8765     ← solo si LAN_MODE=true
  Datos y respaldos en:         C:\Users\...\AppData\Local\SonarDespierto
------------------------------------------------------------
  NO cierres esta ventana mientras uses el sistema.
  Para apagarlo: cierra esta ventana o presiona Ctrl+C.
============================================================
```
Con `LAN_MODE=false`, en lugar de la línea de red muestra: `Acceso desde otras PCs: desactivado (LAN_MODE=false en config.env)`.

**3. `launcher/sonar_despierto.spec`**
```python
# -*- mode: python ; coding: utf-8 -*-
# Construir desde la raíz del repo:  pyinstaller launcher\sonar_despierto.spec --noconfirm --clean
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parent          # SPECPATH = carpeta del .spec (launcher/)
BACKEND = ROOT / "backend"

hiddenimports = (
    collect_submodules("app")
    + collect_submodules("alembic.ddl")
    + [
        "uvicorn.logging", "uvicorn.loops.asyncio", "uvicorn.protocols.http.h11_impl",
        "uvicorn.lifespan.on", "sqlalchemy.dialects.sqlite", "logging.config", "email_validator",
    ]
)

a = Analysis(
    [str(ROOT / "launcher" / "launcher.py")],
    pathex=[str(BACKEND)],
    datas=[
        (str(ROOT / "frontend" / "dist"), "frontend/dist"),
        (str(BACKEND / "alembic"), "backend/alembic"),
        (str(BACKEND / "alembic.ini"), "backend"),
        (str(ROOT / "launcher" / "config.env.template"), "launcher"),
    ],
    hiddenimports=hiddenimports,
    excludes=["tkinter", "pytest", "pymysql", "IPython"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True, name="SonarDespierto",
    console=True, icon=str(ROOT / "launcher" / "assets" / "icon.ico"), upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="SonarDespierto")
```

**4. `scripts/build.ps1`** — un solo comando, se detiene ante el primer error:
```powershell
# Genera dist\SonarDespierto\SonarDespierto.exe.  Uso: powershell -ExecutionPolicy Bypass -File scripts\build.ps1 [-SkipTests]
param([switch]$SkipTests)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Py = Join-Path $Root "backend\.venv\Scripts\python.exe"
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "Falló: $what" } }

Step "1/6 Dependencias del frontend"; Push-Location frontend; npm ci; Check "npm ci"; Pop-Location
if (-not $SkipTests) {
  Step "2/6 Calidad y pruebas del frontend"
  Push-Location frontend; npm run lint; Check "lint"; npm run typecheck; Check "typecheck"; npm test; Check "vitest"; Pop-Location
  Step "3/6 Calidad y pruebas del backend"
  Push-Location backend; & $Py -m ruff check .; Check "ruff"; & $Py -m pytest; Check "pytest"; Pop-Location
}
Step "4/6 Compilando la interfaz"; Push-Location frontend; npm run build; Check "vite build"; Pop-Location
Step "5/6 Empaquetando con PyInstaller"
& $Py -m PyInstaller launcher\sonar_despierto.spec --noconfirm --clean --distpath dist --workpath build; Check "pyinstaller"
Copy-Item launcher\LEEME_USUARIO.txt dist\SonarDespierto\ -Force
Step "6/6 Prueba de humo contra el ejecutable"
& $Py scripts\smoke_test.py --exe dist\SonarDespierto\SonarDespierto.exe; Check "smoke test"
Write-Host "`nListo: dist\SonarDespierto\SonarDespierto.exe" -ForegroundColor Green
```

**5. `scripts/smoke_test.py`** — solo biblioteca estándar (`subprocess`, `urllib`, `tempfile`, `json`):
- Argumentos: `--exe RUTA` (por defecto ejecuta `python launcher/launcher.py` desde el código fuente) y `--port` (por defecto 8799).
- Lanza el proceso con `--no-browser --port <p> --data-dir <tmp>` y un entorno **limpio** (sin `FIRST_ADMIN_*`, `DATABASE_URL`, `SD_DATA_DIR` ni `JWT_SECRET_KEY` heredados).
- Espera hasta 90 s a que `/api/v1/health` devuelva `app == "sonar-despierto"`.
- Comprueba, en orden: existe `<tmp>/sonar.db`; existe `CREDENCIALES_INICIALES.txt` y de él obtiene correo y contraseña; `POST /auth/login` → `must_change_password == true`; `GET /api/v1/_x` → 404 JSON; `POST /auth/change-password` → 200 y el archivo de credenciales ya no existe; `GET /auth/me` con el token nuevo → 200; `GET /` y `GET /app/calendario` → HTML con `<div id="root">` (en modo código fuente requiere haber ejecutado `npm run build`); solo con `--exe`: `GET /docs` → 404 (desactivado en `production`).
- Siempre termina el proceso (`terminate()`, luego `kill()` tras 10 s) y borra el directorio temporal. Imprime `SMOKE TEST OK` o el paso que falló; código de salida 0 o 1.

**6. `scripts/Iniciar-SonarDespierto.bat`** (para desarrolladores, desde el código fuente):
```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0.."
if not exist "backend\.venv\Scripts\python.exe" (
  echo Primero ejecuta: powershell -ExecutionPolicy Bypass -File scripts\setup-dev.ps1
  pause & exit /b 1
)
"backend\.venv\Scripts\python.exe" launcher\launcher.py %*
if errorlevel 1 pause
```


**7. `scripts/crear-acceso-directo.ps1`** — parámetro `-ExePath` (por defecto `dist\SonarDespierto\SonarDespierto.exe` resuelto a ruta absoluta); crea `Soñar Despierto.lnk` en el Escritorio del usuario con `WScript.Shell` (`TargetPath`, `WorkingDirectory`, `IconLocation`, `Description = "Sistema de Gestión Soñar Despierto"`).

**8. `launcher/LEEME_USUARIO.txt`** — en español sencillo, para personal no técnico: qué es; cómo abrirlo (doble clic en "Soñar Despierto"); primera vez (dónde están las credenciales iniciales y que se pedirá cambiar la contraseña); no cerrar la ventana negra; cómo permitir el acceso desde otras PCs (editar `config.env` → `LAN_MODE=true`, reiniciar, aceptar el aviso del Firewall en "Redes privadas", usar la dirección que muestra el banner); qué hacer si olvidan la contraseña del administrador (`SonarDespierto.exe --reset-admin` desde una terminal en la carpeta del programa); dónde están los datos y que **no** deben borrar esa carpeta; aviso de no usar el modo de red en Wi-Fi públicas.

**9. `README.md`** — versión final de la Fase 1: descripción; arquitectura en una línea (con enlace a los ADR); requisitos de desarrollo; puesta en marcha (`setup-dev.ps1`, `dev-backend.ps1`, `dev-frontend.ps1`); pruebas; build (`build.ps1`) y resultado; ejecutar desde el código (`Iniciar-SonarDespierto.bat`); modo LAN; directorio de datos; recuperación del admin; estado de las fases (F1 ✅ al cerrar el Gate).

**10. Pruebas `backend/tests/launcher/test_launcher_utils.py`** (agrega `<repo>/launcher` a `sys.path`):
- `parse_args` reconoce todas las banderas;
- `write_default_config` crea `config.env` una vez y no lo sobrescribe;
- `find_free_port` salta un puerto ocupado (abre un socket en escucha durante la prueba) y `port_is_free` lo reporta como ocupado;
- `lan_ipv4_addresses()` devuelve cadenas IPv4 válidas, sin `127.*`;
- `is_our_instance` devuelve `False` en un puerto libre.

#### Comandos de verificación
```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
# Prueba manual en la PC de desarrollo:
.\dist\SonarDespierto\SonarDespierto.exe
powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1
# Segundo doble clic con el sistema abierto → solo abre el navegador (no inicia otra instancia)
.\dist\SonarDespierto\SonarDespierto.exe --reset-admin
```

#### Criterios de aceptación
- [ ] `scripts\build.ps1` termina en verde e imprime `SMOKE TEST OK`.
- [ ] En una PC **sin Python ni Node** (o una cuenta de Windows limpia), copiar `dist\SonarDespierto\` y hacer doble clic abre el navegador en el login en menos de 15 s. Los datos quedan en `%LOCALAPPDATA%\SonarDespierto`.
- [ ] Un segundo doble clic no abre otra instancia: solo el navegador.
- [ ] Con el puerto 8765 ocupado por otro programa, el sistema arranca en el siguiente puerto libre y lo avisa.
- [ ] Con `LAN_MODE=true` en `config.env`: el banner muestra la IP y otra PC de la misma red entra al login (tras permitirlo en el Firewall, en perfil privado).
- [ ] `--reset-admin` permite volver a entrar y obliga a cambiar la contraseña.
- [ ] Cerrar la ventana de consola detiene el servidor (el puerto queda libre).
- [ ] Las pruebas del lanzador pasan; Ruff sin errores en `launcher/` y `scripts/` (`ruff check launcher scripts --config backend/pyproject.toml`).

**Commit final sugerido:** `build: lanzador, empaquetado con PyInstaller y prueba de humo del ejecutable`

`■ FIN DEL PROMPT 1.6`

---

## 5. Gate de la Fase 1 (criterio de salida)

La fase se considera **terminada** solo si se cumple todo lo siguiente sobre `main`:

**Automático**
- [ ] `scripts\build.ps1` sin `-SkipTests` en verde: Ruff, ≥ 40 pruebas de pytest, ESLint, `tsc`, Vitest, build y `SMOKE TEST OK`.
- [ ] `alembic upgrade head` → `downgrade base` → `upgrade head` sin errores.

**Manual — guion de demostración para la directiva (10 minutos)**
1. Doble clic en el acceso directo "Soñar Despierto" del escritorio → consola con banner → navegador en el login (diseño de Lovable).
2. Entrar con las credenciales iniciales → pantalla obligatoria de cambio de contraseña (con indicador de fortaleza).
3. Inicio del administrador: saludo, tarjetas de los 7 módulos "Próximamente · Fase N", menú lateral completo.
4. Mi perfil; cerrar sesión; volver a entrar con la contraseña nueva.
5. Entrar como operador (creado con `create_user`) con `CARTAS` y `CALENDARIO`: solo ve esos módulos; abrir `/app/inventario` → "Sin acceso".
6. Vista móvil (DevTools a 360 px): navegación inferior con "Más".
7. (Si aplica) `LAN_MODE=true` → entrar desde una segunda PC o un celular conectado a la red de la oficina.
8. Cerrar la ventana negra → el sistema se apaga; abrir de nuevo → los datos siguen ahí.

**Documentación**
- [ ] README actualizado; `LEEME_USUARIO.txt` incluido en `dist`.
- [ ] Desviaciones de las subtareas registradas (ADR nuevo si alguna cambió una decisión).
- [ ] `docs/Roadmap_Fases.md`: F1 marcada como completada con la fecha.

---

## 6. Problemas conocidos y cómo resolverlos

| Síntoma | Causa probable | Solución |
|---|---|---|
| `npm install` falla con `EBADENGINE` o errores de Vite | Node antiguo | Instalar Node 22 LTS (≥ 22.12) y repetir |
| `npm install` falla con `ERESOLVE` mencionando `rolldown` | El `override` heredado de Lovable | Quitar `overrides` del `package.json`, reinstalar y reportarlo |
| `git status` muestra todo como modificado | Fines de línea | Paso 2 de la 1.1 (`.gitattributes` + `--renormalize`) |
| `database is locked` | Escrituras simultáneas largas o BD en carpeta sincronizada | Verificar `busy_timeout` y WAL; nunca poner `DATA_DIR` en OneDrive/Dropbox |
| Página en blanco tras `npm run build` servido por FastAPI | `/assets` no montado o `dist` desactualizado | Revisar `mount_spa` y volver a compilar; ver la consola del navegador |
| Recargar `/app/cartas` da 404 | Falta el *fallback* de la SPA | Ruta comodín de `mount_spa` (1.2) |
| Las fuentes no cargan sin internet | Importación desde Google Fonts | Usar solo `@fontsource/*` (1.4, Paso 3) |
| El antivirus bloquea `SonarDespierto.exe` | Heurística sobre PyInstaller | Modo *one-folder* sin UPX (ya configurado); agregar una exclusión; firma de código en la F8 |
| Otras PCs no entran en modo LAN | Firewall o perfil de red "Público" | Perfil de red **Privado**; permitir la app en el Firewall o, como administrador: `New-NetFirewallRule -DisplayName "Soñar Despierto" -Direction Inbound -Protocol TCP -LocalPort 8765 -Action Allow -Profile Private` |
| Olvidaron la contraseña del admin | — | `SonarDespierto.exe --reset-admin` en la PC anfitriona (o `python -m scripts.seed` / `create_user` en desarrollo) |
| `ModuleNotFoundError` dentro del `.exe` | Import dinámico no detectado por PyInstaller | Agregarlo a `hiddenimports` en el `.spec` y reconstruir |
| Las pruebas tocan la BD real de desarrollo | Variables definidas después de importar `app` | En `conftest.py`, `os.environ.update(...)` va **antes** de cualquier `import app` |
