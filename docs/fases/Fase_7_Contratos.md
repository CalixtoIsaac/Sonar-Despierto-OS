# Fase 7 — Dashboard y reportes: contratos y decisiones

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local)
- **Fecha:** 2026-11-05 · **Estado:** Implementado (rama `feat/f7-dashboard-reportes`)
- **Decisiones que aplica:** ADR-0004 (módulo `REPORTES`; datos de menores solo con `BENEFICIARIOS`), ADR-0006 (el estatus de la carta es la fuente de verdad del regalo), ADR-0009 (stack sin frameworks), ADR-0010 (exportaciones auditadas) y **ADR-0014** (indicadores calculados al momento, solo conteos, Excel sin dependencias)
- **Depende de:** Fases 3 y 4 (personas, eventos y cartas); lee también las Fases 5 (actividades) y 6 (inventario)
- **Gate de la hoja de ruta:** las cifras del dashboard coinciden con consultas SQL de control → `test/gate-f7.test.js`

Este documento describe los contratos **tal como quedaron implementados**. No hay migración nueva: todo se calcula de las tablas de las Fases 3–6.

---

## 1. Alcance

| Pieza | Archivos | Módulo | Pantalla |
|---|---|---|---|
| Indicadores por evento (cartas, niñas y niños, voluntarios, escuelas, avance semanal, actividades, inventario) | `services/reports.js`, `routes/reports.js` | `REPORTES` | `#reportes?evento=<id>` (P05 adaptada) |
| Comparativo de eventos | `services/reports.js` | `REPORTES` | tabla al final de `#reportes` |
| Exportación a Excel (.xlsx) | `services/reports-export.js`, `lib/xlsx.js` | `REPORTES` | botón "Exportar a Excel" |
| Avance en Inicio | `public/js/inicio.js` | `REPORTES` | panel "Avance de <evento>" |
| Filtro "sin carta en el evento" | `routes/children.js`, `services/children.js` | `BENEFICIARIOS` | `#ninos?sin_carta=<id>` (enlace de los avisos) |

**Fuera de alcance:** dashboards por rol de voluntario o tutor (P06–P07, fase de nube); reportes programados o por correo; gráficas de histórico de inventario; exportar listados con nombres desde Reportes (siguen en cada módulo, con su permiso y su auditoría).

## 2. Reglas

1. **Solo conteos.** Ninguna respuesta de `/api/reports` ni el Excel llevan nombres, apellidos, teléfonos, deseos ni fotos de niñas, niños o voluntarios. Por eso basta el módulo `REPORTES` (no hace falta `BENEFICIARIOS`). Sí llevan nombres de escuelas, eventos, actividades y artículos (no son datos personales).
2. **Al momento:** cada consulta calcula las cifras de las tablas; no hay tablas de resumen ni caché (`Cache-Control: no-store`). La pantalla se actualiza sola cada 60 s mientras está a la vista y con el botón "Actualizar".
3. **Evento sugerido** (sin `event_id`): el `ABIERTO` o `EN_CURSO` con la fecha más próxima de hoy en adelante; si todos ya pasaron, el abierto más reciente; si no hay abiertos, el de fecha más reciente. Sin eventos → `event: null`.
4. **Definiciones** (las mismas en pantalla, API y Excel):

| Indicador | Definición |
|---|---|
| Cartas registradas | `COUNT(letters)` del evento |
| Ya tienen padrino | estatus `ASIGNADO` + `RECIBIDO` + `ENTREGADO` (`with_sponsor`, `with_sponsor_pct`) |
| Regalos recibidos | `RECIBIDO` + `ENTREGADO` (`received_or_delivered`, `received_pct`) |
| Entregados | `ENTREGADO` (`delivered_pct`) |
| Porcentajes | sobre el total de cartas del evento, un decimal; `null` si no hay cartas |
| Padrinos en el límite | padrinos con `max_letters_per_sponsor` cartas o más en el evento |
| Sin consentimiento | niñas y niños **activos** con `guardian_consent = 0` (no pueden recibir carta) |
| Sin carta (con consentimiento) | activos, con consentimiento y sin carta en el evento (`eligible_without_letter`) |
| Voluntarios confirmados | `event_volunteers.status = 'CONFIRMADO'`; por área y tallas, solo confirmados |
| Por escuela | escuela de la niña o niño de cada carta; "Sin escuela" al final |
| Avance semanal | estatus de las cartas **al cierre de cada semana** (lunes a domingo, hora de Veracruz), reconstruido de `letter_status_history`; máximo las últimas 26 semanas; el último punto es igual a `letters.by_status` |
| Actividades | del calendario con `event_id` del evento; por tipo sin canceladas; las próximas 5 programadas |
| Inventario del evento | por artículo: entradas y salidas con `event_id` del evento, sin traspasos, restando las anulaciones (la anulación copia el `event_id`) |
| Existencia baja | artículos activos con `min_stock > 0` y existencia total menor (igual que `/inventory/summary`) |

5. **Avisos** (`alerts`): solo con cifra > 0 y, salvo existencias bajas, solo en eventos de Navidad: sin consentimiento, sin carta, cartas sin padrino, regalos que no llegan. Cada aviso trae `link: { view, params }`; la pantalla pone el botón "Ver" **solo si la persona tiene el módulo** de ese listado.
6. **Eventos que no son de Navidad** (`accepts_letters: false`): no muestran cartas; sí voluntarios, actividades e inventario. Su Excel no lleva las hojas de cartas.

## 3. API (base `/api/reports`, `requireModule('REPORTES')`)

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /options` | `{ events: EventOption[], default_event_id }` (más reciente primero) | `401`, `403 MODULE_FORBIDDEN` |
| `GET /dashboard?event_id` | `Dashboard` | `422` (`event_id` no numérico), `404` (no existe) |
| `GET /events` | `{ items: EventComparison[] }` | |
| `GET /dashboard/export?event_id` | `.xlsx` (`reporte-<prefijo>-AAAA-MM-DD.xlsx`, `no-store`) | `404` (sin eventos o no existe), `422` |

```jsonc
// EventOption
{ "id": 1, "name": "Navidad 2026", "event_type": "NAVIDAD", "code_prefix": "NAV26", "status": "ABIERTO",
  "event_date": "2026-12-20", "accepts_letters": true }
// Dashboard
{ "generated_at": "…", "today": "2026-11-05",
  "event": { …EventOption, "location": "…", "max_letters_per_sponsor": 3 },
  "letters": { "total": 36, "by_status": { "PENDIENTE": 10, "ASIGNADO": 11, "RECIBIDO": 9, "ENTREGADO": 6 },
               "with_sponsor": 26, "received_or_delivered": 15, "with_sponsor_pct": 72.2, "received_pct": 41.7,
               "delivered_pct": 16.7, "with_photo": 0, "sponsors": 12, "letters_per_sponsor": 2.2,
               "sponsors_at_limit": 2, "max_letters_per_sponsor": 3 },
  "children": { "active": 46, "with_consent": 42, "without_consent": 4, "with_letter": 36, "eligible_without_letter": 6,
                "letters_by_gender": { "NINA": 18, "NINO": 18, "OTRO": 0, "NO_ESPECIFICA": 0 } },
  "volunteers": { "active": 22, "by_status": { "POSTULADO": 4, "CONFIRMADO": 16, "RECHAZADO": 0, "CANCELADO": 0 },
                  "in_event": 20, "confirmed": 16, "confirmed_by_area": { "LOGISTICA": 2, … }, "shirt_sizes": { "XS": 0, … } },
  "schools": { "active": 5, "participating": 5 },
  "by_school": [{ "id": 3, "name": "Primaria Hidalgo", "total": 8, "by_status": { … }, "with_sponsor_pct": 62.5, "delivered_pct": 12.5 }],
  "timeline": [{ "week_start": "2026-11-02", "week_end": "2026-11-08", "total": 36, "by_status": { … } }],
  "activities": { "total": 3, "by_status": { "PROGRAMADA": 3, … }, "by_type": { "JUNTA": 1, … },
                  "upcoming": [{ "id": 4, "title": "Junta de logística", "activity_type": "JUNTA", "activity_date": "2026-11-20", "start_time": "18:00", "end_time": "19:00" }] },
  "inventory": { "items_count": 2, "units_in": 310, "units_out": 76, "low_stock_items": 1,
                 "items": [{ "id": 2, "name": "Silla plegable", "unit": "PIEZA", "category": "Mobiliario", "in": 60, "out": 40, "movements": 2 }] },
  "global": { "events_by_status": { … }, "children_active": 46, "children_without_consent": 4, "volunteers_active": 22,
              "schools_active": 5, "tutors_active": 0 },
  "alerts": [{ "code": "CHILDREN_WITHOUT_LETTER", "count": 6, "text": "6 niñas y niños con consentimiento aún no tienen carta en este evento.",
               "link": { "view": "ninos", "params": { "sin_carta": "1", "consentimiento": "true" } } }] }
// EventComparison
{ …EventOption, "letters_total": 36, "letters_by_status": { … }, "with_sponsor_pct": 72.2, "delivered_pct": 16.7,
  "volunteers_confirmed": 16, "activities": 3 }
```

Códigos de aviso: `CHILDREN_WITHOUT_CONSENT`, `CHILDREN_WITHOUT_LETTER`, `LETTERS_WITHOUT_SPONSOR`, `GIFTS_NOT_RECEIVED`, `LOW_STOCK`.

**Cambio en `/api/children`:** nuevo filtro `without_letter_event_id=<id>` (niñas y niños sin carta en ese evento); también aplica a `/children/export` y queda en los filtros de su bitácora.

## 4. Excel (`lib/xlsx.js`)

Generador propio de Office Open XML (ZIP con deflate de `zlib`, cadenas compartidas, estilos): **sin dependencias nuevas** y sin internet. Solo escribe valores (nunca fórmulas), así que un texto que empieza con `=` queda como texto. Números como números (`#,##0`), porcentajes como fracción con formato `0.0 %`, encabezado fijo y autofiltro en la primera tabla de cada hoja. Probado al leerlo de vuelta (`test/xlsx-reader.js`), con openpyxl y abriéndolo en LibreOffice.

| Hoja | Contenido |
|---|---|
| Resumen | indicadores del evento con su % y totales de la organización |
| Cartas por estatus | estatus, cartas, % y total; cartas por género |
| Por escuela | total, por estatus, % con padrino y % entregado |
| Avance semanal | semana del / al, por estatus y total |
| Voluntarios | confirmados por área, participación por estatus, tallas |
| Actividades | por tipo (sin canceladas) y por estatus |
| Inventario | artículo, categoría, unidad, entradas y salidas del evento |
| Eventos | comparativo de todos los eventos |

Las tres hojas de cartas se omiten en eventos que no son de Navidad.

## 5. Bitácora

| Acción | `entity` / `entity_id` | `detail` |
|---|---|---|
| `DATA_EXPORTED` | `events` / id del evento | `{ format: 'xlsx', report: 'dashboard', sheets, count }` (count = cartas del evento) |

Ver el dashboard no se registra (solo lectura de conteos). La bitácora lo muestra como "Reporte del evento en Excel · 8 hojas · 36 cartas".

## 6. Pantallas

- **Reportes (`#reportes?evento=<id>`, P05 adaptada):** selector de evento con estatus, tipo, fecha, lugar y hora de actualización; botones **Actualizar** y **Exportar a Excel**; **Pendientes** (avisos con botón "Ver" si hay permiso); indicadores (cartas, anillos de % con padrino / recibidos / entregados, voluntarios confirmados, sin carta, sin consentimiento); barra segmentada de **cartas por estatus** con leyenda y %; **avance semanal** en columnas apiladas (en el celular se desplaza y muestra la semana más reciente); **por escuela** en barras apiladas (8 visibles y "Ver las N restantes"); **voluntarios** por área, por estatus y tallas; **actividades y logística** por tipo, próximas actividades e inventario usado; **comparativo de eventos** (con 2 eventos o más). Sin eventos: estado vacío con enlace a Eventos si hay permiso.
- **Gráficas:** HTML y CSS (sin bibliotecas), con los tokens del tema claro y oscuro; cada barra o columna tiene texto visible o para lector de pantalla (el color nunca es la única señal).
- **Inicio:** con `REPORTES`, panel "Avance de <evento sugerido>" con % con padrino, regalos entregados y la barra por estatus.
- **Niñas y niños:** con `?sin_carta=<id>` muestra el aviso "Solo niñas y niños sin carta en <evento>" con "Quitar filtro".

## 7. Verificación

```powershell
npm test               # incluye test/gate-f7.test.js, test/reports.test.js y test/xlsx.test.js
npm run empaquetar     # la prueba de humo agrega: dashboard = Cartas, avance semanal, Excel válido y exportación en bitácora
```

**Gate (`test/gate-f7.test.js`):** un escenario con dos eventos, tres escuelas, niñas y niños con y sin consentimiento (y uno dado de baja), cartas en los cuatro estatus (incluida una liberada), voluntarios postulados, confirmados y cancelados, actividades ligadas (una cancelada) e inventario con traspaso y anulación. Cada cifra de la API y del Excel se compara con una consulta SQL escrita aparte; además se cruzan con `/letters/summary`, el detalle del evento y `/inventory/summary`.

**Guion de demostración (6 min):** como Laura (solo Reportes) → Inicio con el avance de Navidad 2026 → Reportes: Pendientes sin botón "Ver" (no tiene Niños ni Cartas) → cambiar de evento → Exportar a Excel y abrirlo → como ADMIN: el mismo dashboard con "Ver" → "6 niñas y niños sin carta" abre Niños ya filtrado → registrar una carta → Actualizar: las cifras cambian → Bitácora › Exportaciones muestra el Excel → vista a 360 px en tema oscuro.

## 8. Pendientes para la directiva

- ¿Qué indicadores quieren en el informe para donantes o el consejo? (el Excel se puede ajustar sin cambiar la API).
- ¿Hace falta un reporte de regalos de cartas dentro del Inventario? (ADR-0006 §3; hoy se ven en Reportes por estatus de carta).
- ¿Quién debe tener el módulo Reportes? (ve conteos de todos los módulos, sin datos personales).
