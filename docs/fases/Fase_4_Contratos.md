# Fase 4 — Eventos y cartas de Navidad: contratos y decisiones

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local)
- **Fecha:** 2026-10-30 · **Estado:** Implementado (rama `feat/f4-eventos-cartas`)
- **Decisiones que aplica:** ADR-0004 (padrino = voluntario registrado; permisos por módulo), ADR-0006 (el estatus de la carta es la única fuente de verdad del regalo), ADR-0009 (stack), ADR-0010 (bitácora genérica, consentimiento) y **ADR-0011** (eventos, cartas, concurrencia y fotos)
- **Depende de:** Fase 3 (`children`, `volunteers`, `schools`)
- **Gate de la hoja de ruta:** dos asignaciones simultáneas de la misma carta → una recibe `409`; historial completo de cada carta → `test/gate-f4.test.js`

Este documento describe los contratos **tal como quedaron implementados** y es la fuente de verdad para la Fase 7 (dashboard y reportes), que leerá `events`, `event_volunteers` y `letters`.

---

## 1. Alcance

| Entidad | Tabla | Módulo | Pantallas |
|---|---|---|---|
| Eventos (macro-eventos: Navidad, Día del Niño, otros) | `events` | `EVENTOS` (lectura también con `CARTAS`) | `#eventos` (P22), `#evento/<id>` (P23) |
| Voluntarios asignados a un evento | `event_volunteers` | `EVENTOS` | pestaña "Voluntarios" de `#evento/<id>` |
| Cartas de Navidad | `letters` | `CARTAS` | `#cartas` (P15), `#carta-form[/id]` (P16), `#carta/<id>` (P17) |
| Historial de estatus (solo inserción) | `letter_status_history` | `CARTAS` | línea de tiempo en `#carta/<id>` |
| Búsqueda por código | — | `CARTAS` | `#buscar` (P18) |

También se completan los `TODO(F4)` de la F3: `ChildOut.letters` (cartas por evento en la ficha de la niña o niño) y `VolunteerOut.events` + `VolunteerOut.sponsored_letters` (participación y cartas apadrinadas en la ficha del voluntario).

**Fuera de alcance:** catálogo de cartas y adopción por el propio padrino (fase de nube, P19–P21, P24); guías por niño y check-in (ideas futuras); impresión de etiquetas con código de barras; borrado de cartas (no hay borrado físico: ver §3.9).

## 2. Modelo de datos — migración 4

Archivo `lib/migrations.js`. Mismas reglas de portabilidad (enums `TEXT` + `CHECK`, fechas ISO, booleanos `0/1`).

| Tabla | Columnas principales | Restricciones e índices |
|---|---|---|
| `events` | `name`, `name_key`, `event_type` (`NAVIDAD`, `DIA_DEL_NINO`, `OTRO`), `code_prefix` (3–10 `[A-Z0-9]`), `event_date`, `location`, `description`, `status` (`BORRADOR`, `ABIERTO`, `EN_CURSO`, `CERRADO`), `max_letters_per_sponsor` (1–20, default 3), `next_letter_number` (consecutivo de códigos), `created_by_id`, fechas | `UNIQUE(name_key)`, `UNIQUE(code_prefix)`, índice `(status, event_date)` |
| `event_volunteers` | `event_id → events` (`CASCADE`), `volunteer_id → volunteers` (`RESTRICT`), `area` (8 áreas de voluntario), `status` (`POSTULADO`, `CONFIRMADO`, `RECHAZADO`, `CANCELADO`), `notes`, `created_by_id`, fechas | `UNIQUE(event_id, volunteer_id)`, índices `(event_id, status)`, `(volunteer_id)` |
| `letters` | `code` (`NAV26-000123`), `number`, `event_id → events` (`RESTRICT`), `child_id → children` (`RESTRICT`), `main_wish`, `secondary_wish`, `letter_text`, `gift_notes`, `photo_path`, `photo_uploaded_at`, `status` (`PENDIENTE`, `ASIGNADO`, `RECIBIDO`, `ENTREGADO`), `sponsor_volunteer_id → volunteers` (`RESTRICT`), `assigned_at`, `received_at`, `delivered_at`, `version`, `created_by_id`, fechas | `UNIQUE(code)`, `UNIQUE(child_id, event_id)`, `UNIQUE(event_id, number)`, `CHECK` padrino ⇔ estatus ≠ `PENDIENTE`; índices `(event_id, status)`, `(sponsor_volunteer_id)`, `(child_id)` |
| `letter_status_history` | `letter_id → letters` (`CASCADE`), `from_status` (`NULL` al crear), `to_status`, `changed_by_id → users` (`SET NULL`), `sponsor_volunteer_id` (copia del momento), `comment`, `created_at` | índice `(letter_id, id)`; **disparador** que rechaza cualquier `UPDATE` (solo inserción) |

`letters.code` = `{code_prefix}-{number con 6 dígitos}`. El número sale de `events.next_letter_number` dentro de la misma transacción del alta, así que es consecutivo por evento y nunca se reutiliza.

## 3. Reglas de negocio

### 3.1 Eventos

1. **Duplicado → `409 DUPLICATE_EVENT`** con `existing_id`: mismo nombre (sin acentos ni mayúsculas) o mismo prefijo.
2. `code_prefix` se guarda en mayúsculas; debe tener de 3 a 10 letras o números (`422`).
3. Con cartas registradas, `code_prefix` y `event_type` ya no cambian → `400 EVENT_FIELD_LOCKED`.
4. **Estatus:** `BORRADOR → ABIERTO → EN_CURSO → CERRADO` con `POST /events/:id/status`. Avanzar (uno o varios pasos) lo hace quien tenga `EVENTOS`; **regresar** a un estatus anterior solo un ADMIN (`403 FORBIDDEN`) y nunca a `BORRADOR` si ya hay cartas (`400 INVALID_STATUS_TRANSITION`). Mismo estatus → `400 INVALID_STATUS_TRANSITION`.
5. Un evento `CERRADO` es de **solo lectura** para sus datos, voluntarios y cartas → `400 EVENT_CLOSED` (un ADMIN puede reabrirlo).

### 3.2 Voluntarios en el evento

1. Se agregan varios a la vez (`volunteer_ids`, hasta 100). Los que ya estaban se omiten y se informan en `skipped`; un id inexistente o dado de baja → `422`.
2. Área por defecto: su `area_of_interest`; estatus por defecto: `CONFIRMADO`. No se borran: se marcan `CANCELADO` o `RECHAZADO`.
3. El evento muestra las **tallas de playera de los confirmados** (para pedir playeras por evento).

### 3.3 Cartas: alta

1. El evento debe ser de tipo `NAVIDAD` → si no, `400 EVENT_NOT_FOR_LETTERS`; y estar `ABIERTO` o `EN_CURSO` → si no, `400 EVENT_NOT_OPEN`.
2. La niña o niño debe existir (`422`), estar activo (`422`) y **tener el consentimiento del tutor legal** → `400 CONSENT_REQUIRED` (lo que la F3 dejó pendiente).
3. Una carta por niña o niño por evento → `409 LETTER_ALREADY_EXISTS` con `existing_id`.
4. Crea la carta en `PENDIENTE` con su código e inserta el historial `NULL → PENDIENTE` en la misma transacción.

### 3.4 Máquina de estados

```text
                 assign (volunteer_id)           status RECIBIDO              status ENTREGADO
   PENDIENTE  ───────────────────────►  ASIGNADO ───────────────────►  RECIBIDO ───────────────────►  ENTREGADO
      ▲                                  │   ▲                             │
      └────────── release ───────────────┘   └── status ASIGNADO (solo ADMIN, comentario obligatorio) ──┘
```

| Endpoint | Transición | Notas |
|---|---|---|
| `POST /letters/:id/assign` | `PENDIENTE → ASIGNADO` | `volunteer_id` activo; límite `max_letters_per_sponsor` del evento (cuenta `ASIGNADO`, `RECIBIDO`, `ENTREGADO`) → `400 SPONSOR_LIMIT_REACHED`. Guarda `assigned_at` |
| `POST /letters/:id/release` | `ASIGNADO → PENDIENTE` | Quita padrino y `assigned_at` |
| `POST /letters/:id/status` `RECIBIDO` | `ASIGNADO → RECIBIDO` | Regalo recibido en acopio; `gift_notes` opcional. Guarda `received_at` |
| `POST /letters/:id/status` `ENTREGADO` | `RECIBIDO → ENTREGADO` | Entregado a la niña o niño. Guarda `delivered_at`. Estado final |
| `POST /letters/:id/status` `ASIGNADO` | `RECIBIDO → ASIGNADO` | Corrección: solo ADMIN (`403`) y con `comment` (`422`). Borra `received_at` |

Cualquier otra combinación → `400 INVALID_STATUS_TRANSITION`. `PENDIENTE` por `/status` no se permite (se usa `release`).

### 3.5 Concurrencia (Gate)

1. **Bloqueo optimista:** cada carta tiene `version`; toda transición exige la `version` que la persona estaba viendo (`422` si falta). El `UPDATE` incluye `WHERE id = ? AND version = ? AND status = ?` y suma 1 a `version`; si no cambia ninguna fila, la petición pierde:
   - si el estatus ya cambió → `409 LETTER_ALREADY_ASSIGNED` (asignación) o `409 LETTER_STATUS_CHANGED` (resto), con `{ current_status, current_version }`;
   - si solo cambió la versión (otra persona editó) → `409 LETTER_VERSION_CONFLICT`, con los mismos datos.
2. Las transiciones corren en transacciones `IMMEDIATE` (toman el candado de escritura de SQLite antes de leer), así que también son seguras con varias conexiones al mismo archivo.
3. `PATCH /letters/:id` acepta `version` opcional con la misma regla (`409 LETTER_VERSION_CONFLICT`).

### 3.6 Edición

`main_wish`, `secondary_wish` y `letter_text` se editan en `PENDIENTE`; después solo un ADMIN (el padrino ya compró con esa información) → `400 LETTER_LOCKED`. `gift_notes` se edita en cualquier estatus. Evento `CERRADO` → `400 EVENT_CLOSED`.

### 3.7 Datos de la niña o niño dentro de una carta (ADR-0004, Modelo §7)

| Quién | `letter.child` |
|---|---|
| ADMIN u OPERADOR con `BENEFICIARIOS` | Completo: `first_name`, `last_name`, `full_name`, `display_name`, edad, género, grado, grupo, escuela, consentimiento, `restricted: false` |
| OPERADOR con `CARTAS` sin `BENEFICIARIOS` | Restringido: `first_name`, `display_name` ("Sofía C."), edad, género, grado, grupo y nombre de la escuela, `restricted: true`. **Nunca** apellidos, fecha de nacimiento, tutor legal, teléfonos ni observaciones |

`GET /letters/eligible-children` aplica la misma regla, para que el personal de Cartas pueda registrar cartas sin el módulo Beneficiarios.

### 3.8 Fotos de la carta

1. El navegador reduce la foto a **máx. 1600 px** y la vuelve a codificar como JPEG (esto elimina EXIF/ubicación); el servidor además quita los segmentos `APP1` (EXIF/XMP) de cualquier JPEG.
2. `POST /letters/:id/photo` recibe la imagen **cruda** (`Content-Type: image/jpeg | image/png | image/webp`), máximo `MAX_UPLOAD_MB` (5 MB) → `413 FILE_TOO_LARGE`; el tipo se verifica por los bytes iniciales → `415 UNSUPPORTED_MEDIA_TYPE`.
3. Se guarda en `{DATA_DIR}/uploads/letters/<uuid>.<ext>` (fuera de `public/`), reemplaza a la anterior y la anterior se borra. Se sirve solo por `GET /letters/:id/photo` con sesión y `Cache-Control: no-store`.
4. Aviso en pantalla: **"Cubre apellidos y escuela antes de fotografiar"**.

### 3.9 Bajas y trazabilidad

- **No hay borrado de cartas** (trazabilidad del 100 %). Una carta registrada por error se corrige editándola; si la niña o niño ya no participará, la carta se queda en `PENDIENTE` y se documenta en `gift_notes`.
- Dar de baja a una **niña o niño** con cartas sin entregar en eventos no cerrados → `409 CHILD_HAS_ACTIVE_LETTERS`.
- Dar de baja a un **voluntario** que es padrino de cartas `ASIGNADO` o `RECIBIDO` en eventos no cerrados → `409 VOLUNTEER_HAS_ACTIVE_LETTERS`.

### 3.10 Permisos

`/api/events`: lectura (`GET /`, `GET /:id`) con `EVENTOS` **o** `CARTAS` (para el selector de evento de Cartas); todo lo demás con `EVENTOS`. `/api/letters`: `CARTAS`. Se leen de la BD en cada petición.

## 4. API (base `/api`)

### 4.1 Eventos

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /events` `?page&page_size&search&status&event_type&order_by` (`-event_date` default, `event_date`, `name`, `-created_at`) | `Page<EventListItem>` | `401`, `403`, `422` |
| `POST /events` `{ name, event_type, code_prefix, event_date, location?, description?, max_letters_per_sponsor? }` | `201 { event }` (estatus `BORRADOR`) | `409 DUPLICATE_EVENT` + `existing_id`, `422` |
| `GET /events/:id` | `{ event: EventOut }` | `404` |
| `PATCH /events/:id` (mismos campos) | `{ event }` | `400 EVENT_FIELD_LOCKED`, `400 EVENT_CLOSED`, `409`, `422` |
| `POST /events/:id/status` `{ to_status }` | `{ event }` | `400 INVALID_STATUS_TRANSITION`, `403 FORBIDDEN` (regresar sin ser ADMIN) |
| `GET /events/:id/volunteers` `?page&page_size&search&status&area` | `Page<EventVolunteerOut>` | |
| `GET /events/:id/volunteer-options` `?search` | `{ items: VolunteerOption[] }` (activos que aún no están; máx. 20) | |
| `POST /events/:id/volunteers` `{ volunteer_ids: [..], area?, status?, notes? }` | `201 { added, skipped: [ids] }` | `400 EVENT_CLOSED`, `422` |
| `PATCH /events/:id/volunteers/:volunteerId` `{ area?, status?, notes? }` | `{ participation: EventVolunteerOut }` | `404`, `400 EVENT_CLOSED`, `422` |

```jsonc
// EventListItem
{ "id": 1, "name": "Navidad 2026", "event_type": "NAVIDAD", "code_prefix": "NAV26", "event_date": "2026-12-20",
  "location": "Explanada…", "status": "ABIERTO", "max_letters_per_sponsor": 3,
  "letters_count": 120, "volunteers_count": 45, "created_at": "…" }
// EventOut = EventListItem + description, created_by: UserRef | null, updated_at,
//   stats: { letters: { total, PENDIENTE, ASIGNADO, RECIBIDO, ENTREGADO },
//            volunteers: { POSTULADO, CONFIRMADO, RECHAZADO, CANCELADO }, sponsors: 30,
//            shirt_sizes: { XS…XXL }  /* de los CONFIRMADO */ }
// EventVolunteerOut
{ "id": 7, "event_id": 1, "volunteer": { "id": 9, "full_name": "Luis Hernández", "phone": "…", "email": null,
  "shirt_size": "M", "area_of_interest": "LOGISTICA", "is_active": true },
  "area": "GUIA_NINOS", "status": "CONFIRMADO", "notes": null, "created_at": "…", "updated_at": "…" }
```

### 4.2 Cartas

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /letters` `?page&page_size&event_id&status&school_id(id\|none)&sponsor_id&gender&has_photo&search&order_by` (`code` default, `-code`, `child`, `-created_at`, `-updated_at`) | `Page<LetterListItem>` | `401`, `403`, `422` |
| `GET /letters/summary` (mismos filtros, sin `status`) | `{ total, by_status: {…}, by_school: [{ id, name, total }] }` | |
| `GET /letters/export` (mismos filtros) | `text/csv` (`cartas-AAAA-MM-DD.csv`); audita `DATA_EXPORTED` | |
| `GET /letters/eligible-children` `?event_id&search` | `{ items: [{ child, eligible, reason, letter }] }` (máx. 20; `reason` ∈ `CONSENT_REQUIRED`, `HAS_LETTER`) | `422` sin `event_id` |
| `GET /letters/sponsor-options` `?event_id&search` | `{ items: [{ volunteer, letters_in_event, limit }] }` | |
| `GET /letters/by-code/:code` | `{ letter }` — acepta `nav26-123`, `NAV26 000123`, `NAV26000123` | `404 NOT_FOUND` |
| `POST /letters` `{ event_id, child_id, main_wish, secondary_wish?, letter_text?, gift_notes? }` | `201 { letter }` | `400 EVENT_NOT_OPEN`, `400 EVENT_NOT_FOR_LETTERS`, `400 CONSENT_REQUIRED`, `409 LETTER_ALREADY_EXISTS`, `422` |
| `GET /letters/:id` | `{ letter }` | `404` |
| `PATCH /letters/:id` `{ main_wish?, secondary_wish?, letter_text?, gift_notes?, version? }` | `{ letter }` | `400 LETTER_LOCKED`, `400 EVENT_CLOSED`, `409 LETTER_VERSION_CONFLICT` |
| `GET /letters/:id/history` | `{ items: [{ id, from_status, to_status, changed_by: UserRef \| null, sponsor: VolunteerRef \| null, comment, created_at }] }` en orden cronológico | |
| `POST /letters/:id/assign` `{ volunteer_id, version, comment? }` | `{ letter }` | `409 LETTER_ALREADY_ASSIGNED`, `409 LETTER_VERSION_CONFLICT`, `400 SPONSOR_LIMIT_REACHED`, `422` |
| `POST /letters/:id/release` `{ version, comment? }` | `{ letter }` | `400 INVALID_STATUS_TRANSITION`, `409` |
| `POST /letters/:id/status` `{ to_status, version, comment?, gift_notes? }` | `{ letter }` | `400 INVALID_STATUS_TRANSITION`, `403`, `409 LETTER_STATUS_CHANGED`, `422` |
| `POST /letters/:id/photo` (cuerpo = imagen) | `{ letter }` | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `400 EVENT_CLOSED` |
| `GET /letters/:id/photo` | la imagen | `404` si no tiene |
| `DELETE /letters/:id/photo` | `{ letter }` | |

```jsonc
// LetterListItem
{ "id": 33, "code": "NAV26-000033", "event": { "id": 1, "name": "Navidad 2026", "code_prefix": "NAV26", "status": "ABIERTO" },
  "child": { /* §3.7 */ }, "main_wish": "Bicicleta rodada 16", "status": "ASIGNADO",
  "sponsor": { "id": 9, "full_name": "Luis Hernández", "phone": "…", "email": null } | null,
  "has_photo": true, "version": 2, "created_at": "…", "updated_at": "…" }
// LetterOut = LetterListItem + secondary_wish, letter_text, gift_notes, assigned_at, received_at, delivered_at,
//   photo_uploaded_at, created_by: UserRef | null,
//   next_actions: ["release", "receive"]   // lo que la persona puede hacer ahora (assign, release, receive, deliver, revert)
```

Cualquier campo desconocido → `422 "Campo no permitido."`; `PATCH {}` → `422`.

**Exportación CSV** (mismo formato que la F3: UTF-8 con BOM, CRLF, protección de fórmulas, máx. 10 000): código, evento, niña o niño (completo o restringido según §3.7), edad, escuela, grado, deseo principal, deseo secundario, estatus, padrino, teléfono del padrino, fechas de asignación, recepción y entrega, notas del regalo. No incluye la transcripción ni la foto.

## 5. Bitácora

| Acción | `entity` | `detail` |
|---|---|---|
| `RECORD_CREATED` / `RECORD_UPDATED` (genéricas de la F3) | `events`, `letters` | `null` / `{ changed: [campos] }` |
| `EVENT_STATUS_CHANGED` — Cambio de estatus del evento | `events` | `{ from, to }` |
| `EVENT_VOLUNTEERS_ADDED` — Voluntarios agregados al evento | `events` | `{ volunteer_ids: [..], count }` |
| `EVENT_VOLUNTEER_UPDATED` — Participación modificada | `events` | `{ volunteer_id, changed: [..], status }` |
| `LETTER_STATUS_CHANGED` — Cambio de estatus de carta | `letters` | `{ from, to, sponsor_volunteer_id }` |
| `LETTER_PHOTO_UPDATED` / `LETTER_PHOTO_REMOVED` — Foto de carta | `letters` | `null` |
| `DATA_EXPORTED` | `letters` | `{ format, count, filters }` |

La bitácora **no** guarda deseos, nombres ni texto de la carta: solo ids, estatus y nombres de campos. El historial completo de cada carta vive en `letter_status_history` (quién, cuándo, padrino del momento y comentario).

## 6. Pantallas

- **Eventos (P22, `#eventos`):** listado con filtros de estatus y tipo; diálogo de alta/edición (nombre, tipo, prefijo en mayúsculas con vista previa del código `NAV26-000001`, fecha, lugar, límite por padrino, descripción).
- **Detalle de evento (P23, `#evento/<id>`):** datos, botón con el **siguiente estatus** (Abrir → Iniciar → Cerrar, con confirmación), contadores de cartas y voluntarios, tallas de playera de los confirmados, enlace "Ver cartas"; pestaña de voluntarios con "Agregar voluntarios" (buscador con selección múltiple y área), cambio de área y estatus por fila.
- **Cartas (P15, `#cartas`):** selector de evento (por defecto el abierto más reciente), **pestañas por estatus con contador**, filtros (escuela, padrino, con/sin foto, búsqueda por código o nombre), chips de estatus de §1.1 de `Pantallas_UI.md` (color + ícono + texto), exportar CSV.
- **Registrar carta (P16, `#carta-form`):** buscador de niñas y niños elegibles (los que no tienen consentimiento o ya tienen carta aparecen deshabilitados con el motivo), deseos, transcripción, **foto con cámara** (`capture="environment"`), vista previa y aviso de privacidad; al guardar muestra el **código en grande** para escribirlo en la carta física y ofrece "Registrar otra".
- **Detalle de carta (P17, `#carta/<id>`):** código, chip, foto (toca para ampliar), deseos, datos de la niña o niño (según §3.7), padrino con teléfono, **una barra de acciones según el estatus** (Asignar padrino · Liberar · Marcar recibido · Marcar entregado · Corregir), cada acción con diálogo de comentario, y **línea de tiempo** del historial.
- **Búsqueda por código (P18, `#buscar`):** campo grande con autofocus (teclado o lector de código de barras que "escribe" y da Enter), tarjeta con lo esencial y **un solo botón grande con la siguiente acción** (Marcar recibido / Marcar entregado); al terminar, el campo se limpia y vuelve el foco para la siguiente carta.
- Ficha de niña o niño: sección "Cartas de Navidad" con sus cartas y "Registrar carta" (si tiene consentimiento y la persona tiene `CARTAS`). Ficha de voluntario: eventos en los que participa y cartas que apadrina.

## 7. Verificación

```powershell
npm test               # incluye test/gate-f4.test.js, events.test.js, letters.test.js y letters-photo.test.js
npm run empaquetar     # la prueba de humo agrega: evento, carta con código, asignación concurrente (una 409) e historial
```

**Guion de demostración (10 min):** crear "Navidad 2026" (`NAV26`) y abrirlo → agregar 3 voluntarios y ver las tallas → registrar la carta de una niña con consentimiento (código en grande) e intentar con una sin consentimiento → tomar la foto desde el celular → asignar padrino en dos pestañas a la vez (la segunda ve el aviso de conflicto) → en `#buscar` escribir `nav26-1` → Marcar recibido → Marcar entregado → ver la línea de tiempo y la Bitácora → operador con solo Cartas ve "Sofía C." → vista a 360 px en tema oscuro.

## 8. Pendientes para la directiva

- **Pantallas de Lovable de cartas y eventos:** no llegaron; se construyeron con los componentes del sistema (igual que en la F3).
- Confirmar el límite por defecto de **3 cartas por padrino** y si el Día del Niño también tendrá cartas (hoy solo eventos de tipo Navidad).
- Confirmar si se necesita imprimir etiquetas con código de barras para los regalos (el código ya se puede escanear si se imprime en formato Code 128).
