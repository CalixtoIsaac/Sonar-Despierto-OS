# ADR-0005: Backend organizado por módulos de dominio

- **Estado:** Reemplazado por [ADR-0009](0009-stack-node-express-sqlite-como-sema.md) (2026-10-23): estructura por capas de SEMA (`routes/`, `services/`, `lib/`)
- **Fecha:** 2026-10-17
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana)
- **Relacionado con:** `Arquitectura_y_Convenciones.md` §1 y §3 (reemplaza la estructura por capas técnicas)

## Contexto

- La estructura original agrupaba por capa técnica (`models/`, `schemas/`, `services/`, `routers/`).
- Cinco personas desarrollarán módulos **en paralelo** (Personas, Eventos/Cartas, Calendario, Inventario). Con carpetas por capa, todos tocan las mismas carpetas y surgen conflictos de merge.
- El requisito de desacoplamiento exige que cada módulo sea **testeable de forma independiente**.

## Decisión

1. El backend se organiza en `backend/app/modules/<modulo>/`, cada uno con:
   - `models.py` (SQLAlchemy), `schemas.py` (Pydantic: `XCreate`, `XUpdate`, `XOut`), `service.py` (reglas de negocio, recibe `db: Session`), `router.py` (HTTP, sin lógica de negocio), `__init__.py`.
   - Pruebas en `backend/tests/<modulo>/`.
2. Lo transversal vive en:
   - `app/core/`: configuración, rutas de datos, seguridad, dependencias (`get_current_user`, `require_admin`, `require_module`), errores, catálogo de módulos y logging;
   - `app/db/`: base declarativa, tipos portables, sesión, migraciones y tareas de arranque;
   - `app/shared/`: utilidades comunes (esquemas base, paginación, servicio de la SPA, archivos).
3. `app/db/models_registry.py` importa los `models.py` de todos los módulos (Alembic lo usa para `autogenerate`).
4. **Reglas de dependencia:**
   - un módulo puede importar de `core`, `db`, `shared` y de los **modelos/servicios públicos** de otro módulo, nunca de su `router`;
   - prohibidas las importaciones circulares entre módulos (si dos módulos se necesitan mutuamente, la lógica compartida baja a `shared` o a un servicio del módulo de menor nivel).
5. Cada módulo agrega **su propia migración** de Alembic. Dos ramas que creen migraciones a la vez deben resolver la secuencia (`alembic merge`) antes de integrarse a `main`.
6. El frontend refleja la misma división: `frontend/src/features/<modulo>/` (api, hooks, componentes) + rutas en `frontend/src/routes/app/<modulo>...`.

## Consecuencias

- ✅ Trabajo en paralelo con pocos conflictos; responsables claros por carpeta.
- ✅ Un módulo puede probarse, revisarse y desactivarse de forma aislada.
- ⚠️ Requiere disciplina en la regla de dependencias (se revisa en code review).
- 🔧 La subtarea 1.1 mueve `routers/health.py` a `modules/health/router.py` y crea la estructura.

## Alternativas consideradas

- **Por capas (original):** descartado por los conflictos en paralelo.
- **Microservicios:** descartado; excesivo para un MVP local de proceso único.
