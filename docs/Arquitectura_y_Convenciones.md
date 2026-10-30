# Arquitectura y Convenciones del Proyecto — Soñar Despierto

> **Versión 2.0 · 2026-10-23.** Mismo stack que **My Best DataBase** y **SEMA** (ADR-0009): Node.js + Express + SQLite (`better-sqlite3`) + HTML/CSS/JS sin frameworks. Sustituye a la versión 1.x (FastAPI + MySQL y después FastAPI + SQLite + React). Donde haya contradicción, mandan los ADR de [`adr/`](adr/README.md).
>
> **Propósito:** fijar la estructura de carpetas, la configuración, las convenciones y el orden de construcción para que todo el código (escrito por personas o por IA) sea consistente.
> **Documentos relacionados:** `Requerimientos_Tecnicos.md`, `Modelo_Datos.md`, `API_Spec.md`, `Pantallas_UI.md`, `Roadmap_Fases.md`

---

## 1. Arquitectura general

```text
 [Doble clic: SonarDespierto.bat]
        │  server.js: carpeta de datos, config.env, instancia única, puerto libre, banner, navegador
        ▼
 Node.js + Express  (127.0.0.1:8765  |  0.0.0.0:8765 si LAN_MODE=true)
   ├── /api/*      → API REST JSON (Bearer JWT)
   │                 routes/ (HTTP) → services/ (casos de uso + SQL) → lib/ (BD, seguridad, reglas puras)
   ├── /  y /app   → public/login.html y public/app.html
   ├── /css /js /vendor /img → archivos estáticos de public/
   └── better-sqlite3 ──►  SQLite (WAL)  %LOCALAPPDATA%\SonarDespierto\sonar.db
                           (+ logs\, uploads\, backups\, secret.key, config.env)
```

- **Un solo proceso y un solo puerto:** Express sirve la API y las páginas. No hay paso de compilación: se edita un archivo de `public/` y se recarga el navegador.
- **Capas (como SEMA):**
  1. `routes/` valida la petición (tipos, longitudes, obligatorios) y responde. **No** escribe SQL ni reglas de negocio.
  2. `services/` contiene los casos de uso y **todo** el SQL (`db.prepare(...)`), con transacciones `db.transaction(...)`. Registra la bitácora dentro de la misma transacción.
  3. `lib/` contiene la infraestructura y las funciones puras (configuración, conexión, migraciones, seguridad, middlewares, catálogos, arranque). Las reglas puras se prueban sin BD.
- **El frontend nunca decide permisos:** solo oculta. El servidor valida en cada petición con los middlewares de `lib/auth.js`.

## 2. Stack y versiones

| Pieza | Elección |
|---|---|
| Entorno | Node.js ≥ 20 (recomendado **22 LTS**; las pruebas usan patrones glob de `node --test`, disponibles desde Node 21) |
| Servidor | `express` ^4.21 |
| Base de datos | SQLite con `better-sqlite3` ^12 (síncrono, una conexión compartida) |
| Sesión | `jsonwebtoken` ^9 (HS256) |
| Contraseñas | `bcryptjs` ^2.4 (costo 10) |
| Configuración | `dotenv` ^16 |
| Frontend | HTML5, CSS3 con variables (`theme.css`), JavaScript sin frameworks, módulos IIFE |
| Pruebas | `node:test` + `node:assert/strict` (sin dependencias extra) |
| Empaquetado | `npm run empaquetar` → carpeta portátil con `node.exe` (ADR-0009 §7) |

**No se agregan dependencias** sin aprobación del líder técnico (mismo criterio que SEMA).

## 3. Estructura de carpetas

```text
Sonar-Despierto-OS/
├── server.js                 # arranque: opciones, migraciones, admin inicial, instancia única, banner, navegador
├── SonarDespierto.bat        # acceso directo de Windows (instala dependencias la 1.ª vez si no es el paquete)
├── package.json              # scripts: start, dev, test, reset-admin, create-user, empaquetar
├── .env.example              # configuración de desarrollo (copiar a .env)
├── config.env.template       # configuración del paquete portátil (se copia a la carpeta de datos)
├── LEEME_USUARIO.txt         # guía para el personal
├── lib/
│   ├── app.js                # createApp(): cabeceras de seguridad, /api, páginas, errores
│   ├── auth.js               # requireAuth, requireAuthAllowPending, requireAdmin, requireModule('X')
│   ├── config.js             # configuración por capas + secret.key
│   ├── db.js                 # conexión, PRAGMAs, nowIso(), toIso()
│   ├── errors.js             # AppError, validationError, wrap, manejador de errores
│   ├── launcher.js           # puerto libre, instancia única, IPs de la red, banner, abrir navegador
│   ├── logger.js             # {DATA_DIR}/logs/sonar.log
│   ├── migrations.js         # migraciones numeradas (PRAGMA user_version)
│   ├── modules.js            # roles y catálogo de módulos
│   ├── paths.js              # carpeta de datos y rutas del programa
│   ├── rate-limit.js         # límite de intentos en memoria
│   └── security.js           # bcrypt, política de contraseñas, temporales, JWT
├── services/                 # casos de uso + SQL: auth.js, users.js, audit.js, (F3+) volunteers.js, letters.js…
├── routes/                   # capa HTTP: health.js, auth.js, (F2+) users.js, audit-logs.js…
├── public/
│   ├── login.html · app.html
│   ├── css/      theme.css (tokens) · base.css (componentes) · app.css · login.css
│   ├── js/       theme.js · ui-kit.js · access.js · login.js · app.js
│   │             inicio.js · perfil.js · cambiar-contrasena.js · sin-acceso.js · proximamente.js
│   ├── vendor/fonts/  Figtree, Nunito, Jost, Playfair Display (woff2) + fonts.css
│   └── img/      favicon.ico
├── scripts/      reset-admin.js · create-user.js · empaquetar.js · crear-acceso-directo.ps1
├── test/         helpers.js + *.test.js (node:test)
└── docs/         estos documentos, adr/ y fases/
```

> En la Fase 2 y siguientes, cada módulo de negocio agrega **un archivo por capa**: `routes/<recurso>.js`, `services/<recurso>.js`, `public/js/<vista>.js` (+ su migración en `lib/migrations.js` y sus pruebas en `test/<recurso>.test.js`).

## 4. Configuración

Precedencia: **variables de entorno > `{DATA_DIR}/config.env` > `.env` (raíz) > valores por defecto** (`lib/config.js`).

| Variable | Por defecto | Uso |
|---|---|---|
| `APP_ENV` | `development` (`production` en el paquete) | `test` habilita las rutas `/api/_test/*` |
| `PORT` | `8765` | Si está ocupado se prueban los 20 siguientes |
| `LAN_MODE` | `false` | `true` → escucha en `0.0.0.0` (solo red privada de la oficina) |
| `OPEN_BROWSER` | `true` | `npm run dev` lo desactiva |
| `SD_DATA_DIR` | `<repo>\.data` · paquete: `%LOCALAPPDATA%\SonarDespierto` | Carpeta de datos (también `--data-dir`) |
| `DB_PATH` | `{DATA_DIR}\sonar.db` | Solo para casos especiales |
| `JWT_SECRET` | vacío → `{DATA_DIR}\secret.key` | Mínimo 32 caracteres |
| `SESSION_HOURS` | `8` | Vigencia del token de sesión |
| `FIRST_ADMIN_EMAIL` | `admin@sonardespierto.org` | Administrador inicial |
| `FIRST_ADMIN_PASSWORD` | vacío → temporal en `CREDENCIALES_INICIALES.txt` | Solo si la BD no tiene usuarios |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MINUTES` | `5` / `15` | Límite de intentos fallidos por (IP, correo) |
| `MAX_UPLOAD_MB` | `5` | Fotos de cartas (Fase 4) |

`.env`, `secret.key`, `CREDENCIALES_INICIALES.txt`, `.data/`, `node_modules/` y `dist/` **nunca** se suben a git.

> ⚠️ El repositorio vive en OneDrive. La carpeta `.data` de desarrollo funciona, pero si notas bloqueos de la BD usa `SD_DATA_DIR=C:\SonarDespiertoDatos` en tu `.env`. En producción la BD **siempre** va en `%LOCALAPPDATA%`.

## 5. Convenciones de código

| Ámbito | Regla | Ejemplo |
|---|---|---|
| Idioma | Tablas, columnas, rutas de API y JSON en **inglés** (como `Modelo_Datos.md` y `API_Spec.md`); textos de interfaz, mensajes de error y comentarios en **español** | `users.first_name` · "Correo o contraseña incorrectos." |
| Archivos | `kebab-case` | `cambiar-contrasena.js`, `rate-limit.js` |
| Variables y funciones JS | `camelCase` | `effectiveModules()` |
| Vistas del frontend | objeto `PascalCase`, IIFE con `mount(contenedor, contexto)` | `const Perfil = (() => { … })();` |
| Constantes | `UPPER_SNAKE_CASE` | `MODULE_KEYS` |
| Tablas y columnas | `snake_case`, tablas en plural | `user_module_permissions.module` |
| Rutas API | `/api/<recurso-en-plural>`, minúsculas, `kebab-case` | `/api/audit-logs` |
| JSON de la API | `snake_case` (contrato de `API_Spec.md`) | `{ "must_change_password": true }` |
| CSS | clases `kebab-case`; colores **solo** con variables de `theme.css` | `.module-card` · `var(--primary)` |

**Reglas obligatorias**

- CommonJS (`require`), `const`/`let` (nunca `var` salvo en `theme.js`, que corre antes que todo), `async/await`.
- SQL **siempre con parámetros** (`?` o `@nombre`). Nunca concatenar datos del usuario.
- Todo dato que venga del usuario o de la BD se inserta en HTML con `UI.escape()`.
- Errores: `throw new AppError(status, 'CODIGO', 'Mensaje para la persona.')`; validación: `throw validationError([{ field, message }])`. Las rutas async se envuelven con `wrap()`.
- Permisos: `requireModule('CARTAS')`, `requireAdmin` o `requireAuth` en **cada** router; el filtro de alcance va en el servicio.
- Transacciones: `db.transaction(() => { … })()` cuando un caso de uso escribe más de una fila (incluida la bitácora).
- Nunca escribir contraseñas, hashes, tokens ni datos de niñas y niños en `console`, `logs/` ni `audit_logs`.
- Funciones de más de ~50 líneas se dividen. Un archivo = una responsabilidad.
- Formato: 2 espacios, comillas simples, punto y coma, máximo ~110 caracteres por línea (como SEMA).

## 6. Base de datos y migraciones

- Una conexión compartida (`getDb()`), `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- **Migraciones** en `lib/migrations.js`: `{ version, name, up }`, aplicadas al arrancar en orden, cada una en su transacción; la versión queda en `PRAGMA user_version`. Nunca se edita una migración publicada: se agrega la siguiente. Si dos ramas agregan la misma versión, la segunda en integrarse se renumera.
- **Portabilidad hacia MySQL/PostgreSQL (fase de nube):** enums `TEXT` + `CHECK (x IN (...))`; fechas `TEXT` ISO 8601 UTC (`new Date().toISOString()`, en la API con `Z`); booleanos `INTEGER 0/1`; JSON en `TEXT`; nada de funciones exclusivas de SQLite en consultas de negocio (usa `lower(x) LIKE ?` y no `GLOB`); concurrencia con **bloqueo optimista** (`UPDATE … WHERE id = ? AND version = ?`).
- Una BD creada por la versión Python (Alembic `0001`) se adopta como versión 1 (mismas tablas y columnas).

## 7. API, sesión y errores

- Base: **`/api`**. JSON en `snake_case`. Fechas ISO 8601 UTC.
- Sesión: `Authorization: Bearer <token>`; un solo token de `SESSION_HOURS` con claim `ver` = `users.token_version`. Logout, cambio o restablecimiento de contraseña y desactivación incrementan `token_version`.
- El navegador guarda el token en **`sessionStorage`** (`sd.token`, `sd.user`): se borra al cerrar el navegador.
- Error estándar:

  ```json
  { "error": "Mensaje en español para mostrar.", "code": "CODIGO_ESTABLE", "details": [{ "field": "email", "message": "…" }] }
  ```

  `details` solo aparece en `422 VALIDATION_ERROR`. El frontend decide con `code`, nunca con el texto.

## 8. Frontend

- `login.html` (público) y `app.html` (con sesión). En `app.html`, la navegación es por **hash** (`/app#cartas`), como SEMA; `access.js` define las vistas, a qué módulo pertenecen y el menú.
- `ui-kit.js`: `UI.api`, `UI.toast`, `UI.confirm`, `UI.formModal`, `UI.setBusy`, `UI.icon`, `UI.logo`, `UI.formatDate` (hora de Veracruz), `UI.escape`.
- Diseño de Lovable recreado con CSS propio: paleta coral/naranja/sol en `theme.css` (tema claro y oscuro), texto base de 16 px, controles de 44 px, usable a 360 px.
- Estados de **carga, vacío y error** en cada vista; estados con color **y** texto.

## 9. Pruebas y calidad

- `npm test` → `node --test --test-concurrency=1 "test/*.test.js"`. Cada archivo usa una carpeta de datos temporal (`test/helpers.js`).
- Por cada endpoint: caso feliz, validación (`422`), permiso (`401`/`403`), conflicto (`409`) cuando aplique, y que la bitácora no guarde secretos.
- `npm run empaquetar` corre las pruebas, arma `dist\SonarDespierto` y ejecuta una **prueba de humo** contra el paquete.

## 10. Git

- `main` estable; ramas `feat/f<fase>-<subtarea>-<tema>` o `fix/…`; commits en español con prefijo convencional (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `build:`).
- Pull request con revisión; solo el líder técnico integra a `main`.
- `.gitattributes` normaliza finales de línea (LF; `.bat` y `.ps1` en CRLF).

## 11. Definición de "terminado" por módulo

1. Endpoints documentados en `API_Spec.md` y probados con `node:test`.
2. Pruebas de caso feliz, validación (`422`), permiso (`401`/`403`/alcance) y conflicto (`409`).
3. Vista con estados de carga, vacío y error, usable a 360 px y en tema claro y oscuro.
4. Acciones sensibles registradas en `audit_logs` sin secretos.
5. `npm test` y `npm run empaquetar` en verde.
