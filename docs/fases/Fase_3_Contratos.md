# Fase 3 — Personas: contratos y decisiones

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local)
- **Fecha:** 2026-10-29 · **Estado:** Implementado (rama `feat/f3-personas`)
- **Decisiones que aplica:** ADR-0004 (personas como registros sin cuenta; datos de menores tras el módulo `BENEFICIARIOS`), ADR-0009 (stack) y **ADR-0010** (duplicados, auditoría y consentimiento de personas)
- **Depende de:** Fase 2 (gestión de usuarios, paginación compartida, bitácora)
- **Gate de la hoja de ruta:** duplicado → `409`; exportación registrada en bitácora; datos de niños solo con `BENEFICIARIOS` → `test/gate-f3.test.js`

> A diferencia de las Fases 1 y 2, esta fase no tuvo un documento de prompts previo: este archivo describe los contratos **tal como quedaron implementados** y es la fuente de verdad para la Fase 4 (eventos y cartas), que se apoya en `children`, `volunteers` y `schools`.

---

## 1. Alcance

| Entidad | Tabla | Módulo | Pantallas |
|---|---|---|---|
| Escuelas o comunidades | `schools` | `BENEFICIARIOS` | `#escuelas` (P11): listado + diálogo de alta/edición |
| Tutores responsables (profesora, director, líder comunitario) | `tutors` | `BENEFICIARIOS` | `#tutores`: listado + diálogo |
| Niñas y niños beneficiarios | `children` | `BENEFICIARIOS` | `#ninos` (P12), `#nino-form[/id]` (P13), `#nino/<id>` (P14) |
| Voluntarios | `volunteers` | `VOLUNTARIOS` | `#voluntarios` (P08), `#voluntario-form[/id]`, `#voluntario/<id>` (P09) |

**Fuera de alcance (TODO para fases siguientes):** participación de voluntarios en eventos y cartas por niño (F4: los campos `events` y `letters` de las respuestas se entregan vacíos); importación masiva CSV/Excel; registro público por enlace (fase de nube); borrado físico (solo hay baja lógica).

## 2. Modelo de datos — migración 3

Archivo: `lib/migrations.js`. Reglas de portabilidad de siempre (enums `TEXT` + `CHECK`, fechas ISO, booleanos `0/1`).

**Columnas normalizadas** (las calcula `lib/text.js → normalizeKey`, sin acentos y en minúsculas, para que la búsqueda y la detección de duplicados no dependan de funciones de cada motor):

- `name_key` = `"nombre apellidos"` normalizado → búsqueda por palabras y duplicados.
- `sort_key` = `"apellidos nombre"` normalizado → orden alfabético correcto con acentos.
- `zone_key` (escuelas) = zona normalizada.

| Tabla | Columnas principales | Restricciones e índices |
|---|---|---|
| `schools` | `name`, `cct` (mayúsculas), `zone`, `address`, `contact_name`, `contact_phone`, `is_active`, `created_by_id` | `UNIQUE(cct)`, `UNIQUE(name_key, zone_key)` |
| `tutors` | `first_name`, `last_name`, `phone` (obligatorio), `email`, `position`, `school_id → schools` (`RESTRICT`, opcional), `notes`, `is_active` | índice `(name_key, phone)`, `(school_id)` |
| `volunteers` | nombre, `email` (único, opcional), `phone`, `birth_date`, `city`, `occupation`, `emergency_contact_name/phone/relationship`, `shirt_size` (`XS…XXL`), `area_of_interest` (8 áreas), `medical_notes`, `notes`, `privacy_consent_at` (obligatorio), `is_active` | `UNIQUE(email)`, índice `(name_key, phone)`, `(sort_key)` |
| `children` | nombre, `birth_date` (obligatoria), `gender` (`NINA, NINO, OTRO, NO_ESPECIFICA`), `school_id`, `grade`, `group_name`, `tutor_id → tutors`, `guardian_name` (obligatorio), `guardian_relationship`, `guardian_phone`, `guardian_consent` + `guardian_consent_at`, `notes`, `is_active` | índice `(name_key, birth_date)`, `(sort_key)`, `(school_id)`, `(tutor_id)` |

Todas tienen `created_by_id → users (ON DELETE SET NULL)`, `created_at` y `updated_at`.

**Catálogos:** `lib/catalogs.js` (espejo `public/js/catalogos.js`, verificado por prueba). Áreas: Logística, Guía de niñas y niños, Acopio de regalos, Registro, Alimentos, Fotografía, Padrino o madrina, Otra.

## 3. Reglas de negocio

1. **Duplicados → `409`** con el id del registro existente en el cuerpo: `{ "error", "code", "existing_id" }`.

   | Entidad | Se considera duplicado | `code` | Mensaje |
   |---|---|---|---|
   | Escuela | misma CCT, **o** mismo nombre en la misma zona | `DUPLICATE_SCHOOL` | Ya existe una escuela con esa CCT. / …con ese nombre en esa zona. |
   | Tutor | mismo nombre completo y mismo teléfono | `DUPLICATE_TUTOR` | Ya existe un tutor con ese nombre y teléfono. |
   | Voluntario | mismo correo, **o** mismo nombre completo y teléfono | `DUPLICATE_VOLUNTEER` | Ya existe un voluntario con ese correo. / …con ese nombre y teléfono. |
   | Niña o niño | mismo nombre completo y **misma fecha de nacimiento** (aunque cambie o falte la escuela) | `DUPLICATE_CHILD` | Ya existe una niña o niño registrado con ese nombre y fecha de nacimiento. |

   "Mismo nombre" = igual sin acentos, mayúsculas ni espacios extra. También aplica al **editar**.
2. **Edades:** niñas y niños de 0 a 17 años (fecha futura o 18+ → `422`); voluntarios con fecha de nacimiento opcional, pero de 15 años o más.
3. **Consentimiento:** el registro se permite sin la autorización firmada del padre, madre o tutor legal (se marca "Sin consentimiento" en pantalla); al marcarla se guarda `guardian_consent_at` y al quitarla se borra. **La Fase 4 lo exigirá para crear cartas.**
4. **Aviso de privacidad del voluntario:** el alta exige `accepts_privacy: true` (el personal confirma que la persona lo aceptó) y guarda `privacy_consent_at`.
5. **Referencias:** `school_id` / `tutor_id` inexistentes → `422` "La escuela no existe." / "El tutor no existe."; dados de baja → `422` "…está dada(o) de baja." (salvo que ya estuviera asignado).
6. **Baja lógica:** `PATCH { "is_active": false }`; nada se borra. Una escuela o tutor dados de baja ya no aparecen para nuevos registros.
7. **Permisos:** `/api/volunteers` con `requireModule('VOLUNTARIOS')`; `/api/schools`, `/api/tutors` y `/api/children` con `requireModule('BENEFICIARIOS')`. Se leen de la BD en cada petición (quitar el módulo tiene efecto inmediato).

## 4. API (base `/api`)

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /schools` `?page&page_size&search&zone&is_active&order_by` | `Page<SchoolOut>` | `401`, `403 MODULE_FORBIDDEN`, `422` |
| `POST /schools` | `201 { school }` | `409 DUPLICATE_SCHOOL`, `422` |
| `GET` / `PATCH /schools/:id` | `{ school }` | `404 NOT_FOUND`, `409`, `422` |
| `GET /tutors` `?…&school_id&is_active&order_by` | `Page<TutorOut>` | |
| `POST /tutors`, `GET`/`PATCH /tutors/:id` | `{ tutor }` | `409 DUPLICATE_TUTOR`, `404`, `422` |
| `GET /volunteers` `?…&area&shirt_size&is_active&order_by` | `Page<VolunteerListItem>` | |
| `GET /volunteers/summary` (mismos filtros) | `{ total, shirt_sizes: {XS…XXL}, areas: {…} }` | |
| `GET /volunteers/export` (mismos filtros) | `text/csv` | audita `DATA_EXPORTED` |
| `POST /volunteers`, `GET`/`PATCH /volunteers/:id` | `{ volunteer }` | `409 DUPLICATE_VOLUNTEER`, `404`, `422` |
| `GET /children` `?…&school_id(id\|none)&tutor_id&gender&consent&is_active&order_by` | `Page<ChildListItem>` | |
| `GET /children/export` (mismos filtros) | `text/csv` | audita `DATA_EXPORTED` |
| `POST /children`, `GET`/`PATCH /children/:id` | `{ child }` | `409 DUPLICATE_CHILD`, `404`, `422` |

`order_by` ∈ `name` (por apellidos, default), `-name`, `created_at`, `-created_at` (+ `birth_date`, `-birth_date` en niños). `search` busca **cada palabra** sin acentos (niños: nombre; voluntarios: nombre, correo, teléfono; tutores: nombre, teléfono, correo; escuelas: nombre, CCT, zona). Cualquier campo desconocido en el cuerpo → `422 "Campo no permitido."`; `PATCH {}` → `422`.

**Esquemas** (JSON `snake_case`):

```jsonc
// SchoolOut
{ "id": 3, "name": "Primaria Benito Juárez", "cct": "30EPR0001A", "zone": "Centro", "address": "…",
  "contact_name": "Mtra. Rosa", "contact_phone": "2290001122", "is_active": true,
  "children_count": 42, "tutors_count": 3, "created_at": "…", "updated_at": "…" }

// TutorOut
{ "id": 5, "first_name": "Carmen", "last_name": "Ruiz", "full_name": "Carmen Ruiz", "phone": "2295551234",
  "email": null, "position": "Profesora de 3°A", "school": { "id": 3, "name": "…", "zone": "Centro" } | null,
  "notes": null, "is_active": true, "children_count": 18, "created_at": "…", "updated_at": "…" }

// VolunteerListItem
{ "id": 9, "first_name": "Luis", "last_name": "Hernández", "full_name": "…", "email": "…" | null, "phone": "…",
  "city": "Veracruz", "shirt_size": "M", "area_of_interest": "LOGISTICA", "is_active": true, "created_at": "…" }
// VolunteerOut = VolunteerListItem + birth_date, age, occupation, emergency_contact_name/phone/relationship,
//   medical_notes, notes, privacy_consent_at, created_by: UserRef | null, updated_at, events: []  (F4)
// VolunteerCreate: los campos editables + "accepts_privacy": true

// ChildListItem (sin teléfonos ni observaciones)
{ "id": 12, "first_name": "Sofía", "last_name": "Cruz Pérez", "full_name": "…", "birth_date": "2017-03-02", "age": 9,
  "gender": "NINA", "school": { "id": 3, "name": "…", "zone": "…" } | null, "grade": "3° primaria", "group_name": "A",
  "tutor": { "id": 5, "full_name": "…", "phone": "…" } | null, "guardian_consent": true, "is_active": true }
// ChildOut = ChildListItem + guardian_name, guardian_relationship, guardian_phone, guardian_consent_at, notes,
//   letters: [] (F4), created_by: UserRef | null, created_at, updated_at
```

**Exportación CSV:** UTF-8 **con BOM**, separador coma, fin de línea CRLF (abre bien en Excel en español), nombre `voluntarios-AAAA-MM-DD.csv` / `ninos-AAAA-MM-DD.csv`, `Cache-Control: no-store`, máximo 10 000 filas, con los mismos filtros del listado. No incluye notas médicas ni observaciones. Los valores que empiezan con `= + - @` se anteponen con `'` (protección contra fórmulas).

## 5. Bitácora

Se agregan al catálogo (`lib/audit-actions.js` y `public/js/audit.js`) acciones **genéricas** con `entity` ∈ `volunteers | schools | tutors | children`:

| Acción | Etiqueta | `detail` |
|---|---|---|
| `RECORD_CREATED` | Registro creado | `null` |
| `RECORD_UPDATED` | Registro modificado | `{ "changed": ["phone", "school_id"] }` (solo nombres de campos) |
| `RECORD_DEACTIVATED` / `RECORD_ACTIVATED` | Registro dado de baja / reactivado | `null` |
| `DATA_EXPORTED` | Exportación de datos | `{ "format": "csv", "count": 42, "filters": { "school_id": 3, "search": true } }` (el texto buscado **no** se guarda) |

**Nunca** se guardan nombres, fechas de nacimiento, teléfonos ni observaciones de niñas y niños en la bitácora. En el visor, "Sobre" enlaza a la ficha (`#nino/12`, `#voluntario/9`) o abre el diálogo (`#escuelas?ver=3`); las fichas tienen "Ver su historial en la bitácora" (solo ADMIN), que usa `#bitacora?objeto=<id>&entidad=<tabla>`.

## 6. Pantallas

- Componente reutilizable `public/js/listado.js` (`Listado.mount`): filtros en la URL, tabla ≥ 768 px y tarjetas en móvil, paginación, estados de carga/vacío/error, `formDialog`, `duplicateNotice` (aviso 409 con "Ver registro existente"), `exportCsv` y `schoolOptions`.
- **Niñas y niños:** filtros por escuela (incluye "Sin escuela"), tutor, consentimiento y estado; insignia "Con / Sin consentimiento" (color + ícono + texto); formulario por secciones (P13) con edad calculada en vivo, aviso de datos de menores y **"Guardar y registrar otro"**, que conserva escuela, grado, grupo y tutor para capturar un grupo completo.
- **Voluntarios:** filtros por área, talla y estado; panel "Tallas de playera" con los conteos del filtro actual; notas médicas resaltadas en la ficha.
- **Escuelas / Tutores:** acciones "Ver niñas y niños" (filtra `#ninos?escuela=` / `?tutor=`), editar y dar de baja.
- Exportar CSV desde Niños y Voluntarios avisa que la exportación queda en la bitácora.

## 7. Verificación

```powershell
npm test               # incluye test/gate-f3.test.js, children, volunteers y schools-tutors
npm run empaquetar     # la prueba de humo agrega: escuela, niña, duplicado 409, exportación auditada y 403 sin BENEFICIARIOS
```

**Guion de demostración (10 min):** registrar una escuela y un tutor → registrar 2 niñas o niños seguidos con "Guardar y registrar otro" → intentar registrar a la primera otra vez (mayúsculas y sin acentos) → aviso de duplicado con enlace → exportar CSV y verlo en la Bitácora → un operador con solo Voluntarios no ve Niños (menú y `403`) → vista a 360 px en tema oscuro.

## 8. Pendientes para la directiva

- **Aviso de privacidad (LFPDPPP)** definitivo para datos de menores y de voluntarios: el sistema registra la aceptación, pero el texto oficial falta.
- Confirmar la regla de duplicado de niños (nombre + fecha de nacimiento) con quienes capturan en campo.
