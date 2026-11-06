# Fase 8 — Empaquetado y entrega: contratos, revisión de seguridad y verificación

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local) · versión **1.0.0**
- **Fecha:** 2026-11-05 · **Estado:** Implementado (rama `feat/f8-empaquetado-entrega`); Gate con dos pasos manuales pendientes (§8)
- **Decisiones que aplica:** ADR-0003 (ejecución local, modo LAN), ADR-0007 (sesión y `token_version`), ADR-0009 (stack), ADR-0011 (fotos en `uploads\`) y **ADR-0015** (respaldos, restauración, instalador y endurecimiento)
- **Depende de:** Fases 1–7
- **Gate de la hoja de ruta:** instalación limpia en una PC sin Node.js; restaurar un respaldo funciona; manual validado por la directiva → `test/gate-f8.test.js` + prueba de humo + §8

No hay migración nueva (el esquema sigue en la versión de la F7). Lo nuevo vive en archivos y en la bitácora.

---

## 1. Alcance

| Pieza | Archivos |
|---|---|
| Respaldos (crear, listar, rotar, copia extra, diario, antes de actualizar) | `services/backups.js`, `lib/zip.js`, `server.js` |
| Restauración (pantalla, subir archivo, consola) | `services/backups.js`, `routes/backups.js`, `scripts/respaldos.js`, `Restaurar.bat` |
| Pantalla **Respaldos** (solo ADMIN) | `public/js/respaldos.js`, menú Administración |
| Datos de demostración | `scripts/demo.js` (`npm run demo`, `server.js --demo`), franja en `public/js/ui-kit.js` |
| Instalador de Windows | `installer/SonarDespierto.iss`, `scripts/instalador.js` (`npm run instalador`), `Respaldar.bat` |
| Revisión de seguridad | `lib/app.js` (CSP, Host, no-store), `public/js/session-guard.js`, `test/security.test.js`, §6 |
| Manual de usuario y guía de modo LAN | `public/manual.html` (también en `/manual.html` y en el menú Inicio), `docs/Guia_Modo_LAN.md`, `LEEME_USUARIO.txt` |

**Fuera de alcance:** cifrado de respaldos, HTTPS en la red local y firma digital del instalador (ver §9).

## 2. Respaldos

**Archivo:** `{DATA_DIR}\backups\sonar-<tipo>-AAAAMMDD-HHMMSS[-N].zip` (hora de Veracruz). Tipos:

| `kind` | Archivo | Cuándo | Se conservan |
|---|---|---|---|
| `AUTO` | `auto` | uno al día: al minuto de abrir y cada 30 min se revisa si ya hay uno de hoy | `BACKUP_KEEP` (14) |
| `MANUAL` | `manual` | botón "Respaldar ahora", `Respaldar.bat`, `npm run respaldar` | 30 |
| `ANTES_DE_RESTAURAR` | `antes-de-restaurar` | justo antes de cada restauración | 5 |
| `ANTES_DE_ACTUALIZAR` | `antes-de-actualizar` | al abrir un programa nuevo con una BD que tiene migraciones pendientes | 5 |
| `IMPORTADO` | `importado` | un `.zip` subido para restaurar | 5 |

**Contenido:** `manifest.json` (primera entrada, sin comprimir), `sonar.db` (copia con `db.backup()`, `journal_mode = DELETE`,
`integrity_check` = ok) y `uploads/…` (fotos, sin comprimir). Nunca `secret.key`, `config.env` ni `logs`.

```jsonc
// manifest.json
{ "app": "sonar-despierto", "format": 1, "kind": "MANUAL", "created_at": "2026-11-05T19:27:53.000Z",
  "app_version": "1.0.0", "schema_version": 6, "db_bytes": 245760, "db_sha256": "…", "uploads": 12,
  "counts": { "users": 5, "volunteers": 18, "schools": 5, "tutors": 4, "children": 40, "events": 3, "letters": 42,
              "activities": 6, "inventory_items": 6, "inventory_movements": 9 },
  "created_by": "admin@…" | null, "via": "app" | "auto" | "cli" | "actualizacion", "computer": "PC-OFICINA" }
```

**Copia extra:** con `BACKUP_COPY_DIR`, cada respaldo se copia también ahí (con la misma rotación). Si falla (USB
desconectada), el respaldo principal es válido, la respuesta trae `copy: { ok: false, error }` y la pantalla lo avisa.

## 3. API (base `/api/backups`, `requireAdmin`, `Cache-Control: no-store`)

| Método y ruta | Cuerpo | Respuesta | Errores |
|---|---|---|---|
| `GET /` | | `{ items: Backup[], settings }` (más reciente primero) | `401`, `403 FORBIDDEN` |
| `POST /` | | `201 { backup: Backup & { copy } }` | `409 BACKUP_IN_PROGRESS`, `500 BACKUP_FAILED` |
| `GET /:name/download` | | el `.zip` (`attachment`) — registra `BACKUP_DOWNLOADED` | `404` (nombre inválido o inexistente) |
| `POST /:name/restore` | `{ confirm: "RESTAURAR" }` | `Restore` | `422 CONFIRMATION_REQUIRED`, `422 BACKUP_INVALID` / `BACKUP_TOO_NEW` / `BACKUP_NO_ADMIN`, `404`, `409`, `500 RESTORE_FAILED` |
| `POST /restore-upload?confirm=RESTAURAR` | el `.zip` (`application/zip` u `octet-stream`) | `Restore` | los anteriores + `413 FILE_TOO_LARGE` (`MAX_RESTORE_MB`), `415` |

```jsonc
// Backup
{ "name": "sonar-manual-20261105-192753.zip", "kind": "MANUAL", "kind_label": "Manual", "created_at": "…", "size_bytes": 38912,
  "valid": true, "app_version": "1.0.0", "schema_version": 6, "uploads": 0, "counts": { … }, "created_by": "admin@…",
  "can_restore": true }
// settings
{ "auto_enabled": true, "keep": 14, "dir": "C:\\Users\\…\\SonarDespierto\\backups", "copy_dir": null,
  "last_backup_at": "…", "last_auto_at": "…", "last_error": null, "next_check_at": "…",
  "schema_version": 6, "app_version": "1.0.0", "max_restore_mb": 1024 }
// Restore
{ "restored": Backup, "pre_backup": Backup, "schema_from": 6, "schema_to": 6, "sessions_closed": true }
```

`name` debe coincidir con `^sonar-(auto|manual|antes-de-restaurar|antes-de-actualizar|importado)-\d{8}-\d{6}(-\d{1,3})?\.zip$`
(nada de rutas). Un `.zip` subido que no pasa la validación se borra y no queda en la lista.

## 4. Restaurar: reglas

1. **Validación completa antes de tocar nada:** ZIP íntegro (CRC de cada archivo), sin cifrar, sin rutas absolutas ni
   `..`, solo `manifest.json` + `sonar.db` + `uploads/…`; `manifest.app = sonar-despierto` y `format = 1`; SHA-256 de la
   base; `integrity_check`; `schema_version` ≤ el del programa (si no, `BACKUP_TOO_NEW`); al menos un ADMIN activo y
   aprobado (si no, `BACKUP_NO_ADMIN`: nadie podría entrar).
2. Respaldo `ANTES_DE_RESTAURAR` de lo que hay.
3. Reemplazo **síncrono** de `sonar.db` (y `-wal`/`-shm`) y de `uploads\`; si algo falla, se regresa todo como estaba
   (`500 RESTORE_FAILED`, "los datos quedaron como estaban").
4. Se abre la base (se aplican las migraciones que le falten: un respaldo viejo sirve en un programa nuevo).
5. `token_version + 1` para **todos** los usuarios: todas las sesiones se cierran (también la de quien restauró; la
   pantalla lo manda al inicio de sesión con el mensaje "Se restauró el respaldo del …").
6. Bitácora de la base restaurada: `BACKUP_RESTORED` con `user_id` de quien restauró **si existe en esa base con el mismo
   correo** (si no, `null` y su correo en `detail.by`).
7. Solo una operación a la vez (`409 BACKUP_IN_PROGRESS`).

**Consola (sistema cerrado):** `node server.js --restaurar ARCHIVO.zip [--si]`, `Restaurar.bat` (arrastrar el `.zip`
encima) o `npm run restaurar -- ARCHIVO`. Se niega si el sistema está abierto en el puerto configurado o los 19
siguientes, muestra el contenido y pide escribir `RESTAURAR`. `--respaldar` y `--listar-respaldos` funcionan con el
sistema abierto.

## 5. Bitácora

| Acción | `entity` / `entity_id` | `detail` |
|---|---|---|
| `BACKUP_CREATED` | `backups` / `null` | `{ file, kind, bytes, uploads, schema_version, via, copy: 'ok' \| 'error' \| null }` (el automático, sin `user_id`) |
| `BACKUP_DOWNLOADED` | `backups` / `null` | `{ file, bytes }` |
| `BACKUP_RESTORED` | `backups` / `null` | `{ file, backup_created_at, backup_app_version, schema_from, schema_to, uploads, pre_backup, by, via }` |

Grupo nuevo "Respaldos" en el filtro de la bitácora; "Sobre" enlaza a `#respaldos`. El respaldo "antes de actualizar" no
se registra (se toma con la base en solo lectura, antes de migrar).

## 6. Revisión de seguridad (2026-11-05)

| # | Área | Qué se revisó | Resultado |
|---|---|---|---|
| 1 | Contraseñas e inicio de sesión | bcrypt (10), política 8–72 con letra y número, tiempo igual si el correo no existe, 5 intentos por equipo y correo en 15 min | ✅ sin cambios |
| 2 | Sesión | JWT HS256 con algoritmo fijado, clave de 48 bytes aleatorios en `secret.key`, `token_version` (logout, cambio de contraseña, desactivar, **restaurar**), `sessionStorage` | ✅ sin cambios |
| 3 | Permisos | guarda en cada router (`requireAdmin` / `requireModule`), permisos leídos de la BD en cada petición; un OPERADOR con todos los módulos recibe `403` en usuarios, bitácora y respaldos | ✅ prueba en `test/backups.test.js` |
| 4 | CSRF | el token va en la cabecera `Authorization`, no en cookies | ✅ no aplica |
| 5 | XSS | todas las plantillas usan `UI.escape`; **nuevo:** CSP `script-src 'self'`, el único script en línea (`app.html`) pasó a `js/session-guard.js`, prueba estática sin `<script>` en línea, `on…=`, `javascript:` ni `eval` | ✅ corregido |
| 6 | *Clickjacking* | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | ✅ |
| 7 | *DNS rebinding* | una página de internet podía apuntar un dominio propio a `127.0.0.1` y llamar a las rutas públicas (registro, login) | ✅ **corregido:** validación de `Host` → `421` |
| 8 | Caché del navegador | algunas respuestas con datos personales no llevaban `no-store` | ✅ **corregido:** `no-store` en toda la API |
| 9 | Encabezados | **nuevos:** `Permissions-Policy` (cámara solo del sitio, sin micrófono ni ubicación), `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`; sin `X-Powered-By` | ✅ |
| 10 | Archivos | fotos validadas por sus bytes, sin EXIF, rutas confinadas a `uploads\`, servidas solo con sesión; `express.static` solo sirve `public\`; la carpeta de datos no es accesible por URL | ✅ prueba en `test/security.test.js` |
| 11 | Inyección SQL | consultas preparadas; lo interpolado son constantes o columnas de listas fijas (revisión de `services/`) | ✅ |
| 12 | Errores y registros | la API nunca devuelve la pila; los logs no llevan contraseñas; la bitácora quita claves sensibles | ✅ |
| 13 | Respaldos | solo ADMIN, confirmación escrita, descarga auditada, sin `secret.key`, ZIP *slip*, bomba de compresión, CRC, SHA-256, tamaño máximo de subida | ✅ pruebas en `test/gate-f8.test.js` |
| 14 | Dependencias | `npm audit --omit=dev`: **0 vulnerabilidades** (5 dependencias directas, sin nuevas en la F8) | ✅ |
| 15 | Red local | HTTP sin cifrar dentro de la LAN | ⚠️ riesgo aceptado hasta la F9; guía de modo LAN |
| 16 | Datos en reposo | `sonar.db`, fotos y respaldos sin cifrar en el disco de la anfitriona | ⚠️ recomendar BitLocker y contraseña de Windows (manual §16) |

## 7. Instalador

`npm run instalador` (Windows 64 bits + Inno Setup 6: `winget install JRSoftware.InnoSetup`): pruebas → paquete portátil →
prueba de humo → `dist\instalador\SonarDespierto-Instalador-1.0.0.exe`.

- Por usuario, **sin permisos de administrador**, en `%LOCALAPPDATA%\Programs\SonarDespierto`; trae su `node.exe`.
- Menú Inicio: Soñar Despierto, Respaldar ahora, Carpeta de datos y respaldos, Manual de usuario, Configuración
  (config.env), Desinstalar y, opcional, Soñar Despierto (demostración). Escritorio: opcional (marcado).
- Actualizar = ejecutar el instalador nuevo encima: pide cerrar el sistema si está abierto, borra solo las carpetas del
  programa (`lib`, `routes`, `services`, `public`, `scripts`, `node_modules`) y, al abrir, respalda la BD antes de migrar.
- Desinstalar quita el programa y **conserva** `%LOCALAPPDATA%\SonarDespierto` (lo avisa).

## 8. Verificación y Gate

```powershell
npm test                 # 239 pruebas; incluye test/gate-f8.test.js, backups, security y demo
npm run empaquetar       # la prueba de humo agrega: CSP, manual, respaldo → cambio → restaurar → sesiones cerradas
npm run instalador       # en Windows con Inno Setup 6
```

**Automático (`test/gate-f8.test.js`):** (a) respaldo con foto → cambios → restaurar deja **fila por fila** los datos y la
foto del respaldo, cierra las sesiones, registra `BACKUP_RESTORED` y el respaldo "antes de restaurar" deshace la
restauración; (b) siete archivos dañados o ajenos y uno sin administradores → `422` sin tocar nada ni dejar temporales;
(c) restaurar subiendo el `.zip` y desde un respaldo de un esquema viejo (se migra); (d) `--respaldar`,
`--listar-respaldos` y `--restaurar` desde la consola.

**Manual (pendiente, lo hace el equipo):**

1. **Instalación limpia:** en una PC o cuenta de Windows **sin Node.js** (comprobar con `where node`): instalar con el
   `.exe`, abrir desde el Escritorio, entrar con la contraseña temporal, cambiarla, registrar una escuela, "Respaldar
   ahora", registrar otra escuela, restaurar el respaldo (la segunda desaparece), cerrar y volver a abrir. Probar la
   demostración y el modo LAN desde un celular. Desinstalar y comprobar que la carpeta de datos sigue ahí. Reinstalar y
   comprobar que los datos siguen.
2. **Manual validado por la directiva:** entregar `public/manual.html` (o el PDF impreso desde el navegador) y registrar
   sus observaciones.

**Guion de demostración (8 min):** instalador en una cuenta limpia → primer ingreso → Respaldos: "Respaldar ahora" y
descargar → registrar una niña → restaurar el respaldo y volver a entrar (la niña ya no está) → restaurar "Antes de
restaurar" (vuelve) → Bitácora › Respaldos → `Restaurar.bat` con el sistema cerrado → acceso de demostración con Laura
(solo Reportes) → modo LAN desde un celular.

## 9. Pendientes para la directiva

- Validar el manual de usuario (Gate).
- ¿Dónde se guarda la copia semanal fuera de la PC (USB bajo llave, carpeta en la nube de la asociación)? ¿Quién la hace?
- ¿Cifrar los respaldos con contraseña? (hoy no; contienen datos de menores).
- Logotipo oficial en alta resolución para el ícono del instalador (hoy provisional) y, si se puede, firma digital.
- Aviso de privacidad (LFPDPPP) y textos definitivos de confidencialidad: siguen pendientes antes de capturar datos reales.
