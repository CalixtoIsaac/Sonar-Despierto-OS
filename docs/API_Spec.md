# Especificación de API (MVP) — Soñar Despierto

> ✅ **Actualizado en las Fases 2 y 3 (2026-10-29; ADR-0004, ADR-0007, ADR-0008, ADR-0009, ADR-0010):** las secciones §3.1–§3.5 de este documento describen los **endpoints vigentes** de autenticación, auto-registro, usuarios, bitácora y personas (voluntarios, escuelas, tutores y niños). Contratos completos: [`fases/Fase_2_Prompts_Task_Document.md`](fases/Fase_2_Prompts_Task_Document.md) §3 y [`fases/Fase_3_Contratos.md`](fases/Fase_3_Contratos.md). **Fase 4 (2026-10-30, ADR-0011):** los endpoints vigentes de eventos y cartas están en [`fases/Fase_4_Contratos.md`](fases/Fase_4_Contratos.md) §4 y resumidos en §3.6–§3.7 abajo; el detalle original de esas secciones queda como referencia histórica. El dashboard (§3.8) se actualizará en la Fase 7.

> 🔄 **Actualización 2026-10-23 (ADR-0009):** el backend es **Node.js + Express** (mismo stack que SEMA y My Best DataBase). Cambios de forma, no de reglas: **base URL `/api`** (antes `/api/v1`); **un solo token** de sesión de 8 h en `token` (sin `refresh_token` ni `POST /auth/refresh`); formato de error **plano** `{ "error": "mensaje", "code": "CODIGO", "details": [...] }` (los códigos y mensajes no cambian); no hay Swagger: esta especificación es la documentación de referencia. Endpoints vigentes de la Fase 1: `POST /api/auth/login` → `{ token, expires_in, user }`, `POST /api/auth/logout` → `204`, `GET /api/auth/me` → `{ user }`, `POST /api/auth/change-password` → `{ token, expires_in, user }`, `GET /api/health`, `GET /api/health/db`. Los esquemas JSON siguen en `snake_case`.

> ⚠️ **Actualización 2026-10-17:** en el MVP local no hay registro público (`POST /auth/register` pasa a la fase de nube) y los roles son `ADMIN`/`OPERADOR` con permisos por módulo (ADR-0004). La autenticación vigente (refresh de 12 h, `logout`, `change-password` con respuesta 200 y nuevos tokens, `PASSWORD_CHANGE_REQUIRED`) está en ADR-0007 y en `fases/Fase_1_Prompts_Task_Document.md` §3.7. Cada fase actualizará su sección de este documento. Donde haya contradicción, mandan los ADR de [`adr/`](adr/README.md).

> **Versión:** 1.0 · **Backend:** FastAPI · **Auth:** JWT (Bearer) · **Base URL:** `/api/v1`
> **Documentos relacionados:** `Modelo_Datos.md`, `Pantallas_UI.md`, `Arquitectura_y_Convenciones.md`
> La documentación interactiva se genera automáticamente en `/docs` (Swagger UI) y `/redoc`.

---

## 1. Convenciones

### 1.1 Formato
- JSON en request y response (`Content-Type: application/json`), excepto subida de fotos (`multipart/form-data`).
- Campos en `snake_case`. Fechas `YYYY-MM-DD`; fecha-hora ISO 8601 en UTC (`2026-12-20T17:00:00Z`).
- Los enums viajan con los mismos valores que en la BD (`PENDIENTE`, `VOLUNTARIO`, …).

### 1.2 Autenticación
- Header: `Authorization: Bearer <access_token>`.
- `access_token`: expira en **30 min**. `refresh_token`: expira en **7 días**.
- Payload del JWT: `{ "sub": "<user_id>", "role": "ADMIN|VOLUNTARIO|TUTOR", "type": "access|refresh", "exp": ... }`.
- En cada request se verifica en BD que el usuario siga `is_active = TRUE`.

### 1.3 Roles (RBAC)

| Símbolo | Rol |
|---|---|
| 🌐 | Público (sin token) |
| 🔑 | Cualquier usuario autenticado |
| A | `ADMIN` (Coordinador) |
| V | `VOLUNTARIO` (incluye padrinos) |
| T | `TUTOR` (profesor / tutor responsable) |

### 1.4 Paginación, filtros y orden (listados)
Query params comunes: `page` (default 1), `page_size` (default 20, máx 100), `search` (texto), `order_by` (ej. `-created_at`).

Respuesta paginada:
```json
{
  "items": [ ... ],
  "total": 134,
  "page": 1,
  "page_size": 20,
  "pages": 7
}
```

### 1.5 Formato de errores
```json
{
  "error": {
    "code": "LETTER_ALREADY_ASSIGNED",
    "message": "Esta carta ya fue adoptada por otro padrino.",
    "details": null
  }
}
```

| HTTP | Cuándo | `code` típico |
|---|---|---|
| 400 | Regla de negocio violada | `INVALID_STATUS_TRANSITION`, `CONSENT_REQUIRED` |
| 401 | Sin token, token inválido o expirado | `NOT_AUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` |
| 403 | Rol sin permiso o recurso ajeno | `FORBIDDEN` |
| 404 | Recurso inexistente (o fuera del alcance del usuario) | `NOT_FOUND` |
| 409 | Duplicado o conflicto de concurrencia | `EMAIL_ALREADY_EXISTS`, `DUPLICATE_CHILD`, `LETTER_ALREADY_ASSIGNED` |
| 413 | Archivo demasiado grande | `FILE_TOO_LARGE` |
| 422 | Validación de Pydantic | `VALIDATION_ERROR` (en `details`, lista de campos) |
| 429 | Demasiados intentos de login | `TOO_MANY_REQUESTS` |
| 500 | Error inesperado (no se exponen trazas) | `INTERNAL_ERROR` |

> Los mensajes (`message`) van en **español** porque el frontend los muestra directamente.

> **Regla de alcance:** cuando un TUTOR o VOLUNTARIO pide un recurso que existe pero no le pertenece, se responde **404** (no 403) para no revelar su existencia.

---

## 2. Resumen de endpoints

| # | Método | Ruta | Roles |
|---|---|---|---|
| **Auth** ||||
| 1 | POST | `/auth/register` | 🌐 |
| 2 | POST | `/auth/login` | 🌐 |
| 3 | POST | `/auth/refresh` | 🌐 (con refresh token) |
| 4 | GET | `/auth/me` | 🔑 |
| 5 | POST | `/auth/change-password` | 🔑 |
| **Usuarios** ||||
| 6 | GET | `/users` | A |
| 7 | POST | `/users` | A |
| 8 | GET | `/users/{id}` | A |
| 9 | PATCH | `/users/{id}` | A |
| 10 | POST | `/users/{id}/reset-password` | A |
| **Voluntarios** ||||
| 11 | GET | `/volunteers/me` | V |
| 12 | PUT | `/volunteers/me` | V |
| 13 | GET | `/volunteers` | A |
| 14 | GET | `/volunteers/{user_id}` | A |
| 15 | GET | `/volunteers/export` | A |
| **Escuelas** ||||
| 16 | GET | `/schools` | A, T |
| 17 | POST | `/schools` | A |
| 18 | GET | `/schools/{id}` | A, T |
| 19 | PATCH | `/schools/{id}` | A |
| **Niños** ||||
| 20 | GET | `/children` | A, T |
| 21 | POST | `/children` | A, T |
| 22 | GET | `/children/{id}` | A, T |
| 23 | PATCH | `/children/{id}` | A, T |
| 24 | DELETE | `/children/{id}` | A |
| **Eventos** ||||
| 25 | GET | `/events` | 🔑 |
| 26 | POST | `/events` | A |
| 27 | GET | `/events/{id}` | 🔑 |
| 28 | PATCH | `/events/{id}` | A |
| 29 | POST | `/events/{id}/apply` | V |
| 30 | DELETE | `/events/{id}/apply` | V |
| 31 | GET | `/events/{id}/volunteers` | A |
| 32 | PATCH | `/events/{id}/volunteers/{user_id}` | A |
| **Cartas** ||||
| 33 | GET | `/letters` | A, T |
| 34 | POST | `/letters` | A, T |
| 35 | GET | `/letters/{id}` | A, T, V* |
| 36 | PATCH | `/letters/{id}` | A, T |
| 37 | POST | `/letters/{id}/photo` | A, T |
| 38 | GET | `/letters/{id}/photo` | A, T, V* |
| 39 | GET | `/letters/available` | V |
| 40 | GET | `/letters/mine` | V |
| 41 | POST | `/letters/{id}/adopt` | V |
| 42 | POST | `/letters/{id}/release` | V, A |
| 43 | POST | `/letters/{id}/status` | A |
| 44 | GET | `/letters/{id}/history` | A |
| 45 | GET | `/letters/by-code/{code}` | A |
| **Dashboard** ||||
| 46 | GET | `/dashboard/summary` | 🔑 (contenido según rol) |

`V*` = el voluntario solo ve la **vista restringida** de cartas que están disponibles o que él adoptó.

---

## 3. Detalle por módulo

### 3.1 Auth (vigente — Fases 1 y 2)

| Método y ruta | Acceso | Respuesta | Errores |
|---|---|---|---|
| `POST /api/auth/login` `{ email, password }` | 🌐 | `200 { token, expires_in, user: UserMe }` | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_PENDING`, `403 ACCOUNT_REJECTED`, `403 ACCOUNT_DISABLED`, `422`, `429 TOO_MANY_REQUESTS` |
| `POST /api/auth/logout` | 🔑 | `204` (invalida el token en todas las PCs) | `401` |
| `GET /api/auth/me` | 🔑 (aunque deba cambiar la contraseña) | `200 { user: UserMe }` | `401` |
| `PATCH /api/auth/me` `{ first_name?, last_name?, phone? }` | 🔑 | `200 { user }` (audita `PROFILE_UPDATED`) | `401`, `403 PASSWORD_CHANGE_REQUIRED`, `422` (campo no permitido, cuerpo vacío) |
| `POST /api/auth/change-password` `{ current_password, new_password }` | 🔑 | `200 { token, expires_in, user }` | `400 INVALID_CURRENT_PASSWORD`, `400 PASSWORD_REUSED`, `422` |
| `GET /api/auth/registration-info` | 🌐 | `200 { "enabled": true }` | — |
| `POST /api/auth/register` | 🌐 | `201 { email, account_status: "PENDIENTE", message }` (sin token) | `403 REGISTRATION_DISABLED`, `409 EMAIL_ALREADY_EXISTS`, `422`, `429` (5 solicitudes por equipo cada 60 min) |

`UserMe`: `{ id, email, first_name, last_name, phone, role, is_active, must_change_password, modules, last_login_at }`. `RegisterRequest`: `{ first_name, last_name, email, phone (10 dígitos), password, requested_modules: [], note?, accepts_confidentiality: true }`. La cuenta registrada queda `PENDIENTE` hasta que un ADMIN la aprueba (ADR-0008).

### 3.2 Usuarios (vigente — Fase 2, solo ADMIN)

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /api/users` `?page&page_size&search&role&account_status&is_active&module&order_by` | `Page<UserOut>` | `401`, `403 FORBIDDEN`, `422` |
| `GET /api/users/summary` | `{ pending, active, inactive, rejected, admins }` | |
| `POST /api/users` `{ email, first_name, last_name, phone?, role, modules }` | `201 { user: UserDetail, temporary_password }` (`Cache-Control: no-store`) | `409 EMAIL_ALREADY_EXISTS`, `422` |
| `GET /api/users/:id` | `{ user: UserDetail }` | `404 NOT_FOUND` |
| `PATCH /api/users/:id` `{ first_name?, last_name?, phone?, role?, modules?, is_active? }` | `{ user }` | `400 INVALID_ACCOUNT_STATE`, `400 SELF_ACTION_FORBIDDEN`, `400 LAST_ADMIN`, `404`, `422` |
| `POST /api/users/:id/approve` `{ role?, modules, note? }` | `{ user }` | `400 INVALID_ACCOUNT_STATE`, `404`, `422` |
| `POST /api/users/:id/reject` `{ reason }` (5–500) | `{ user }` | `400`, `404`, `422` |
| `POST /api/users/:id/reset-password` | `{ temporary_password, message }` (`no-store`) | `400`, `404` |
| `DELETE /api/users/:id` (solo solicitudes pendientes o rechazadas) | `204` | `400`, `404` |

Reglas: invariante `account_status ≠ APROBADA ⇒ is_active = 0`; el ADMIN no puede cambiar su propio rol, desactivarse, restablecerse ni eliminarse; siempre queda al menos un ADMIN activo. Esquemas `UserOut` / `UserDetail` y textos exactos de error: `fases/Fase_2_Prompts_Task_Document.md` §3.7–§3.8.

### 3.2b Bitácora (vigente — Fase 2, solo ADMIN)

`GET /api/audit-logs` `?page&page_size(50)&action(repetible)&entity&entity_id&actor_id&date_from&date_to` → `Page<AuditLogOut>` con `{ id, created_at, action, entity, entity_id, actor: UserRef | null, detail, ip_address }`, orden `created_at` desc. `date_from` incluido y `date_to` excluido (ISO 8601, se convierten a UTC). Acciones: las 16 de la Fase 2 + `RECORD_CREATED`, `RECORD_UPDATED`, `RECORD_DEACTIVATED`, `RECORD_ACTIVATED`, `DATA_EXPORTED` (Fase 3, ADR-0010).

### 3.3 Voluntarios (vigente — Fase 3, módulo `VOLUNTARIOS`)

Los voluntarios son **registros sin cuenta** (ADR-0004); los endpoints `/volunteers/me` del diseño original pasan a la fase de nube.

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /api/volunteers` `?page&page_size&search&area&shirt_size&is_active&order_by` | `Page<VolunteerListItem>` | `401`, `403 MODULE_FORBIDDEN`, `422` |
| `GET /api/volunteers/summary` (mismos filtros) | `{ total, shirt_sizes: { XS…XXL }, areas: { … } }` | |
| `GET /api/volunteers/export` (mismos filtros) | `text/csv` UTF-8 con BOM, sin notas médicas; audita `DATA_EXPORTED` | |
| `POST /api/volunteers` (campos + `accepts_privacy: true`) | `201 { volunteer: VolunteerOut }` | `409 DUPLICATE_VOLUNTEER` + `existing_id`, `422` |
| `GET /api/volunteers/:id` | `{ volunteer }` (incluye contacto de emergencia y notas médicas) | `404` |
| `PATCH /api/volunteers/:id` (campos + `is_active`) | `{ volunteer }` | `404`, `409`, `422` |

### 3.4 Escuelas y tutores (vigente — Fase 3, módulo `BENEFICIARIOS`)

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /api/schools` `?page&page_size&search&zone&is_active&order_by` | `Page<SchoolOut>` (con `children_count`, `tutors_count`) | `401`, `403`, `422` |
| `POST /api/schools` `{ name, cct?, zone?, address?, contact_name?, contact_phone? }` | `201 { school }` | `409 DUPLICATE_SCHOOL` + `existing_id` (CCT o nombre + zona), `422` |
| `GET` / `PATCH /api/schools/:id` (baja con `is_active: false`) | `{ school }` | `404`, `409`, `422` |
| `GET /api/tutors` `?page&page_size&search&school_id&is_active&order_by` | `Page<TutorOut>` | |
| `POST /api/tutors` `{ first_name, last_name, phone, email?, position?, school_id?, notes? }` | `201 { tutor }` | `409 DUPLICATE_TUTOR`, `422` (escuela inexistente o dada de baja) |
| `GET` / `PATCH /api/tutors/:id` | `{ tutor }` | `404`, `409`, `422` |

### 3.5 Niñas y niños (vigente — Fase 3, módulo `BENEFICIARIOS`, datos sensibles)

**Alcance:** solo ADMIN u OPERADOR con `BENEFICIARIOS` (sustituye la regla "TUTOR solo ve lo suyo", ADR-0004).

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /api/children` `?page&page_size&search&school_id(id\|none)&tutor_id&gender&consent&is_active&order_by` | `Page<ChildListItem>` (sin teléfonos ni observaciones) | `401`, `403 MODULE_FORBIDDEN`, `422` |
| `GET /api/children/export` (mismos filtros) | `text/csv` sin observaciones; audita `DATA_EXPORTED` | |
| `POST /api/children` `{ first_name, last_name, birth_date, gender?, school_id?, grade?, group_name?, tutor_id?, guardian_name, guardian_relationship?, guardian_phone?, guardian_consent?, notes? }` | `201 { child: ChildOut }` | `409 DUPLICATE_CHILD` + `existing_id` (mismo nombre y fecha de nacimiento), `422` (edad fuera de 0–17, escuela o tutor inexistentes) |
| `GET /api/children/:id` | `{ child }` (incluye `letters: []`, que llena la F4) | `404` |
| `PATCH /api/children/:id` (campos + `is_active`) | `{ child }` | `404`, `409`, `422` |

No hay `DELETE`: la baja es lógica (`is_active: false`). La regla `CHILD_HAS_ACTIVE_LETTERS` se agregará en la Fase 4. Esquemas completos: `fases/Fase_3_Contratos.md` §4.

---

### 3.6 Eventos (vigente — Fase 4, módulo `EVENTOS`; lectura también con `CARTAS`)

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /api/events` `?page&page_size&search&status&event_type&order_by` | `Page<EventListItem>` | `401`, `403`, `422` |
| `POST /api/events` | `201 { event }` (BORRADOR) | `409 DUPLICATE_EVENT` + `existing_id`, `422` |
| `GET` / `PATCH /api/events/:id` | `{ event }` con `stats` | `400 EVENT_FIELD_LOCKED`, `400 EVENT_CLOSED`, `404` |
| `POST /api/events/:id/status` `{ to_status }` | `{ event }` | `400 INVALID_STATUS_TRANSITION`, `403` (regresar sin ser ADMIN) |
| `GET /api/events/:id/volunteers`, `GET …/volunteer-options` | `Page<EventVolunteerOut>`, `{ items }` | |
| `POST /api/events/:id/volunteers` `{ volunteer_ids, area?, status?, notes? }` | `201 { added, skipped }` | `400 EVENT_CLOSED`, `422` |
| `PATCH /api/events/:id/volunteers/:volunteerId` | `{ participation }` | `404`, `422` |

> Diseño original (referencia):

#### 25. `GET /events` — 🔑
Query: `status`, `event_type`. VOLUNTARIO y TUTOR solo ven eventos `ABIERTO` y `EN_CURSO`.
→ lista de `EventOut` (incluye `my_participation` si el usuario es voluntario).

#### 26. `POST /events` — A
```json
{ "name": "Navidad 2026", "event_type": "NAVIDAD", "code_prefix": "NAV26", "event_date": "2026-12-20", "location": "Explanada...", "max_letters_per_sponsor": 3, "description": "..." }
```
`201` → `EventOut`. Errores `409` si `name` o `code_prefix` existen. `code_prefix`: 3–10 caracteres `[A-Z0-9]`.

#### 27. `GET /events/{id}` — 🔑 → `EventOut` (+ contadores para ADMIN).
#### 28. `PATCH /events/{id}` — A
Cambios de `status` permitidos: `BORRADOR→ABIERTO→EN_CURSO→CERRADO` (no hacia atrás, salvo ADMIN con `force`). `code_prefix` no se puede cambiar si ya hay cartas.

#### 29. `POST /events/{id}/apply` — V
Body: `{ "requested_area": "GUIA_NINOS" }` → `201 EventVolunteerOut` (status `POSTULADO`).
Errores: `400 EVENT_NOT_OPEN`, `409 ALREADY_APPLIED`.
#### 30. `DELETE /events/{id}/apply` — V → cambia a `CANCELADO`. `204`.

#### 31. `GET /events/{id}/volunteers` — A
Query: `status`, `requested_area`, `assigned_area`, paginación → `Page[EventVolunteerOut]` con datos del voluntario.

#### 32. `PATCH /events/{id}/volunteers/{user_id}` — A
Body: `{ "status": "CONFIRMADO", "assigned_area": "GUIA_NINOS" }` → `EventVolunteerOut`.

---

### 3.7 Cartas y regalos (vigente — Fase 4, módulo `CARTAS`)

| Método y ruta | Respuesta | Errores principales |
|---|---|---|
| `GET /api/letters` (+ `/summary`, `/export`) | `Page<LetterListItem>` / conteos / CSV auditado | `422` |
| `GET /api/letters/eligible-children`, `/sponsor-options` `?event_id&search` | `{ items }` | `422` sin evento |
| `GET /api/letters/by-code/:code` | `{ letter }` | `404` |
| `POST /api/letters` | `201 { letter }` con código `NAV26-000001` | `400 EVENT_NOT_OPEN`, `400 EVENT_NOT_FOR_LETTERS`, `400 CONSENT_REQUIRED`, `409 LETTER_ALREADY_EXISTS` |
| `GET` / `PATCH /api/letters/:id`, `GET …/history` | `{ letter }`, `{ items }` | `400 LETTER_LOCKED`, `409 LETTER_VERSION_CONFLICT` |
| `POST /api/letters/:id/assign` `{ volunteer_id, version }` | `{ letter }` | `409 LETTER_ALREADY_ASSIGNED`, `400 SPONSOR_LIMIT_REACHED` |
| `POST /api/letters/:id/release`, `POST …/status` `{ to_status, version }` | `{ letter }` | `400 INVALID_STATUS_TRANSITION`, `409 LETTER_STATUS_CHANGED`, `403` |
| `POST` / `GET` / `DELETE /api/letters/:id/photo` | `{ letter }` / imagen | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE` |

El padrino es un **voluntario** (`sponsor_volunteer_id`), no un usuario; con `CARTAS` sin `BENEFICIARIOS` la niña o niño se ve restringido ("Sofía C."). Los endpoints `/letters/available`, `/letters/mine` y `/adopt` del diseño original pasan a la fase de nube.

> Diseño original (referencia):

**Vistas de carta**
- `LetterOut` (A, T): todo, incluido el niño completo y el padrino (`id`, nombre, teléfono, email).
- `LetterPublicOut` (V): `id`, `code`, `child_first_name`, `child_age`, `child_gender`, `child_grade`, `main_wish`, `secondary_wish`, `letter_text`, `has_photo`, `status`, `is_mine` (bool), `event {id,name,event_date}`. **Sin apellidos, escuela, fecha de nacimiento ni datos del tutor.**

#### 33. `GET /letters` — A, T
Query: `event_id` (requerido), `status`, `school_id`, `sponsor_user_id`, `search` (código o nombre del niño), `gender`, `age_min`, `age_max`, paginación.
TUTOR: solo cartas de sus niños.
→ `Page[LetterOut]` (versión resumida).

#### 34. `POST /letters` — A, T
```json
{ "child_id": 45, "event_id": 1, "main_wish": "Bicicleta rodada 16", "secondary_wish": "Libro de dinosaurios", "letter_text": "Querido Santa..." }
```
Validaciones:
- El evento debe ser `NAVIDAD` y estar `ABIERTO` → `400 EVENT_NOT_OPEN`.
- El niño debe tener `guardian_consent = true` → `400 CONSENT_REQUIRED`.
- TUTOR solo para sus niños (404 si no).
- Una carta por niño por evento → `409 LETTER_ALREADY_EXISTS`.
Efectos: genera `code` (`NAV26-000046`, consecutivo por evento), status `PENDIENTE`, inserta historial (`NULL → PENDIENTE`).
`201` → `LetterOut`.

#### 35. `GET /letters/{id}` — A, T, V*
A/T → `LetterOut`. V → `LetterPublicOut` solo si la carta está `PENDIENTE` o él es el padrino; si no, `404`.

#### 36. `PATCH /letters/{id}` — A, T
Editables: `main_wish`, `secondary_wish`, `letter_text`, `gift_notes` (solo A). Si la carta ya no está `PENDIENTE`, TUTOR no puede editar los deseos → `400 LETTER_LOCKED`.

#### 37. `POST /letters/{id}/photo` — A, T
`multipart/form-data`, campo `file`. Tipos: `image/jpeg`, `image/png`, `image/webp`. Máx **5 MB** (`413`). El backend redimensiona a máx 1600 px, elimina metadatos EXIF (ubicación) y guarda con nombre UUID. Reemplaza la foto anterior. → `200 { "has_photo": true }`.

#### 38. `GET /letters/{id}/photo` — A, T, V*
Devuelve la imagen (`image/jpeg`…) con las mismas reglas de acceso que #35. Nunca se sirve desde carpeta pública.

#### 39. `GET /letters/available` — V
Catálogo para padrinos: cartas `PENDIENTE` de eventos `ABIERTO`.
Query: `event_id`, `gender`, `age_min`, `age_max`, `search` (en deseos), paginación (default 12).
→ `Page[LetterPublicOut]`.

#### 40. `GET /letters/mine` — V
Cartas donde `sponsor_user_id = yo`, cualquier estatus. → `Page[LetterPublicOut]` + `limit_info: { "used": 2, "max": 3 }` por evento.

#### 41. `POST /letters/{id}/adopt` — V (y A puede asignar con `sponsor_user_id`)
Body (V): vacío. Body (A): `{ "sponsor_user_id": 33 }`.
Lógica transaccional:
1. `SELECT ... FOR UPDATE` de la carta.
2. Si `status ≠ PENDIENTE` → `409 LETTER_ALREADY_ASSIGNED`.
3. Si el padrino ya llegó a `max_letters_per_sponsor` en ese evento → `400 SPONSOR_LIMIT_REACHED`.
4. `status = ASIGNADO`, `sponsor_user_id`, `assigned_at = now()`, `version += 1`.
5. Insertar historial.
→ `200 LetterPublicOut` (V) / `LetterOut` (A).

#### 42. `POST /letters/{id}/release` — V, A
Libera la carta (`ASIGNADO → PENDIENTE`). V solo si es su padrino y la carta está `ASIGNADO`. Body opcional `{ "comment": "No podré comprarlo" }`. → `200`.
Errores: `400 INVALID_STATUS_TRANSITION` (si ya está `RECIBIDO`).

#### 43. `POST /letters/{id}/status` — A
Cambio de estatus logístico.
```json
{ "to_status": "RECIBIDO", "comment": "Regalo recibido en acopio, bolsa #120", "gift_notes": "Bicicleta roja" }
```
Transiciones válidas (ver máquina de estados en `Modelo_Datos.md` §6):
`ASIGNADO→RECIBIDO`, `RECIBIDO→ENTREGADO`, `RECIBIDO→ASIGNADO` (comentario obligatorio), `ASIGNADO→PENDIENTE` (desasignar).
Cualquier otra → `400 INVALID_STATUS_TRANSITION`. Actualiza `received_at` / `delivered_at`.
→ `LetterOut`.

#### 44. `GET /letters/{id}/history` — A
→ lista de `{ from_status, to_status, changed_by: {id, name}, sponsor: {id, name}|null, comment, created_at }` ordenada cronológicamente.

#### 45. `GET /letters/by-code/{code}` — A
Búsqueda rápida en campo (centro de acopio / día del evento): escribir o escanear `NAV26-000123`. → `LetterOut`. `404` si no existe.

---

### 3.8 Dashboard

#### 46. `GET /dashboard/summary?event_id=1` — 🔑
Respuesta según rol:

**ADMIN**
```json
{
  "event": { "id": 1, "name": "Navidad 2026" },
  "letters": { "total": 420, "PENDIENTE": 120, "ASIGNADO": 200, "RECIBIDO": 80, "ENTREGADO": 20, "assigned_pct": 71.4 },
  "volunteers": { "registered": 310, "applied_to_event": 150, "confirmed": 110 },
  "children": { "total": 450, "without_letter": 30, "without_consent": 12 },
  "schools": 14
}
```
**TUTOR**: `{ "my_children": 35, "letters": { "total": 33, "PENDIENTE": 10, ... }, "without_letter": 2 }`
**VOLUNTARIO**: `{ "my_letters": { "used": 2, "max": 3, "items_by_status": {...} }, "my_events": [...], "available_letters": 120 }`

> El MVP solo necesita estos contadores; las gráficas en tiempo real son Fase 2.

---

## 4. Esquemas principales (Pydantic)

```text
UserOut            { id, email, role, first_name, last_name, phone, is_active, must_change_password, created_at }
VolunteerProfile   { birth_date, address_city, occupation, emergency_contact_name, emergency_contact_phone,
                     emergency_contact_relationship, shirt_size, area_of_interest, medical_notes }
VolunteerOut       UserOut + { profile: VolunteerProfile, events: EventVolunteerOut[] }
TutorProfile       { school: {id, name} | null, position }
SchoolOut          { id, name, cct, zone, address, contact_name, contact_phone, is_active, children_count? }
ChildOut           { id, first_name, last_name, birth_date, age, gender, school, grade, group_name,
                     tutor: {id, name}, guardian_name, guardian_phone, guardian_consent, notes, is_active,
                     letters: [{ id, code, event_id, status }] }
EventOut           { id, name, event_type, code_prefix, event_date, location, status,
                     max_letters_per_sponsor, description, my_participation? }
EventVolunteerOut  { event_id, user: {id, name, email, phone, shirt_size}, requested_area, assigned_area, status }
LetterOut          { id, code, event, child: ChildSummary, main_wish, secondary_wish, letter_text, has_photo,
                     status, sponsor: {id, name, email, phone} | null, assigned_at, received_at,
                     delivered_at, gift_notes, created_at }
LetterPublicOut    ver §3.7
```

`password_hash` **nunca** aparece en ningún esquema de salida.

---

## 5. Requisitos transversales

| Tema | Regla |
|---|---|
| CORS | Solo el origen del frontend (`FRONTEND_ORIGIN` en `.env`). |
| Rate limiting | Login y registro: 5 intentos / 15 min por IP. |
| Rendimiento | Listados < 2 s (PRD §8): paginación obligatoria e índices de `Modelo_Datos.md`. |
| Auditoría | Crear/editar/borrar niños, cambios de estatus de cartas, exportaciones y logins → `audit_logs`. |
| Transacciones | Registro de voluntario, creación de carta y toda transición de estatus son atómicas. |
| Salud | `GET /api/v1/health` → `{ "status": "ok" }` (🌐) para monitoreo. |
