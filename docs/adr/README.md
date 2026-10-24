# Registro de Decisiones de Arquitectura (ADR) — Soñar Despierto

Un ADR documenta **una** decisión técnica importante: el contexto, lo que se decidió, por qué y sus consecuencias. Los ADR **no se editan** una vez aceptados; si una decisión cambia, se crea un ADR nuevo que **reemplaza** al anterior (y se marca el viejo como `Reemplazado por ADR-XXXX`).

> **Regla de precedencia:** si un documento de `docs/` (Arquitectura, Modelo de Datos, API, Pantallas, PRD) contradice un ADR aceptado, **manda el ADR**. Los documentos de fase (`docs/fases/`) aterrizan los ADR en instrucciones concretas.

## Índice

| ADR | Título | Estado | Fecha |
|---|---|---|---|
| [0001](0001-frontend-react-vite-spa-desde-lovable.md) | Frontend como SPA React + Vite + Tailwind a partir del diseño de Lovable | Reemplazado por 0009 | 2026-10-17 |
| [0002](0002-sqlite-local-con-orm-portable.md) | SQLite como base de datos del MVP local con capa ORM portable | Reemplazado por 0009 | 2026-10-17 |
| [0003](0003-ejecucion-local-launcher-y-modo-lan.md) | Ejecución local: ejecutable lanzador, proceso único y modo LAN opcional | Aceptado (modificado por 0009) | 2026-10-17 |
| [0004](0004-roles-admin-operador-y-personas-como-registros.md) | Roles ADMIN / OPERADOR con permisos por módulo; personas como registros | Aceptado | 2026-10-17 |
| [0005](0005-backend-modular-por-dominio.md) | Backend organizado por módulos de dominio | Reemplazado por 0009 | 2026-10-17 |
| [0006](0006-inventario-y-estatus-de-cartas.md) | Inventario separado del ciclo de vida de las cartas | Aceptado | 2026-10-17 |
| [0007](0007-autenticacion-y-sesion-mvp-local.md) | Autenticación y manejo de sesión en el MVP local | Aceptado (modificado por 0009) | 2026-10-17 |
| [0008](0008-auto-registro-con-aprobacion.md) | Auto-registro del personal con aprobación del administrador | Aceptado | 2026-10-17 |
| [0009](0009-stack-node-express-sqlite-como-sema.md) | Mismo stack que My Best DataBase y SEMA: Node.js + Express + SQLite + HTML/CSS/JS | Aceptado | 2026-10-23 |

Hoja de ruta aprobada: [`../Roadmap_Fases.md`](../Roadmap_Fases.md).

## Plantilla para nuevos ADR

```markdown
# ADR-XXXX: <Título corto en imperativo o sustantivo>

- **Estado:** Propuesto | Aceptado | Reemplazado por ADR-YYYY | Obsoleto
- **Fecha:** AAAA-MM-DD
- **Decisores:** <quién aprobó>
- **Relacionado con:** <ADR, documentos>

## Contexto
¿Qué problema o fuerza obliga a decidir? Hechos, restricciones.

## Decisión
Lo que se hará, en frases claras y verificables.

## Consecuencias
Positivas, negativas y trabajo que genera (con la fase donde se atiende).

## Alternativas consideradas
Opción — por qué se descartó.
```
