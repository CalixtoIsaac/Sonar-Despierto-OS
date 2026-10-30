# ADR-0010: Personas — detección de duplicados, auditoría genérica y consentimiento

- **Estado:** Aceptado
- **Fecha:** 2026-10-29
- **Decisores:** Equipo de desarrollo (pendiente de validar con la directiva la regla de duplicado de niños)
- **Relacionado con:** ADR-0004, ADR-0009, `fases/Fase_3_Contratos.md`, `Modelo_Datos.md`

## Contexto

La Fase 3 agrega cuatro entidades de personas sin cuenta (escuelas, tutores, voluntarios y niños). El criterio de éxito del PRD pide evitar registros duplicados de niñas y niños; el personal captura en campo, con prisa, y escribe los nombres con y sin acentos. El diseño original (`Modelo_Datos.md` §4.5) proponía `UNIQUE(first_name, last_name, birth_date, school_id)`, que en SQLite y MySQL no aplica cuando la escuela es `NULL`, distingue acentos y mayúsculas, y deja pasar al mismo niño capturado con y sin escuela. Además, la bitácora de la Fase 2 tiene acciones específicas por caso de uso y la convención prohíbe guardar datos de menores en ella.

## Decisión

1. **Columnas normalizadas** calculadas en Node (`lib/text.js`): `name_key` (nombre + apellidos sin acentos, minúsculas, espacios simples) y `sort_key` (apellidos + nombre). La búsqueda es por palabras sobre `name_key` y el orden alfabético usa `sort_key`. Así el comportamiento es igual en SQLite y en el motor de la nube.
2. **Duplicados por entidad** (en el servicio, dentro de la transacción; responden `409` con `existing_id`):
   - Niñas y niños: `name_key` + `birth_date`, **sin** importar la escuela.
   - Voluntarios: correo, o `name_key` + teléfono. Tutores: `name_key` + teléfono.
   - Escuelas: CCT, o nombre + zona normalizados (estos dos sí con `UNIQUE` en la BD).
3. **`children.tutor_id` es opcional** (en el diseño original era obligatorio): una niña o niño de una comunidad puede no tener aún un tutor responsable registrado. El dato obligatorio es la madre, padre o tutor legal (`guardian_name`).
4. **Consentimiento no bloqueante en la Fase 3:** se permite registrar sin `guardian_consent`; la pantalla lo marca "Sin consentimiento" y la Fase 4 lo exigirá para crear cartas.
5. **Bitácora genérica para personas:** `RECORD_CREATED`, `RECORD_UPDATED` (`{ changed: [campos] }`), `RECORD_DEACTIVATED`, `RECORD_ACTIVATED` y `DATA_EXPORTED` (`{ format, count, filters }`), con `entity` = tabla. Nunca se guardan valores personales; el texto de búsqueda de una exportación se reduce a `search: true`.
6. **Errores con datos extra:** `AppError` acepta `extra` para agregar campos al cuerpo (`existing_id`), sin cambiar el formato plano de ADR-0009.

## Consecuencias

- ✅ Duplicados detectados aunque cambien acentos, mayúsculas, espacios o falte la escuela; el aviso enlaza al registro existente.
- ✅ La bitácora cubre cualquier entidad nueva de personas sin agregar acciones; el visor muestra la entidad y enlaza a su ficha.
- ⚠️ Dos niñas o niños distintos con exactamente el mismo nombre completo y fecha de nacimiento no se pueden registrar: caso muy raro; si ocurre, se distingue con un segundo nombre o se escala al administrador. Validar con la directiva.
- ⚠️ Al migrar a la nube hay que recalcular `name_key`/`sort_key` con la misma función si se importan datos por fuera del sistema.

## Alternativas consideradas

- **`UNIQUE` con `COLLATE NOCASE` o funciones de acentos del motor:** no es portable y no cubre acentos en SQLite.
- **Acciones específicas por entidad (`CHILD_CREATED`, …):** multiplica el catálogo (20+ acciones) sin aportar información.
- **Bloquear el registro sin consentimiento:** impediría capturar en campo mientras se recogen las autorizaciones firmadas.
