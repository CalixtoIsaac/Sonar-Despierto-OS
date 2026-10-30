# Especificación de API (MVP) — Soñar Despierto

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

### 3.1 Auth

#### 1. `POST /auth/register` — Registro público de voluntario 🌐
Crea `users` (rol `VOLUNTARIO`) + `volunteer_profiles` en una transacción. **No** permite elegir rol.

Body:
```json
{
  "email": "ana@correo.com",
  "password": "Segura123!",
  "first_name": "Ana",
  "last_name": "López Pérez",
  "phone": "2291234567",
  "profile": {
    "birth_date": "2000-05-14",
    "address_city": "Veracruz",
    "occupation": "Estudiante",
    "emergency_contact_name": "María Pérez",
    "emergency_contact_phone": "2297654321",
    "emergency_contact_relationship": "Madre",
    "shirt_size": "M",
    "area_of_interest": "PADRINO",
    "medical_notes": null
  },
  "privacy_consent": true
}
```
Respuesta `201`: `UserOut` (ver §4) + tokens (`access_token`, `refresh_token`).
Errores: `409 EMAIL_ALREADY_EXISTS`, `400 CONSENT_REQUIRED` (si `privacy_consent` ≠ true), `422`.
Validación: contraseña ≥ 8 caracteres con al menos 1 letra y 1 número; teléfono 10 dígitos; email normalizado a minúsculas.

#### 2. `POST /auth/login` 🌐
Body: `{ "email": "...", "password": "..." }`
Respuesta `200`:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": { "id": 1, "email": "...", "role": "ADMIN", "first_name": "...", "last_name": "...", "must_change_password": false }
}
```
Errores: `401 INVALID_CREDENTIALS` (mismo mensaje si el correo no existe o la contraseña es incorrecta), `403 ACCOUNT_DISABLED`, `429 TOO_MANY_REQUESTS` (5 intentos fallidos / 15 min por IP+correo).
Efectos: actualiza `last_login_at`; registra `LOGIN` / `LOGIN_FAILED` en `audit_logs`.

> Opcional: exponer también `POST /auth/token` con `OAuth2PasswordRequestForm` para que el botón "Authorize" de Swagger funcione.

#### 3. `POST /auth/refresh` 🌐
Body: `{ "refresh_token": "..." }` → `200` con nuevo `access_token` (y nuevo `refresh_token`). Error `401 TOKEN_EXPIRED`.

#### 4. `GET /auth/me` 🔑
`200`: `UserOut` + `volunteer_profile` o `tutor_profile` según el rol.

#### 5. `POST /auth/change-password` 🔑
Body: `{ "current_password": "...", "new_password": "..." }` → `204`. Pone `must_change_password = FALSE`.
Error: `400 INVALID_CURRENT_PASSWORD`.

---

### 3.2 Usuarios (gestión por coordinador)

#### 6. `GET /users` — A
Query: `role`, `is_active`, `search` (nombre/correo), paginación. → `Page[UserOut]`.

#### 7. `POST /users` — A
Crea cuentas de **ADMIN** o **TUTOR** (los voluntarios se registran solos, aunque el admin también puede crearlos).
```json
{
  "email": "prof.juan@escuela.mx",
  "role": "TUTOR",
  "first_name": "Juan",
  "last_name": "Martínez",
  "phone": "2291112233",
  "temporary_password": "Temporal2026",
  "tutor_profile": { "school_id": 3, "position": "Profesor 4°B" }
}
```
`201` → `UserOut`. La cuenta queda con `must_change_password = TRUE`.
Errores: `409 EMAIL_ALREADY_EXISTS`, `400 PROFILE_REQUIRED` (TUTOR sin `tutor_profile`), `404` si `school_id` no existe.

#### 8. `GET /users/{id}` — A → `UserOut` con perfil.

#### 9. `PATCH /users/{id}` — A
Campos editables: `first_name`, `last_name`, `phone`, `role`, `is_active`, `tutor_profile`.
Reglas: un admin **no puede** desactivarse a sí mismo ni quitarse el rol ADMIN; debe existir al menos un ADMIN activo (`400 LAST_ADMIN`).

#### 10. `POST /users/{id}/reset-password` — A
Body: `{ "temporary_password": "..." }` → `204`. Activa `must_change_password`.

---

### 3.3 Voluntarios

#### 11. `GET /volunteers/me` — V → `VolunteerOut` (usuario + perfil + eventos a los que se postuló).

#### 12. `PUT /volunteers/me` — V
Body: igual a `profile` de §1 + `first_name`, `last_name`, `phone`. → `200 VolunteerOut`. El email no se cambia aquí.

#### 13. `GET /volunteers` — A
Query: `search`, `area_of_interest`, `shirt_size`, `event_id` (inscritos a un evento), `participation_status`, `is_active`, paginación.
→ `Page[VolunteerListItem]` (`id`, nombre, email, teléfono, área, talla, eventos).

#### 14. `GET /volunteers/{user_id}` — A → `VolunteerOut` completo (incluye contacto de emergencia y `medical_notes`).

#### 15. `GET /volunteers/export` — A
Mismos filtros que #13. Respuesta `text/csv` (`Content-Disposition: attachment`). Se registra `EXPORT` en `audit_logs`.
Uso típico: lista de tallas de playera por evento.

---

### 3.4 Escuelas

#### 16. `GET /schools` — A, T
Query: `search`, `zone`, `is_active`. TUTOR ve todas (solo `id`, `name`, `zone`) para poder seleccionar en formularios.
→ `Page[SchoolOut]` (incluye `children_count` para ADMIN).

#### 17. `POST /schools` — A
```json
{ "name": "Primaria Benito Juárez", "cct": "30EPR0001A", "zone": "Centro", "address": "...", "contact_name": "...", "contact_phone": "..." }
```
`201` → `SchoolOut`. Errores: `409 DUPLICATE_SCHOOL` (cct o nombre+zona).

#### 18. `GET /schools/{id}` — A, T → `SchoolOut`.
#### 19. `PATCH /schools/{id}` — A → `SchoolOut`. Desactivar con `is_active: false`.

---

### 3.5 Niños (datos sensibles)

**Alcance:** ADMIN ve todos. TUTOR ve **solo** niños con `tutor_user_id = su id`. VOLUNTARIO **no tiene acceso** a este módulo.

#### 20. `GET /children` — A, T
Query: `search` (nombre/apellido), `school_id`, `grade`, `has_letter` (bool, para `event_id`), `event_id`, `is_active`, paginación.
→ `Page[ChildListItem]`: `id`, `first_name`, `last_name`, `age`, `gender`, `school {id,name}`, `grade`, `group_name`, `guardian_consent`, `letter_status` (del evento consultado, si aplica).

#### 21. `POST /children` — A, T
```json
{
  "first_name": "Luis",
  "last_name": "Hernández Cruz",
  "birth_date": "2017-03-02",
  "gender": "NINO",
  "school_id": 3,
  "grade": "3° primaria",
  "group_name": "B",
  "guardian_name": "Rosa Cruz",
  "guardian_phone": "2290001122",
  "guardian_consent": true,
  "notes": null,
  "tutor_user_id": 12
}
```
- Si quien crea es TUTOR, `tutor_user_id` se **ignora** y se usa su propio id; `school_id` por defecto = escuela de su perfil.
- Si es ADMIN, `tutor_user_id` es obligatorio y debe ser un usuario TUTOR activo.
- `birth_date`: niño entre 0 y 17 años.
- Duplicado (mismo nombre, apellidos, fecha nac. y escuela) → `409 DUPLICATE_CHILD` con `details.existing_id`.
- `guardian_consent = true` registra `guardian_consent_at = now()`.
`201` → `ChildOut`.

#### 22. `GET /children/{id}` — A, T → `ChildOut` (incluye cartas del niño por evento).
#### 23. `PATCH /children/{id}` — A, T → `ChildOut`. TUTOR no puede cambiar `tutor_user_id`.
#### 24. `DELETE /children/{id}` — A
Borrado lógico (`is_active = false`). Si tiene cartas en `ASIGNADO`/`RECIBIDO` → `400 CHILD_HAS_ACTIVE_LETTERS`. → `204`.

---

### 3.6 Eventos

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

### 3.7 Cartas y regalos

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
