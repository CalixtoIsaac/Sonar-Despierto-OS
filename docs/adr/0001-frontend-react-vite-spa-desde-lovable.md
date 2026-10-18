# ADR-0001: Frontend como SPA React + Vite + Tailwind a partir del diseño de Lovable

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana, líder técnico del proyecto)
- **Relacionado con:** `Arquitectura_y_Convenciones.md` §2–3 (reemplaza la elección de frontend), `Pantallas_UI.md`, ADR-0003

## Contexto

- Los documentos de diseño del 2026-10-12 definían un frontend **HTML/CSS/JS vanilla multipágina sin build step**.
- Después se generó con **Lovable** un diseño de referencia construido con **React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui (Radix) + TanStack Router/Query**, montado sobre **TanStack Start** (SSR, servidor Nitro con destino Cloudflare y la configuración propietaria `@lovable.dev/vite-tanstack-config`).
- El export de Lovable contiene: pantalla de Login, `AppShell` (header, barra lateral, navegación inferior móvil, menú de usuario), componentes de marca (`Logo`, `Panel`, `Kpi`, `DataState`, `StatusChip`, `ConfirmModal`, `SegProgress`), 47 componentes shadcn, tokens de color de la paleta oficial y datos simulados. **No** contiene las pantallas internas (cartas, niños, etc.) ni Calendario ni Inventario.
- El sistema se ejecuta localmente (ADR-0003): no debe requerir Node.js ni un servidor SSR en la PC del usuario final, y debe funcionar **sin internet**.

## Decisión

1. El frontend será una **SPA (Single Page Application)** con **React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui**, reutilizando el sistema de diseño exportado por Lovable.
2. Se **conservan**: TanStack Router (enrutado por archivos, modo SPA), TanStack Query (datos del servidor), react-hook-form + zod (formularios), lucide-react (íconos), sonner (toasts), recharts (gráficas, Fase 7).
3. Se **eliminan**: TanStack Start (SSR), Nitro, `@lovable.dev/vite-tanstack-config`, `src/server.ts`, `src/start.ts`, el reporte de errores de Lovable, la barra "Modo demostración" y el store/mock en `localStorage`.
4. `vite build` genera archivos estáticos en `frontend/dist/`, que **FastAPI sirve** en el mismo origen que la API (`/api/v1`), con *fallback* a `index.html` para rutas profundas.
5. Las fuentes tipográficas de marca (Figtree, Nunito, Jost, Playfair Display) se empaquetan **localmente** con `@fontsource/*` (no se usa Google Fonts por CDN) para que la app funcione sin internet.
6. Las rutas autenticadas viven bajo `/app/...` (como en Lovable); el login en `/login`.
7. Los textos de interfaz están en español; los tipos y valores de dominio replican exactamente los del backend (p. ej. `PENDIENTE`, `ADMIN`).

## Consecuencias

- ✅ Se aprovecha la inversión en diseño de Lovable; UI moderna, accesible y responsiva.
- ✅ Una sola pieza desplegable (backend + `dist/`), sin Node en producción.
- ✅ Migrar a la nube es trivial: la misma `dist/` puede servirse desde Nginx/CDN.
- ⚠️ Se introduce un *build step* (Node 22 LTS) **solo para desarrolladores**.
- ⚠️ `Pantallas_UI.md` describe rutas `.html` y componentes JS vanilla: las rutas se reinterpretan como rutas SPA `/app/...` y los componentes se toman de Lovable/shadcn. Las pantallas faltantes se construirán con los componentes de marca existentes.
- 🔧 Trabajo generado: subtareas 1.4 y 1.5 de la Fase 1.

## Alternativas consideradas

- **Vanilla JS (plan original):** descartado; obligaría a rehacer a mano todo el diseño de Lovable y a construir componentes accesibles desde cero.
- **Mantener TanStack Start con SSR:** descartado; requiere un servidor Node en la PC del usuario y su configuración está atada a Lovable/Cloudflare.
- **Electron/Tauri:** descartado para el MVP; el requisito es "abrir el navegador en localhost" y permitir acceso desde otras PCs de la red (ADR-0003).
