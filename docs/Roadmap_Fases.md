# Hoja de Ruta por Fases — Sistema de Gestión Soñar Despierto

- **Estado:** Aprobada el 2026-10-17
- **Decisiones base:** ver [`docs/adr/`](adr/README.md) (ADR-0001 a ADR-0007)
- **Equipo:** Isaac Galeana, Uziel García, Antonio Anaya, Galilea Valencia, Matías Garrido

---

## 1. Principios

1. **Cada fase termina con un "Gate"**: pruebas automáticas en verde + demo manual reproducible. No se inicia una fase dependiente hasta que su predecesora pase el Gate.
2. **Cada módulo es independiente**: su carpeta en backend y frontend, su migración de Alembic, sus pruebas y su permiso de módulo (ADR-0004, ADR-0005).
3. **Definición de "terminado" por módulo:**
   1. Endpoints documentados en Swagger (`/docs`) y en la sección correspondiente de `API_Spec.md` (actualizada en la misma fase).
   2. Pruebas de: caso feliz, validación (`422`), permiso (`401`/`403`), duplicado o conflicto (`409`) cuando aplique.
   3. Pantallas con estados de carga, vacío y error (`DataState`), usables en móvil a 360 px.
   4. Acciones sensibles registradas en `audit_logs`.
   5. `ruff`, `eslint`, `tsc` y todas las pruebas sin errores.
4. **Ramas:** `main` siempre estable y ejecutable; una rama `feat/f<fase>-<subtarea>-<tema>` por subtarea; *pull request* con revisión de al menos otra persona.

## 2. Arquitectura de referencia

```text
 [Doble clic: SonarDespierto.exe]
        │  launcher: data dir, config.env, instancia única, puerto libre
        ▼
 Uvicorn + FastAPI  (127.0.0.1:8765  |  0.0.0.0:8765 si LAN_MODE=true)
   ├── /api/v1/*   → API REST (JWT) ── modules/<x>/{router → service → models}
   ├── /*          → SPA React compilada (frontend/dist) + fallback a index.html
   └── SQLAlchemy ──►  SQLite  %LOCALAPPDATA%\SonarDespierto\sonar.db
                      (+ logs\, uploads\, backups\, secret.key, config.env)
```

## 3. Fases

| Fase | Nombre | Contenido principal | Gate (criterio de salida) | Depende de |
|---|---|---|---|---|
| **F1** | Fundación y esqueleto ejecutable | Repo saneado; núcleo backend (config, SQLite, Alembic, logging, SPA); usuarios + auth JWT + permisos por módulo; frontend Lovable migrado a SPA; login integrado; lanzador y `.exe` con PyInstaller | Doble clic en `.exe` → navegador → login del admin con cambio obligatorio de contraseña → panel con menú según permisos → logout. `pytest` y `vitest` en verde. Prueba de humo automatizada contra el `.exe`. Detalle: [`fases/Fase_1_Prompts_Task_Document.md`](fases/Fase_1_Prompts_Task_Document.md) | — |
| **F2** | Usuarios, permisos y bitácora | CRUD de usuarios (ADMIN), asignación de módulos a OPERADORES, contraseña temporal, reset, desactivación; visor de bitácora; P04 y P10 adaptadas | Un OPERADOR sin `CARTAS` recibe `403` en la API y no ve el menú; un usuario desactivado pierde la sesión de inmediato | F1 |
| **F3** | Personas | Voluntarios, escuelas, tutores/responsables y niños (consentimiento del tutor, detección de duplicados, exportación CSV auditada); P08–P09, P11–P14. Actualiza `Modelo_Datos.md` y `API_Spec.md` según ADR-0004 | Duplicado → `409`; exportación registrada en bitácora; datos de niños solo con `BENEFICIARIOS` | F2 |
| **F4** | Eventos y cartas de Navidad | Eventos (macro-eventos, prefijo de código), asignación de voluntarios a eventos, cartas con código `NAV26-000123`, foto privada, máquina de estados + historial, asignación de padrino (voluntario), búsqueda por código; P15–P18, P22–P23 | Concurrencia: dos asignaciones simultáneas de la misma carta → una recibe `409`. Historial completo de cada carta | F3 |
| **F5** | Calendario de actividades | `activities` (título, descripción, fecha, hora inicio/fin, lugar, tipo: junta / capacitación / acopio / evento, responsable), `activity_volunteers`, vínculo opcional a un evento; vistas mensual y semanal; filtros por tipo y responsable | Crear, editar, mover y filtrar actividades; aviso de traslape de horario del mismo responsable | F2 (voluntarios de F3 para asignar personas) |
| **F6** | Inventario (esquema base ajustable) | Categorías, centros de acopio, artículos, movimientos de entrada/salida, existencias calculadas, kardex (ADR-0006) | Salida mayor a la existencia → rechazada; el kardex cuadra con las existencias | F2 (validar reglas con la directiva antes de iniciar) |
| **F7** | Dashboard y reportes | KPIs por evento (cartas por estatus, voluntarios, niños), gráficas, exportación a Excel; P05 adaptada | Las cifras del dashboard coinciden con consultas SQL de control | F3, F4 (F5 y F6 opcionales) |
| **F8** | Empaquetado y entrega | Instalador (Inno Setup), acceso directo, respaldos automáticos de `sonar.db` y restauración, revisión de seguridad, manual de usuario, datos de demostración, guía de modo LAN | Instalación limpia en una PC sin Python ni Node; restaurar un respaldo funciona; manual validado por la directiva | F1–F7 |
| *F9* | *Nube (futuro)* | *MySQL/PostgreSQL, HTTPS, cookies `HttpOnly`, roles `VOLUNTARIO`/`TUTOR`, registro público por enlace para escuelas y voluntarios* | — | F8 |

## 4. Trabajo en paralelo

```text
F1 ──► F2 ──┬──► F3 ──► F4 ──┐
            ├──► F5 ─────────┼──► F7 ──► F8
            └──► F6 ─────────┘
```

- **F1 internamente:** 1.1 → 1.2 → 1.3 (backend) en serie; **1.4 (frontend) puede ir en paralelo con 1.2–1.3**; 1.5 requiere 1.3 y 1.4; 1.6 requiere todas.
- **Después de F2:** tres frentes simultáneos (F3→F4, F5, F6), cada uno en su propia carpeta de módulo.
- Las migraciones de Alembic creadas en paralelo se reconcilian con `alembic merge` antes de integrar a `main`.

## 5. Pendientes de la directiva (no bloquean F1–F2)

| Tema | Necesario antes de |
|---|---|
| Pantallas adicionales de Lovable (cartas, niños, voluntarios…) | F3 |
| Categorías, centros de acopio y flujos de Inventario | F6 |
| Lista de tipos de actividad del Calendario (confirmar: junta, capacitación, acopio, evento) | F5 |
| Logotipo oficial en alta resolución (ícono del ejecutable y favicon) | F8 (provisional en F1) |
| Aviso de privacidad (LFPDPPP) para datos de menores | F3 |
