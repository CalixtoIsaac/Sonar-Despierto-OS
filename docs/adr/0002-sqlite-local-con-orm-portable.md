# ADR-0002: SQLite como base de datos del MVP local con capa ORM portable

- **Estado:** Reemplazado por [ADR-0009](0009-stack-node-express-sqlite-como-sema.md) (2026-10-23): se conservan SQLite, la carpeta de datos y las reglas de portabilidad; SQLAlchemy y Alembic se sustituyen por `better-sqlite3` y migraciones con `user_version`
- **Fecha:** 2026-10-17
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana)
- **Relacionado con:** `Modelo_Datos.md` (cambia el motor del MVP, no el modelo lógico), `Arquitectura_y_Convenciones.md` §2 y §4, ADR-0003

## Contexto

- El código existente y `Modelo_Datos.md` asumen **MySQL 8**, que exige instalar, configurar y mantener un servidor en cada PC.
- El MVP es un **ejecutable de doble clic** que debe funcionar sin instaladores adicionales, con 1 a 3 PCs de una misma oficina y un volumen de escritura moderado (cientos a pocos miles de registros por evento).
- A futuro el sistema migrará a hosting en la nube con MySQL o PostgreSQL.

## Decisión

1. El MVP local usa **SQLite 3** (incluido en Python) en un archivo `sonar.db` dentro del directorio de datos (ver ADR-0003).
2. Todo acceso a datos pasa por **SQLAlchemy 2.0** (ORM tipado) y todo cambio de esquema por **Alembic**. Ningún módulo usa SQL específico del motor.
3. Cambiar de motor se reduce a cambiar `DATABASE_URL` (p. ej. `mysql+pymysql://...`) y ejecutar `alembic upgrade head`.
4. **Reglas de portabilidad obligatorias:**
   - Enums con `sa.Enum(..., native_enum=False, create_constraint=True, length=N)` → `VARCHAR` + `CHECK` (funciona igual en SQLite, MySQL y PostgreSQL).
   - Claves primarias con el tipo `IdType = BigInteger().with_variant(Integer, "sqlite")` (SQLite solo autoincrementa `INTEGER PRIMARY KEY`).
   - Fechas-hora en **UTC sin zona** (`DateTime`), generadas en Python (`utcnow()`); la API las serializa con sufijo `Z`.
   - `MetaData(naming_convention=...)` con los prefijos de `Modelo_Datos.md` (`pk_`, `fk_`, `uq_`, `idx_`, `ck_`): necesario para que Alembic pueda alterar tablas en SQLite (`render_as_batch=True`).
   - Concurrencia (p. ej. dos padrinos adoptando la misma carta, Fase 4): **bloqueo optimista** con columna `version` (`UPDATE ... WHERE id=? AND version=?`). No se depende de `SELECT ... FOR UPDATE` (SQLite lo ignora).
   - `JSON` de SQLAlchemy para columnas JSON (soportado por los tres motores).
5. Configuración de SQLite al conectar: `PRAGMA foreign_keys=ON`, `journal_mode=WAL` (lecturas concurrentes con una escritura), `busy_timeout=5000`, `synchronous=NORMAL`; `check_same_thread=False`.
6. El driver de MySQL (`pymysql`, `cryptography`) se separa en `requirements-mysql.txt` para no inflar el ejecutable.

## Consecuencias

- ✅ Cero instalación: la BD se crea sola en el primer arranque.
- ✅ Respaldo = copiar un archivo (se automatiza en la Fase 8).
- ✅ Las pruebas usan el mismo motor que producción local.
- ⚠️ SQLite admite **una escritura a la vez**; con WAL y `busy_timeout` es suficiente para 2–3 usuarios simultáneos. Si crece el uso concurrente, se migra a MySQL/PostgreSQL (ruta ya preparada).
- ⚠️ El archivo `sonar.db` **no debe** ubicarse en carpetas sincronizadas (OneDrive/Dropbox): puede corromperse. El directorio de datos por defecto es `%LOCALAPPDATA%\SonarDespierto` (no sincronizado).
- ⚠️ El DDL MySQL de `Modelo_Datos.md` §8 queda como **referencia para la nube**; el esquema real lo definen los modelos y las migraciones de Alembic.
- 🔧 Trabajo generado: subtarea 1.2 (sesión, pragmas, Alembic) y regla permanente para todos los módulos.

## Alternativas consideradas

- **MySQL local:** descartado por la fricción de instalación y soporte en cada PC.
- **PostgreSQL embebido / portable:** descartado; complejidad de empaquetado sin beneficio a este volumen.
- **Archivos JSON/Excel:** descartado; sin integridad referencial ni transacciones.
