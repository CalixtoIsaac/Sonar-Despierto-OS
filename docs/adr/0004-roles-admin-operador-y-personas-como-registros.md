# ADR-0004: Roles ADMIN / OPERADOR con permisos por módulo; voluntarios, tutores y niños como registros

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Decisores:** Equipo de desarrollo y directiva de Soñar Despierto (aprobado por Isaac Galeana)
- **Relacionado con:** `Modelo_Datos.md` §3–4, `API_Spec.md` §1.3 y §3.1–3.3, `Pantallas_UI.md` §2.2, `PROJECT_CONTEXT.md` §3.1

## Contexto

- Los documentos de diseño modelaban un sistema de **autoservicio**: voluntarios y tutores con cuenta propia (roles `VOLUNTARIO` y `TUTOR`), registro público y catálogo de cartas para padrinos.
- El MVP local es de **captura interna**: solo el personal de Soñar Despierto usa el sistema. El registro público por enlace (escuelas, voluntarios) queda para la fase de nube.
- La directiva aprobó dos tipos de acceso: **Administrador** (todo) y **Operador de módulo** (solo lo que se le habilite).

## Decisión

1. Roles con acceso al sistema en el MVP local (`users.role`):
   - `ADMIN`: acceso total, incluida la gestión de usuarios, permisos y bitácora.
   - `OPERADOR`: acceso **solo** a los módulos que el ADMIN le asigne.
2. Permisos por módulo en la tabla `user_module_permissions (user_id, module)`, con `UNIQUE(user_id, module)`. En el MVP, tener un módulo da acceso **completo** (lectura y escritura) a ese módulo. Un nivel solo lectura / escritura queda como posible extensión.
3. **Catálogo de módulos** (`ModuleKey`, fuente única en `backend/app/core/modules.py`, replicado en el frontend):

| Clave | Etiqueta | Incluye | Fase |
|---|---|---|---|
| `VOLUNTARIOS` | Voluntarios | Registro y gestión de voluntarios | 3 |
| `BENEFICIARIOS` | Beneficiarios | Niños, escuelas y tutores responsables (**datos sensibles de menores**) | 3 |
| `EVENTOS` | Eventos | Macro-eventos (Navidad, Día del Niño) y su logística | 4 |
| `CARTAS` | Cartas de Navidad | Cartas, padrinos, estatus, búsqueda por código | 4 |
| `CALENDARIO` | Calendario | Actividades: juntas, capacitaciones, acopios, eventos | 5 |
| `INVENTARIO` | Inventario | Artículos, centros de acopio y movimientos | 6 |
| `REPORTES` | Reportes | Dashboard y exportaciones | 7 |

   La gestión de **usuarios** no es un módulo asignable: es exclusiva de `ADMIN`.
4. **Voluntarios, tutores/responsables y niños son entidades de registro** (tablas de datos) **sin credenciales** en esta etapa. El personal los captura.
5. Los permisos se validan **siempre en el backend** (`require_admin`, `require_module(ModuleKey.X)`); el frontend solo oculta menús y rutas.
6. Los valores `VOLUNTARIO` y `TUTOR` **no** se crean en el enum del MVP; se añadirán con una migración en la fase de nube.

## Consecuencias (cambios al modelo y la API, a aplicar en la fase indicada)

| Documento / elemento | Cambio | Fase |
|---|---|---|
| `users.role` | `ENUM('ADMIN','OPERADOR')` + `token_version` (ver ADR-0007) | 1 |
| `user_module_permissions` | Tabla nueva | 1 |
| `POST /auth/register` | Fuera del MVP local (fase de nube) | — |
| `volunteer_profiles` | Pasa a ser la entidad independiente `volunteers` (con nombre, contacto, emergencia, talla, área), **sin** `user_id` | 3 |
| `tutor_profiles` | Pasa a ser la entidad `tutors` (responsable o profesor, con escuela opcional), sin `user_id` | 3 |
| `children.tutor_user_id` | Pasa a ser `children.tutor_id → tutors.id`; `created_by` sigue apuntando a `users` | 3 |
| `letters.sponsor_user_id` | Pasa a ser `letters.sponsor_volunteer_id → volunteers.id` (el padrino es un voluntario registrado) | 4 |
| `event_volunteers.user_id` | Pasa a ser `volunteer_id → volunteers.id` | 4 |
| Pantallas de voluntario (P02, P07, P19–P21, P24) | Fuera del MVP local; su funcionalidad la opera el personal desde Voluntarios / Cartas | 3–4 |
| Regla de alcance "TUTOR solo ve lo suyo" | Se sustituye por el permiso de módulo `BENEFICIARIOS` | 3 |

- ✅ El modelo de acceso es simple y auditable; los datos de menores quedan aislados tras un permiso propio.
- ✅ Al pasar a la nube se pueden añadir cuentas para voluntarios y tutores sin romper nada: se agregan roles y una relación opcional `volunteers.user_id`.
- ⚠️ `Modelo_Datos.md` y `API_Spec.md` se actualizarán módulo por módulo al inicio de las Fases 2, 3 y 4 (cada fase entrega su sección actualizada).

## Alternativas consideradas

- **Mantener roles VOLUNTARIO/TUTOR con cuenta:** descartado para el MVP local; nadie externo accede al sistema.
- **RBAC completo (roles configurables + permisos granulares):** descartado por complejidad; el permiso por módulo cubre la necesidad actual.
