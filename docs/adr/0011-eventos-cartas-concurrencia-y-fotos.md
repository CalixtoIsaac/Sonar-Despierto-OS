# ADR-0011: Eventos y cartas — padrino voluntario, bloqueo optimista, datos restringidos y fotos privadas

- **Estado:** Aceptado
- **Fecha:** 2026-10-30
- **Decisores:** Equipo de desarrollo (pendiente de validar con la directiva el límite de cartas por padrino)
- **Relacionado con:** ADR-0004, ADR-0006, ADR-0009, ADR-0010, `fases/Fase_4_Contratos.md`, `Modelo_Datos.md` §4.6–4.9 y §6

## Contexto

La Fase 4 agrega eventos y cartas de Navidad. El diseño original asumía padrinos con cuenta (`sponsor_user_id → users`), adopción por el propio padrino con `SELECT … FOR UPDATE` (MySQL) y fotos procesadas en el servidor. En el MVP local solo el personal usa el sistema (ADR-0004), el motor es SQLite con una sola conexión síncrona (ADR-0009) y no queremos dependencias nativas extra (como `sharp`) que compliquen el paquete portátil. El Gate pide que dos asignaciones simultáneas de la misma carta no puedan ganar ambas, y el PRD pide trazabilidad del 100 % de los regalos.

## Decisión

1. **Padrino = voluntario registrado:** `letters.sponsor_volunteer_id → volunteers` y `event_volunteers.volunteer_id → volunteers` (cumple la tabla de cambios de ADR-0004). El personal asigna; no hay autoadopción hasta la fase de nube.
2. **Bloqueo optimista con `letters.version`:** toda transición exige la versión que se estaba viendo y se aplica con `UPDATE … WHERE id = ? AND version = ? AND status = ?` dentro de una transacción `IMMEDIATE`. Si no cambia ninguna fila responde `409` (`LETTER_ALREADY_ASSIGNED`, `LETTER_STATUS_CHANGED` o `LETTER_VERSION_CONFLICT`) con el estatus y la versión actuales. Sustituye a `SELECT … FOR UPDATE`, que SQLite no tiene, y funciona igual en MySQL/PostgreSQL.
3. **Historial de solo inserción** (`letter_status_history`) escrito en la misma transacción que la transición, reforzado con un disparador que rechaza `UPDATE`. La bitácora solo registra el cambio (`LETTER_STATUS_CHANGED`) sin datos de la niña o niño.
4. **Códigos por evento** `{PREFIJO}-{000001}` a partir de `events.next_letter_number` (en la transacción del alta): consecutivos, legibles y nunca reutilizados. El prefijo y el tipo del evento se bloquean cuando ya hay cartas.
5. **Datos restringidos del menor dentro de Cartas:** con `BENEFICIARIOS` (o ADMIN) la carta muestra los datos completos; con solo `CARTAS`, el nombre de pila con la inicial del apellido, edad, género, grado, grupo y escuela. Así el personal de acopio trabaja sin ver apellidos, fechas de nacimiento ni datos del tutor (Modelo §7, nivel "Restringido").
6. **Consentimiento obligatorio para crear cartas** (`400 CONSENT_REQUIRED`), como anticipó ADR-0010.
7. **Fotos sin dependencias nativas:** el navegador redimensiona (≤ 1600 px) y recodifica a JPEG; el servidor recibe el cuerpo crudo (`express.raw`), verifica el tipo por sus bytes, quita `APP1` (EXIF/XMP) de los JPEG y guarda con nombre UUID en `{DATA_DIR}/uploads/letters/`, servido solo con sesión.
8. **Sin borrado** de cartas ni de participaciones; las bajas de niñas, niños y voluntarios se bloquean (`409`) mientras tengan cartas en curso.
9. **Lectura de eventos con `EVENTOS` o `CARTAS`** (middleware `requireAnyModule`), escritura solo con `EVENTOS`.

## Consecuencias

- ✅ El Gate se cumple sin depender del motor: la segunda asignación siempre recibe `409` y la pantalla puede ofrecer "Actualizar".
- ✅ Cada carta tiene su historial completo (quién, cuándo, padrino y comentario) y no se puede alterar desde la aplicación.
- ✅ El paquete portátil sigue sin dependencias nativas nuevas.
- ⚠️ La interfaz debe enviar siempre la `version`; una pantalla abierta mucho tiempo verá conflictos que se resuelven recargando.
- ⚠️ El redimensionado depende del navegador: una foto subida por otra vía (API directa) se guarda con su tamaño original (limitado a 5 MB).
- ⚠️ Las fotos viven en `uploads\` junto a `sonar.db`: los respaldos de la F8 deben incluir esa carpeta.

## Alternativas consideradas

- **`sharp` para procesar imágenes en el servidor:** dependencia nativa de ~30 MB por plataforma; complica el paquete portátil.
- **Bloqueo pesimista (tabla de candados / `BEGIN EXCLUSIVE` largo):** innecesario con una sola instancia y peor experiencia que avisar del conflicto.
- **`sponsor_user_id` con cuentas para padrinos:** contradice ADR-0004 en el MVP local.
- **Mostrar siempre los datos completos del menor en Cartas:** obligaría a dar `BENEFICIARIOS` a todo el personal de acopio.
