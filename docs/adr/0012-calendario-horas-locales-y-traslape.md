# ADR-0012: Calendario — horas locales, responsable del personal y traslape como aviso

- **Estado:** Aceptado
- **Fecha:** 2026-10-31
- **Decisores:** Equipo de desarrollo (pendiente de validar con la directiva la lista de tipos)
- **Relacionado con:** ADR-0004, ADR-0009, ADR-0010, ADR-0011, `fases/Fase_5_Contratos.md`, `Modelo_Datos.md` §0.4

## Contexto

La Fase 5 agrega el calendario de actividades del equipo (juntas, capacitaciones, acopios y eventos). La hoja de ruta pide vistas mensual y semanal, filtros por tipo y responsable, vínculo opcional a un evento y un **aviso** de traslape cuando el mismo responsable tiene dos actividades a la misma hora. El sistema guarda los instantes en ISO UTC, pero una junta "el martes a las 10:00" es una hora de pared que no debe moverse si cambia la zona del servidor; México no usa horario de verano desde 2022. En el MVP local solo el personal tiene cuenta (ADR-0004) y los voluntarios son registros sin credenciales.

## Decisión

1. **Fecha y horas locales sin conversión:** `activity_date` (`YYYY-MM-DD`) y `start_time` / `end_time` (`HH:MM`, mismo día, `CHECK end_time > start_time`). Las comparaciones de texto ordenan correctamente y son portables a MySQL/PostgreSQL. Las fechas de auditoría siguen en UTC.
2. **Responsable = cuenta del personal** (`responsible_user_id → users`, cuenta aprobada y activa al asignarla); los **voluntarios** se convocan aparte (`activity_volunteers`), sin cuenta.
3. **Traslape como aviso, no bloqueo:** la API responde `409 ACTIVITY_OVERLAP` con la lista de conflictos; reenviar con `allow_overlap: true` guarda y lo registra (`ACTIVITY_OVERLAP_ACCEPTED`). Hay coordinadores que de verdad atienden dos cosas a la vez (p. ej. una llamada durante un acopio); impedirlo empujaría a capturar horarios falsos. Solo cuentan las actividades no canceladas del mismo responsable y el mismo día; los horarios contiguos no chocan.
4. **Revisión atómica:** la búsqueda de traslapes y el guardado corren en una transacción `IMMEDIATE`, igual que las cartas (ADR-0011): dos altas simultáneas no se cuelan.
5. **Bloqueo optimista con `version`** (opcional en `PATCH` y `/status`) para que una pantalla abierta mucho tiempo no pise cambios.
6. **Sin borrado:** las actividades se cancelan con motivo (`cancel_reason`, fuera de la bitácora) y se pueden reprogramar.
7. **Consulta por rango sin paginar** (máx. 92 días y 500 actividades, con `truncated`): las vistas de calendario necesitan el periodo completo, no páginas.
8. **Tipo "Otra"** además de Junta, Capacitación, Acopio y Evento, para no forzar actividades en una categoría equivocada.

## Consecuencias

- ✅ El Gate se cumple: crear, editar, mover (también arrastrando) y filtrar; el traslape se avisa en el formulario, al mover y al reprogramar.
- ✅ Sin dependencias nuevas: el calendario se dibuja con HTML/CSS y arrastrar y soltar nativo del navegador.
- ⚠️ Arrastrar y soltar no funciona con teclado ni en pantallas táctiles; para eso está "Editar o mover" en el detalle.
- ⚠️ Una actividad no puede cruzar la medianoche ni durar varios días; si la directiva lo necesita, se agregará `end_date` con una migración.
- ⚠️ El traslape solo se revisa para el responsable; avisar por voluntario queda como posible mejora.

## Alternativas consideradas

- **Guardar inicio y fin como ISO UTC:** obliga a convertir en cada consulta por día y se rompe si cambia la zona del equipo anfitrión.
- **Bloquear el traslape (`409` sin opción):** contradice la hoja de ruta ("aviso") y la forma real de trabajar del equipo.
- **Biblioteca de calendario (FullCalendar):** dependencia grande y sin CDN permitido (todo se sirve desde `public/`); el MVP necesita tres vistas simples.
