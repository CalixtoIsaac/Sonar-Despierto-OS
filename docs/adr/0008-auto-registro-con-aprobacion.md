# ADR-0008: Auto-registro del personal con aprobación del administrador

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana)
- **Modifica:** ADR-0004 (punto "solo el ADMIN crea cuentas") · **Relacionado con:** ADR-0003, ADR-0007, ADR-0009, `API_Spec.md` §3.1–3.2, `Pantallas_UI.md` P01, P02, P10

> Rutas de la API según ADR-0009: prefijo `/api` (antes `/api/v1`).

## Contexto

- Al cerrar la Fase 1, el login solo admite cuentas creadas por un ADMIN (semilla o `npm run create-user`). La Fase 2, tal como estaba planeada, agregaba el alta de usuarios **solo desde el ADMIN**.
- La directiva necesita que **cada integrante del personal cree su propia cuenta** (nombre, correo, teléfono y contraseña elegida por la persona), en lugar de que el administrador capture a todos y reparta contraseñas.
- El sistema guarda **datos de menores** (módulo `BENEFICIARIOS`) y, con `LAN_MODE=true`, cualquier equipo de la red de la oficina puede abrir la página de registro.
- Voluntarios, tutores y niños siguen siendo **registros sin cuenta** (ADR-0004 §4); este ADR trata solo las cuentas del personal que opera el sistema.

## Decisión

1. **Registro público con aprobación.** La pantalla de registro (enlazada desde el login) llama a `POST /api/auth/register`. La cuenta se crea con `role = OPERADOR`, `account_status = PENDIENTE`, `is_active = false` y **sin módulos**. Nadie entra al sistema hasta que un ADMIN aprueba la solicitud.
2. **Estados de cuenta** (`users.account_status`): `PENDIENTE` → `APROBADA` (aprobar) o `RECHAZADA` (rechazar, con motivo). Una solicitud `RECHAZADA` puede reconsiderarse (aprobarse). Las solicitudes `PENDIENTE` o `RECHAZADA` pueden eliminarse para liberar el correo. Las cuentas creadas por el ADMIN o por la semilla nacen `APROBADA`.
   - **Invariante:** `account_status ≠ APROBADA ⇒ is_active = false`.
3. **Módulos solicitados.** En el registro la persona marca los módulos que necesita (`requested_modules`, opcional). Al aprobar, el ADMIN **decide** el rol y los módulos definitivos (precargados con los solicitados). Lo solicitado se conserva como historial.
4. **Contraseña propia.** Quien se registra elige su contraseña (misma política de la Fase 1), por lo que al aprobarse queda con `must_change_password = false`. Las cuentas que crea el ADMIN siguen usando contraseña temporal obligatoria.
5. **Compromiso de confidencialidad.** El registro exige aceptar el uso confidencial de la información (`confidentiality_accepted_at`). El aviso de privacidad formal (LFPDPPP) sigue pendiente para la Fase 3.
6. **Login:** con la contraseña correcta, una cuenta `PENDIENTE` recibe `403 ACCOUNT_PENDING` y una `RECHAZADA` `403 ACCOUNT_REJECTED` (con contraseña incorrecta, siempre `401 INVALID_CREDENTIALS`, como en la Fase 1).
7. **Controles de abuso:** límite de 5 registros por IP cada 60 minutos (`429`); variable `REGISTRATION_ENABLED` en `config.env` para cerrar el registro (por ejemplo, fuera de temporada o si la red no es confiable).
8. **Auditoría:** `ACCOUNT_REQUESTED`, `ACCOUNT_APPROVED`, `ACCOUNT_REJECTED`, `USER_DELETED` y el resto de acciones de gestión de usuarios se registran en `audit_logs`.
9. El ADMIN conserva la opción de **crear cuentas directamente** (con contraseña temporal), útil para personas que no pueden registrarse por su cuenta.

## Consecuencias

- ✅ El personal crea su cuenta sin depender de que el ADMIN capture datos o reparta contraseñas.
- ✅ Los datos de menores siguen protegidos: ninguna cuenta nueva accede a nada sin la revisión de un ADMIN.
- ✅ El ADMIN ve qué pidió cada persona y por qué (nota de registro), y todo queda en la bitácora.
- ⚠️ La existencia de un correo se revela con `409 EMAIL_ALREADY_EXISTS` en el registro. Aceptado: es un sistema interno y el límite por IP reduce la enumeración.
- ⚠️ Sin correo electrónico configurado, el sistema **no notifica** a la persona cuando se aprueba su cuenta; se avisa por fuera (WhatsApp, en persona). El ADMIN ve un contador de solicitudes pendientes en el menú y en Inicio.
- ⚠️ En modo LAN cualquier equipo de la red puede enviar solicitudes; mitigado con la aprobación obligatoria, el límite por IP y `REGISTRATION_ENABLED=false`.
- 🔧 Cambios de modelo: columnas nuevas en `users` (migración 2). Cambios de API: `POST /api/auth/register`, `GET /api/auth/registration-info`, `/api/users/*` con aprobación y rechazo. Trabajo: Fase 2, subtareas 2.1–2.6.

## Alternativas consideradas

- **Registro libre sin módulos (activo al instante):** descartado; cualquier persona en la red tendría una sesión válida y aparecería como personal sin revisión.
- **Código de invitación generado por el ADMIN:** descartado por ahora; requiere que el ADMIN reparta códigos, que es justo la fricción que se quiere quitar. Puede añadirse en la fase de nube para escuelas y voluntarios (registro por enlace).
- **Solo alta por el ADMIN (plan anterior):** descartado por la directiva.
