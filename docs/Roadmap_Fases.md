# Hoja de Ruta por Fases — Sistema de Gestión Soñar Despierto

- **Estado:** Aprobada el 2026-10-17 · Actualizada el 2026-10-17 (F2 con auto-registro, ADR-0008), el 2026-10-23 (stack de SEMA, ADR-0009) y el 2026-10-29 (F2 y F3 completadas, ADR-0010)
- **Decisiones base:** ver [`docs/adr/`](adr/README.md) (ADR-0001 a ADR-0010)
- **Stack (desde 2026-10-23, ADR-0009):** Node.js + Express + SQLite (`better-sqlite3`) + HTML/CSS/JS sin frameworks — el mismo de SEMA y My Best DataBase
- **Equipo:** Isaac Galeana, Uziel García, Antonio Anaya, Galilea Valencia, Matías Garrido

---

## 1. Principios

1. **Cada fase termina con un "Gate"**: pruebas automáticas en verde + demo manual reproducible. No se inicia una fase dependiente hasta que su predecesora pase el Gate.
2. **Cada módulo es independiente**: su `routes/<recurso>.js`, `services/<recurso>.js` y `public/js/<vista>.js`, su migración en `lib/migrations.js`, sus pruebas y su permiso de módulo (ADR-0004, ADR-0009).
3. **Definición de "terminado" por módulo:**
   1. Endpoints documentados en la sección correspondiente de `API_Spec.md` (actualizada en la misma fase).
   2. Pruebas de: caso feliz, validación (`422`), permiso (`401`/`403`), duplicado o conflicto (`409`) cuando aplique.
   3. Pantallas con estados de carga, vacío y error, usables en móvil a 360 px y en tema claro y oscuro.
   4. Acciones sensibles registradas en `audit_logs`.
   5. `npm test` y `npm run empaquetar` (con su prueba de humo) sin errores.
4. **Ramas:** `main` siempre estable y ejecutable; una rama `feat/f<fase>-<subtarea>-<tema>` por subtarea; *pull request* con revisión de al menos otra persona.

## 2. Arquitectura de referencia

```text
 [Doble clic: SonarDespierto.bat]
        │  server.js: data dir, config.env, instancia única, puerto libre, banner
        ▼
 Node.js + Express  (127.0.0.1:8765  |  0.0.0.0:8765 si LAN_MODE=true)
   ├── /api/*      → API REST (JWT) ── routes/ → services/ → lib/
   ├── /, /app     → public/login.html, public/app.html (vistas por #hash) + CSS/JS/fuentes
   └── better-sqlite3 ──►  SQLite  %LOCALAPPDATA%\SonarDespierto\sonar.db
                           (+ logs\, uploads\, backups\, secret.key, config.env)
```

## 3. Fases

| Fase | Nombre | Contenido principal | Gate (criterio de salida) | Depende de |
|---|---|---|---|---|
| **F1** ✅ | Fundación y esqueleto ejecutable | Núcleo (config, SQLite, migraciones, logging); usuarios + auth JWT + permisos por módulo; diseño de Lovable; login con cambio obligatorio de contraseña; arranque local, modo LAN y paquete portátil. **Reimplementada el 2026-10-23 en Node.js + Express (ADR-0009)**; el documento original queda como histórico: [`fases/Fase_1_Prompts_Task_Document.md`](fases/Fase_1_Prompts_Task_Document.md) | Doble clic en `SonarDespierto.bat` → navegador → login del admin con cambio obligatorio de contraseña → panel con menú según permisos → logout. `npm test` en verde. Prueba de humo automatizada contra el paquete portátil | — |
| **F2** ✅ | Usuarios, auto-registro, permisos y bitácora | **Solicitud de cuenta del personal con aprobación del ADMIN (ADR-0008)**; gestión de usuarios (ADMIN): revisión de solicitudes, alta directa con contraseña temporal, edición de rol y módulos, restablecimiento, activación/desactivación; perfil editable; visor de bitácora; P01–P04 y P10 adaptadas. Detalle: [`fases/Fase_2_Prompts_Task_Document.md`](fases/Fase_2_Prompts_Task_Document.md). **Gate pasado el 2026-10-29** (`test/gate-f2.test.js` y prueba de humo con registro y aprobación) | Una cuenta registrada no entra hasta ser aprobada; un OPERADOR sin `CARTAS` recibe `403` en la API y no ve el menú; un usuario desactivado pierde la sesión de inmediato; prueba de humo con registro y aprobación | F1 |
| **F3** ✅ | Personas | Voluntarios, escuelas, tutores/responsables y niños (consentimiento del tutor, detección de duplicados, exportación CSV auditada); P08–P09, P11–P14. Actualiza `Modelo_Datos.md` y `API_Spec.md` según ADR-0004. Contratos: [`fases/Fase_3_Contratos.md`](fases/Fase_3_Contratos.md) (ADR-0010). **Gate pasado el 2026-10-29** (`test/gate-f3.test.js` y prueba de humo) | Duplicado → `409`; exportación registrada en bitácora; datos de niños solo con `BENEFICIARIOS` | F2 |
| **F4** | Eventos y cartas de Navidad | Eventos (macro-eventos, prefijo de código), asignación de voluntarios a eventos, cartas con código `NAV26-000123`, foto privada, máquina de estados + historial, asignación de padrino (voluntario), búsqueda por código; P15–P18, P22–P23 | Concurrencia: dos asignaciones simultáneas de la misma carta → una recibe `409`. Historial completo de cada carta | F3 |
| **F5** | Calendario de actividades | `activities` (título, descripción, fecha, hora inicio/fin, lugar, tipo: junta / capacitación / acopio / evento, responsable), `activity_volunteers`, vínculo opcional a un evento; vistas mensual y semanal; filtros por tipo y responsable | Crear, editar, mover y filtrar actividades; aviso de traslape de horario del mismo responsable | F2 (voluntarios de F3 para asignar personas) |
| **F6** | Inventario (esquema base ajustable) | Categorías, centros de acopio, artículos, movimientos de entrada/salida, existencias calculadas, kardex (ADR-0006) | Salida mayor a la existencia → rechazada; el kardex cuadra con las existencias | F2 (validar reglas con la directiva antes de iniciar) |
| **F7** | Dashboard y reportes | KPIs por evento (cartas por estatus, voluntarios, niños), gráficas, exportación a Excel; P05 adaptada | Las cifras del dashboard coinciden con consultas SQL de control | F3, F4 (F5 y F6 opcionales) |
| **F8** | Empaquetado y entrega | Instalador (Inno Setup) a partir del paquete portátil, acceso directo, respaldos automáticos de `sonar.db` y restauración, revisión de seguridad, manual de usuario, datos de demostración, guía de modo LAN | Instalación limpia en una PC sin Node.js; restaurar un respaldo funciona; manual validado por la directiva | F1–F7 |
| *F9* | *Nube (futuro)* | *MySQL/PostgreSQL, HTTPS, cookies `HttpOnly`, roles `VOLUNTARIO`/`TUTOR`, registro público por enlace para **escuelas y voluntarios** (el personal ya se registra desde la F2)* | — | F8 |

## 4. Trabajo en paralelo

```text
F1 ──► F2 ──┬──► F3 ──► F4 ──┐
            ├──► F5 ─────────┼──► F7 ──► F8
            └──► F6 ─────────┘
```

- **F2 internamente:** 2.1 primero; después 2.2, 2.3 y 2.4 en paralelo; 2.5 requiere 2.2 y 2.4; 2.6 requiere 2.3 y 2.5.
- **Después de F2:** tres frentes simultáneos (F3→F4, F5, F6), cada uno en su propia carpeta de módulo.
- Las migraciones creadas en paralelo usan números consecutivos en `lib/migrations.js`: si dos ramas toman el mismo número, la segunda en integrarse se renumera antes del merge a `main`.

## 5. Pendientes de la directiva (no bloquean F1–F2)

| Tema | Necesario antes de |
|---|---|
| Pantallas adicionales de Lovable (cartas, eventos…) — las de personas se hicieron con los componentes del sistema | F4 |
| Categorías, centros de acopio y flujos de Inventario | F6 |
| Lista de tipos de actividad del Calendario (confirmar: junta, capacitación, acopio, evento) | F5 |
| Logotipo oficial en alta resolución (ícono del ejecutable y favicon) | F8 (provisional en F1) |
| Aviso de privacidad (LFPDPPP) para datos de menores y voluntarios (el sistema ya registra la aceptación; falta el texto oficial) | Antes de capturar datos reales (la F3 ya está implementada) |
| Validar la regla de duplicado de niñas y niños (nombre completo + fecha de nacimiento, ADR-0010) | Antes de capturar datos reales |
| Texto definitivo del compromiso de confidencialidad del registro (hay uno provisional en la F2) | Antes de usar el registro con personal real |
