# Fase 5 — Calendario de actividades: contratos y decisiones

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local)
- **Fecha:** 2026-10-31 · **Estado:** Implementado (rama `feat/f5-calendario`)
- **Decisiones que aplica:** ADR-0004 (permisos por módulo), ADR-0009 (stack), ADR-0010 (bitácora genérica), ADR-0011 (bloqueo optimista) y **ADR-0012** (calendario: horas locales, responsable del personal y traslape como aviso)
- **Depende de:** Fase 2 (`users` como responsables) y Fase 3 (`volunteers` convocados); usa `events` de la Fase 4 como vínculo opcional
- **Gate de la hoja de ruta:** crear, editar, mover y filtrar actividades; aviso de traslape de horario del mismo responsable → `test/gate-f5.test.js`

Este documento describe los contratos **tal como quedaron implementados** y es la fuente de verdad para la Fase 7 (dashboard y reportes), que podrá leer `activities` y `activity_volunteers`.

---

## 1. Alcance

| Entidad | Tabla | Módulo | Pantallas |
|---|---|---|---|
| Actividades (junta, capacitación, acopio, evento, otra) | `activities` | `CALENDARIO` | `#calendario` (mes, semana, agenda), `#actividad/<id>` |
| Voluntarios convocados a una actividad | `activity_volunteers` | `CALENDARIO` | panel "Voluntarios convocados" de `#actividad/<id>` |

También: **Inicio** muestra "Tus próximas actividades" (14 días, a cargo de la persona) a quien tiene `CALENDARIO`, y el **detalle de evento** muestra sus actividades con "Nueva actividad" (si además tiene `CALENDARIO`).

**Tipos de actividad:** Junta, Capacitación, Acopio, Evento y **Otra** (se agregó "Otra" a los cuatro de la hoja de ruta; pendiente de confirmar con la directiva).

**Fuera de alcance:** actividades repetitivas (cada semana), actividades de varios días, recordatorios por correo o WhatsApp, exportar a Google Calendar/iCal, traslape de voluntarios (solo del responsable), borrado de actividades (se cancelan).

## 2. Modelo de datos — migración 5

| Tabla | Columnas principales | Restricciones e índices |
|---|---|---|
| `activities` | `title`, `title_key` (sin acentos, búsqueda), `description`, `activity_type` (`JUNTA`, `CAPACITACION`, `ACOPIO`, `EVENTO`, `OTRO`), `activity_date` (`YYYY-MM-DD`), `start_time` / `end_time` (`HH:MM`), `location`, `responsible_user_id → users` (`SET NULL`), `event_id → events` (`SET NULL`), `status` (`PROGRAMADA`, `REALIZADA`, `CANCELADA`), `cancel_reason`, `version`, `created_by_id`, fechas | `CHECK (end_time > start_time)`, `CHECK ((status = 'CANCELADA') = (cancel_reason IS NOT NULL))`; índices `(activity_date, start_time)`, `(responsible_user_id, activity_date)`, `(event_id)` |
| `activity_volunteers` | `activity_id → activities` (`CASCADE`), `volunteer_id → volunteers` (`RESTRICT`), `created_by_id`, `created_at` | `UNIQUE(activity_id, volunteer_id)`, índice `(volunteer_id)` |

**Fecha y horas en hora local de Veracruz, sin conversión a UTC** (ADR-0012): son horas "de pared" de un calendario. Las fechas de auditoría (`created_at`, `updated_at`) siguen en ISO UTC como en todo el sistema.

## 3. Reglas de negocio

### 3.1 Alta y edición

1. Obligatorios: `title` (≤ 120), `activity_type`, `activity_date`, `start_time`, `end_time`, `responsible_user_id`. Opcionales: `location` (≤ 255), `description` (≤ 2000), `event_id`.
2. Horas `HH:MM` de 24 h (también acepta `9:05` → `09:05`). Fin ≤ inicio → `422` "La hora de fin debe ser posterior a la de inicio." (también en un `PATCH` que solo cambia una de las dos).
3. **Responsable:** cuenta del personal `APROBADA` y activa → si no, `422` en `responsible_user_id`. Una actividad cuyo responsable se desactivó después conserva el vínculo.
4. **Evento:** debe existir (`422`) y no estar `CERRADO` → `400 EVENT_CLOSED` (solo al vincularlo; los vínculos existentes se conservan si el evento cierra).
5. `PATCH` aplica solo lo que cambió, sube `version` y audita `RECORD_UPDATED { changed }`. Sin cambios → `200` sin auditar. No se pueden vaciar los obligatorios (`422`). `PATCH {}` o solo banderas → `422`.
6. **Versión (bloqueo optimista, como ADR-0011):** `version` opcional en `PATCH` y en `/status`; si no coincide → `409 ACTIVITY_VERSION_CONFLICT` con `{ current_status, current_version }`.

### 3.2 Traslape de horario (Gate)

1. Hay traslape si **el mismo responsable** tiene otra actividad **no cancelada** el **mismo día** y `otra.inicio < fin` y `otra.fin > inicio` (horarios contiguos, 10:00–11:00 y 11:00–12:00, **no** se traslapan).
2. Se revisa al **crear**, al **editar fecha, horas o responsable** (mover) y al **reabrir una cancelada**. Si hay traslape → `409 ACTIVITY_OVERLAP`:
   ```jsonc
   { "error": "Ana López ya tiene otra actividad en ese horario. Revisa el horario o guarda de todos modos.",
     "code": "ACTIVITY_OVERLAP",
     "conflicts": [{ "id": 3, "title": "Junta de logística", "activity_type": "JUNTA", "activity_date": "2026-11-10",
                     "start_time": "10:00", "end_time": "11:00", "status": "PROGRAMADA" }] }
   ```
3. Es un **aviso**, no un bloqueo: reenviar con `"allow_overlap": true` guarda y deja `ACTIVITY_OVERLAP_ACCEPTED { with: [ids] }` en la bitácora.
4. La revisión y el guardado corren en una transacción `IMMEDIATE`: dos altas simultáneas en el mismo horario → una `201` y otra `409`.
5. El listado marca cada actividad con `has_overlap` y el detalle trae `overlaps` (las actividades con las que choca), para pintar el aviso.

### 3.3 Estatus

```text
            REALIZADA
           ▲    │ (volver a programada)
           │    ▼
        PROGRAMADA ──── cancelar (motivo 5–500) ───► CANCELADA
           ▲                                            │
           └──────────── reprogramar (revisa traslape) ─┘
```

- `POST /activities/:id/status { to_status, reason?, version?, allow_overlap? }`. Otra transición → `400 INVALID_STATUS_TRANSITION`.
- Cancelar exige `reason` → `422`. El motivo se guarda en `cancel_reason` (no en la bitácora) y se borra al reprogramar.
- Una actividad `CANCELADA` no se edita ni cambia sus voluntarios → `400 ACTIVITY_CANCELLED`. Las canceladas no cuentan para el traslape.
- **No hay borrado**: se cancela.

### 3.4 Voluntarios convocados

`POST /activities/:id/volunteers { volunteer_ids }` (1–200; los que ya estaban van en `skipped`; inexistente o dado de baja → `422`) y `DELETE /activities/:id/volunteers/:volunteerId` (`404` si no estaba). El personal con `CALENDARIO` ve nombre, teléfono y área del voluntario (para coordinarse), sin necesitar el módulo `VOLUNTARIOS`.

### 3.5 Permisos

`/api/activities` con `requireModule('CALENDARIO')` (leído de la BD en cada petición). El selector de responsables y de eventos sale de la propia API del calendario, así que no exige otros módulos.

## 4. API (base `/api`)

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /activities?date_from&date_to&activity_type&responsible_id&event_id&volunteer_id&status&search` | `{ items: ActivityListItem[], truncated }` (orden fecha, inicio, id; máx. 500) | `422` (rango obligatorio salvo con `event_id`; ≤ 92 días; `date_to < date_from`; valores inválidos) |
| `GET /activities/overlaps?activity_date&start_time&end_time&responsible_id&exclude_id` | `{ items: ActivityRef[] }` (vista previa del formulario) | `422` |
| `GET /activities/responsible-options` | `{ items: [{ id, full_name }] }` (cuentas aprobadas y activas) | |
| `GET /activities/event-options` | `{ items: [{ id, name, event_date, status, event_type }] }` (cerrados al final) | |
| `POST /activities` | `201 { activity }` | `409 ACTIVITY_OVERLAP`, `400 EVENT_CLOSED`, `422` |
| `GET /activities/:id` | `{ activity }` | `404` |
| `PATCH /activities/:id` (campos + `version?`, `allow_overlap?`) | `{ activity }` | `409 ACTIVITY_OVERLAP`, `409 ACTIVITY_VERSION_CONFLICT`, `400 ACTIVITY_CANCELLED`, `400 EVENT_CLOSED`, `422` |
| `POST /activities/:id/status` | `{ activity }` | `400 INVALID_STATUS_TRANSITION`, `409 ACTIVITY_OVERLAP`, `409 ACTIVITY_VERSION_CONFLICT`, `422` |
| `GET /activities/:id/volunteer-options?search` | `{ items }` (activos no convocados; máx. 20) | |
| `POST /activities/:id/volunteers` | `201 { added, skipped }` | `400 ACTIVITY_CANCELLED`, `422` |
| `DELETE /activities/:id/volunteers/:volunteerId` | `204` | `404`, `400 ACTIVITY_CANCELLED` |

Filtros: `activity_type` y `status` se pueden repetir (`?activity_type=JUNTA&activity_type=ACOPIO`); `responsible_id` acepta un id o `me`; `search` busca cada palabra en el título (sin acentos) y el lugar.

```jsonc
// ActivityListItem
{ "id": 4, "title": "Junta con escuelas", "activity_type": "JUNTA", "activity_date": "2026-11-04",
  "start_time": "10:00", "end_time": "11:00", "location": "Oficina", "status": "PROGRAMADA",
  "responsible": { "id": 1, "full_name": "Isaac Galeana" } | null,
  "event": { "id": 1, "name": "Navidad 2026", "status": "ABIERTO", "event_date": "2026-12-20", "event_type": "NAVIDAD" } | null,
  "volunteers_count": 0, "has_overlap": true, "version": 1 }
// ActivityOut = ActivityListItem + description, cancel_reason,
//   volunteers: [{ id, full_name, phone, area_of_interest, is_active }], overlaps: ActivityRef[],
//   created_by: UserRef | null, created_at, updated_at
// ActivityRef = { id, title, activity_type, activity_date, start_time, end_time, status }
```

## 5. Bitácora

| Acción | `entity` | `detail` |
|---|---|---|
| `RECORD_CREATED` / `RECORD_UPDATED` | `activities` | `null` / `{ changed: [campos] }` |
| `ACTIVITY_STATUS_CHANGED` — Cambio de estatus de actividad | `activities` | `{ from, to }` |
| `ACTIVITY_VOLUNTEERS_ADDED` — Voluntarios agregados a la actividad | `activities` | `{ volunteer_ids, count }` |
| `ACTIVITY_VOLUNTEER_REMOVED` — Voluntario quitado de la actividad | `activities` | `{ volunteer_id }` |
| `ACTIVITY_OVERLAP_ACCEPTED` — Actividad guardada con traslape de horario | `activities` | `{ with: [ids] }` |

No se guardan títulos, descripciones ni motivos de cancelación: solo ids, estatus y nombres de campos.

## 6. Pantallas

- **Calendario (`#calendario`):** barra con Hoy · ‹ › · título del periodo y selector **Mes | Semana | Agenda**; filtros por tipo, responsable ("Mis actividades"), evento, búsqueda y "Mostrar canceladas"; leyenda de colores (cada tipo con color **+ ícono + texto**). Parámetros: `vista`, `fecha`, `tipo`, `resp`, `evento`, `q`, `canceladas`, `dia`.
  - **Mes:** cuadrícula lunes–domingo de 6 semanas; hasta 3 actividades por día y "+N más" (abre la semana). Clic en el número del día → nueva actividad ese día. **Arrastrar** una actividad a otro día la mueve (conserva el horario). En el celular: puntos de color por día y la lista del día elegido debajo.
  - **Semana:** rejilla por horas (7:00–21:00, se amplía si hace falta); las actividades que se cruzan quedan lado a lado; clic en un hueco → nueva actividad a esa hora; **arrastrar** cambia de día y de hora (en pasos de 15 min). En el celular se muestra como agenda de la semana.
  - **Agenda:** lista del mes agrupada por día.
  - Si se mueve hacia un horario ocupado, aparece "Traslape de horario" con las actividades con las que choca y "Mover de todos modos".
- **Formulario (diálogo):** título, tipo, fecha, inicio y fin (al cambiar el inicio, el fin conserva la duración), responsable (por defecto, la persona), evento, lugar y descripción. **Aviso de traslape en vivo** mientras se llena, con "Guardar de todos modos".
- **Detalle (`#actividad/<id>`):** tipo, estatus y aviso de traslape; acciones **Editar o mover · Cancelar (con motivo) · Marcar realizada · Reprogramar**; voluntarios convocados (convocar varios, quitar); enlace a la bitácora (ADMIN).
- **Inicio:** "Tus próximas actividades". **Detalle de evento:** "Actividades del evento".

## 7. Verificación

```powershell
npm test               # incluye test/gate-f5.test.js y test/activities.test.js
npm run empaquetar     # la prueba de humo agrega: alta, traslape → 409, guardar de todos modos, mover y filtrar
```

**Guion de demostración (8 min):** como Ana (solo Calendario) → Inicio muestra sus próximas actividades → `#calendario` → "Nueva actividad": Junta de logística, mañana 10:00–11:00 → otra a las 10:30 con ella como responsable: aparece el aviso de traslape → "Guardar de todos modos" (ambas se marcan ⚠) → arrastrar una al día siguiente → vista Semana: arrastrar a las 16:00 → filtrar por tipo Acopio y por "Mis actividades" → abrir una actividad → convocar 2 voluntarios → Cancelar con motivo → "Mostrar canceladas" → Reprogramar → como ADMIN, ver todo en la Bitácora → vista a 360 px en tema oscuro.

## 8. Pendientes para la directiva

- Confirmar la lista de tipos (se agregó **Otra** a Junta, Capacitación, Acopio y Evento).
- Confirmar si el traslape también debe avisarse para los **voluntarios** convocados (hoy solo para el responsable).
- ¿Hacen falta actividades repetitivas (p. ej. "junta cada lunes") o de varios días? Quedan fuera del MVP.
