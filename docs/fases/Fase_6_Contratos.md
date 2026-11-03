# Fase 6 — Inventario: contratos y decisiones

- **Proyecto:** Sistema de Gestión Soñar Despierto (MVP local)
- **Fecha:** 2026-11-02 · **Estado:** Implementado (rama `feat/f6-inventario`)
- **Decisiones que aplica:** ADR-0004 (permisos por módulo), ADR-0006 (inventario separado de las cartas), ADR-0009 (stack), ADR-0010 (bitácora genérica y exportaciones auditadas) y **ADR-0013** (libro de movimientos, existencias por centro, anulaciones y salidas sin saldo negativo)
- **Depende de:** Fase 2 (usuarios y bitácora); usa `events` de la Fase 4 como vínculo opcional
- **Gate de la hoja de ruta:** salida mayor a la existencia → rechazada; el kardex cuadra con las existencias → `test/gate-f6.test.js`

Este documento describe los contratos **tal como quedaron implementados** y es la fuente de verdad para la Fase 7 (dashboard y reportes), que podrá leer existencias, existencias bajas y movimientos por evento.

---

## 1. Alcance

| Entidad | Tabla | Módulo | Pantallas |
|---|---|---|---|
| Categorías de artículos | `inventory_categories` | `INVENTARIO` | `#inventario-catalogos?tab=categorias` |
| Centros de acopio | `collection_centers` | `INVENTARIO` | `#inventario-catalogos?tab=centros` |
| Artículos (insumos, mobiliario, materiales) | `inventory_items` | `INVENTARIO` | `#inventario`, `#articulo/<id>` |
| Movimientos (entradas, salidas, traspasos, anulaciones) | `inventory_movements` | `INVENTARIO` | `#movimientos`, kardex de `#articulo/<id>` |

También: **Inicio** avisa "N artículos por debajo de su existencia mínima" a quien tiene `INVENTARIO`.

**Fuera de alcance (ADR-0006):** los regalos de las cartas (su estatus en Cartas es la única fuente de verdad). También: cantidades decimales, autorizaciones de salida, códigos de barras de artículos, costos y valuación del inventario, inventarios físicos programados (se capturan como ajuste).

## 2. Modelo de datos — migración 6

| Tabla | Columnas principales | Restricciones e índices |
|---|---|---|
| `inventory_categories` | `name`, `name_key`, `description`, `is_active`, `created_by_id`, fechas | `UNIQUE(name_key)` |
| `collection_centers` | `name`, `name_key`, `address`, `contact_name`, `contact_phone`, `notes`, `is_active`, `created_by_id`, fechas | `UNIQUE(name_key)` |
| `inventory_items` | `name`, `name_key`, `category_id → inventory_categories` (`RESTRICT`), `unit` (`PIEZA`, `PAR`, `JUEGO`, `CAJA`, `PAQUETE`, `BOLSA`, `KILOGRAMO`, `LITRO`), `min_stock` (≥ 0; 0 = sin aviso), `description`, `is_active`, `created_by_id`, fechas | `UNIQUE(category_id, name_key)`, índice `(name_key)` |
| `inventory_movements` | `item_id → inventory_items` (`RESTRICT`), `center_id → collection_centers` (`RESTRICT`), `direction` (`ENTRADA`, `SALIDA`), `reason` (ver §3.2), `quantity` (entero > 0), `movement_date` (`YYYY-MM-DD` local), `event_id → events` (`SET NULL`), `counterpart`, `notes`, `search_key`, `transfer_id`, `reverses_id → inventory_movements`, `created_by_id`, `created_at` | `CHECK (reason = 'ANULACION') = (reverses_id IS NOT NULL)`, `CHECK (reason = 'TRASPASO') = (transfer_id IS NOT NULL)`, `UNIQUE(reverses_id)`; índices `(item_id, center_id, movement_date, id)`, `(center_id, item_id)`, `(movement_date, id)`, `(event_id)`; disparadores: sin `UPDATE` y sin salida que deje la existencia del centro en negativo |

**Existencia** = `SUM(CASE direction WHEN 'ENTRADA' THEN quantity ELSE -quantity END)` por artículo y centro. No hay columna de existencias.

La migración siembra seis **categorías sugeridas** (editables): Juguetes donados (sin carta), Bolsas y empaques, Mobiliario, Papelería y materiales, Alimentos y bebidas, Limpieza e higiene.

## 3. Reglas de negocio

### 3.1 Catálogos y artículos

1. Nombres únicos sin distinguir acentos ni mayúsculas: categoría y centro → `409 DUPLICATE_CATEGORY` / `DUPLICATE_CENTER`; artículo, por categoría → `409 DUPLICATE_ITEM` (con `existing_id`).
2. Nada se borra: `PATCH { is_active: false }`. Una categoría dada de baja no se asigna a artículos nuevos (`422`); un centro o artículo dado de baja no recibe movimientos (`422`).
3. Un centro o un artículo **con existencias** no se da de baja → `409 CENTER_HAS_STOCK` / `ITEM_HAS_STOCK`.
4. La unidad de un artículo con movimientos no cambia → `400 ITEM_UNIT_LOCKED`.
5. `min_stock` > 0 activa el aviso **existencia baja** cuando el total (todos los centros) es menor.

### 3.2 Movimientos

| `type` en la captura | Filas que crea | Motivos (`reason`) |
|---|---|---|
| `ENTRADA` | 1 entrada por línea | `DONACION`, `COMPRA`, `DEVOLUCION`, `AJUSTE`, `OTRO` (obligatorio) |
| `SALIDA` | 1 salida por línea | `USO_EVENTO`, `ENTREGA`, `MERMA`, `AJUSTE`, `OTRO` (obligatorio) |
| `TRASPASO` | salida en `center_id` + entrada en `to_center_id`, mismo `transfer_id` | `TRASPASO` (lo pone el sistema; enviar `reason` → `422`) |
| (anulación) | el movimiento contrario de cada fila anulada | `ANULACION` (lo pone el sistema) |

1. Cabecera: `center_id` (activo), `movement_date` (por defecto hoy; **nunca futura** → `422`), `event_id` opcional (existente; cerrado → `400 EVENT_CLOSED`), `counterpart` (≤ 150: donante, proveedor o a quién se entregó), `notes` (≤ 500).
2. `lines`: 1–50 `{ item_id, quantity }` (entero 1–1 000 000; artículo activo; sin repetir artículo). Errores por línea: `lines[i].item_id`, `lines[i].quantity`.
3. **Todo o nada:** si una línea falla, no se guarda ninguna.
4. **Gate — salida mayor a la existencia:** para una salida (o el origen de un traspaso) con fecha *d*, lo disponible es `min(saldo al cierre de d, saldo mínimo posterior a d)` en ese centro. Si `quantity > disponible`:
   ```jsonc
   { "error": "Solo hay 10 piezas de \"Silla plegable\" en Oficina Centro; quieres sacar 11.",
     "code": "INSUFFICIENT_STOCK", "item_id": 3, "center_id": 1, "requested": 11, "available": 10,
     "current_stock": 10, "line": 0 }
   ```
   Cuando lo disponible es menor que la existencia actual (por una fecha atrasada), el mensaje agrega "(en fechas posteriores ya se usaron)".
5. Revisión y guardado en una transacción `IMMEDIATE`: dos salidas simultáneas que juntas superan la existencia → una `201` y otra `409`.

### 3.3 Anulación

`POST /inventory/movements/:id/reverse { reason }` (5–500 caracteres):

- Crea el contra-movimiento con fecha de hoy, `reason = 'ANULACION'`, `reverses_id` y `notes = reason`; si es un traspaso, anula sus dos filas.
- Ya anulado → `409 MOVEMENT_ALREADY_REVERSED` (`reversed_by_id`); anular una anulación → `400 CANNOT_REVERSE_REVERSAL`; solo quien lo registró o un ADMIN → si no, `403 FORBIDDEN`; artículo o centro dado de baja → `400 ITEM_INACTIVE` / `CENTER_INACTIVE`.
- Anular una entrada cuya existencia ya se usó → `409 INSUFFICIENT_STOCK`.

### 3.4 Kardex

Movimientos de un artículo (todos los centros o uno) en orden `movement_date, id`, con `in`, `out` y `balance` (saldo acumulado). Con `date_from` / `date_to` se calculan `opening_balance` (antes del periodo), `total_in`, `total_out` y `closing_balance` (al cierre del periodo); siempre `opening + in − out = closing`, y sin fechas `closing_balance = current_stock` = existencia del artículo (o del centro).

### 3.5 Permisos

`/api/inventory` con `requireModule('INVENTARIO')`. Los selectores (centros, categorías, eventos) salen de `GET /inventory/options`, así que no se necesita el módulo `EVENTOS`.

## 4. API (base `/api/inventory`)

| Método y ruta | Respuesta | Errores |
|---|---|---|
| `GET /summary` | `{ items, with_stock, low_stock, centers }` (activos) | |
| `GET /options` | `{ categories, centers, events }` (activos / no cerrados) | |
| `GET /categories?search&is_active&page&page_size` · `POST /categories` · `GET` / `PATCH /categories/:id` | paginado (50) · `201 { category }` · `{ category }` | `409 DUPLICATE_CATEGORY`, `404`, `422` |
| `GET /centers?…` · `POST /centers` · `GET` / `PATCH /centers/:id` | paginado (50) · `201 { center }` · `{ center }` | `409 DUPLICATE_CENTER`, `409 CENTER_HAS_STOCK`, `404`, `422` |
| `GET /items?search&category_id&center_id&is_active&stock(con\|sin\|bajo)&order_by(name\|-name\|stock\|-stock\|category\|-updated_at)&page&page_size` | paginado de `ItemListItem` | `422` |
| `GET /items/export` (mismos filtros) | CSV: una fila por artículo y centro con existencia ≠ 0 | |
| `POST /items` · `GET` / `PATCH /items/:id` | `201 { item }` · `{ item }` (+ `stock_by_center`) | `409 DUPLICATE_ITEM`, `409 ITEM_HAS_STOCK`, `400 ITEM_UNIT_LOCKED`, `404`, `422` |
| `GET /items/:id/kardex?center_id&date_from&date_to&order(asc\|desc)&page&page_size` | `Kardex` | `404`, `422` |
| `GET /items/:id/kardex/export?center_id&date_from&date_to` | CSV del kardex | `404` |
| `GET /movements?item_id&center_id&direction&reason(repetible)&event_id&date_from&date_to&search&mine&page` | paginado de `MovementOut` (más reciente primero) | `422` |
| `POST /movements` | `201 { movements: MovementOut[] }` | `409 INSUFFICIENT_STOCK`, `400 EVENT_CLOSED`, `422` |
| `GET /movements/:id` | `{ movement }` | `404` |
| `POST /movements/:id/reverse` | `201 { movements }` | `409 MOVEMENT_ALREADY_REVERSED`, `400 CANNOT_REVERSE_REVERSAL`, `403 FORBIDDEN`, `409 INSUFFICIENT_STOCK`, `422` |

```jsonc
// ItemListItem (con center_id: center_stock es la existencia en ese centro; si no, null)
{ "id": 3, "name": "Silla plegable", "category": { "id": 2, "name": "Mobiliario", "is_active": true }, "unit": "PIEZA",
  "min_stock": 50, "description": null, "is_active": true, "total_stock": 37, "center_stock": null, "low_stock": true,
  "centers_count": 2, "movements_count": 5, "last_movement_date": "2026-11-02", "created_at": "…", "updated_at": "…" }
// ItemOut = ItemListItem (sin center_stock) + stock_by_center: [{ center: { id, name, is_active }, stock, last_movement_date }]
// MovementOut
{ "id": 9, "item": { "id": 3, "name": "Silla plegable", "unit": "PIEZA", "is_active": true },
  "movement_date": "2026-10-28", "direction": "SALIDA", "reason": "USO_EVENTO", "quantity": 20,
  "center": { "id": 2, "name": "Bodega Norte", "is_active": true }, "peer_center": null,
  "event": { "id": 1, "name": "Navidad 2026" }, "counterpart": null, "notes": null,
  "transfer_id": null, "reverses_id": null, "reversed_by_id": null,
  "created_by": { "id": 1, "full_name": "Isaac Galeana" }, "created_at": "…" }
// Kardex
{ "item": { … }, "center": { … } | null, "opening_balance": 0, "total_in": 85, "total_out": 48, "closing_balance": 37,
  "current_stock": 37, "items": [ MovementOut sin item + { "in": 0, "out": 20, "balance": 40 } ], "total", "page", "page_size", "pages" }
```

## 5. Bitácora

| Acción | `entity` | `detail` |
|---|---|---|
| `RECORD_CREATED` / `RECORD_UPDATED` / `RECORD_DEACTIVATED` / `RECORD_ACTIVATED` | `inventory_categories`, `collection_centers`, `inventory_items` | `null` / `{ changed }` |
| `INVENTORY_MOVEMENT_CREATED` — Movimiento de inventario registrado (una fila por artículo) | `inventory_items` | `{ movement_ids, type, reason, quantity, center_id, to_center_id?, event_id? }` |
| `INVENTORY_MOVEMENT_REVERSED` — Movimiento de inventario anulado | `inventory_items` | `{ reversed_ids, reversal_ids }` |
| `DATA_EXPORTED` | `inventory_items` (existencias) · `inventory_movements` (kardex) | `{ format, count, filters }` (el texto buscado se guarda como `true`) |

No se guardan donantes, notas ni motivos de anulación (pueden contener nombres de personas).

## 6. Pantallas

- **Inventario (`#inventario`):** tarjetas de resumen (artículos activos, con existencia, existencia baja, centros); filtros por texto, categoría, centro, existencia (con / sin / baja) y estado; por artículo: existencia (total o en el centro elegido) con insignias, unidad, centros, último movimiento y botones **Entrada · Salida · Kardex**. Acciones: Registrar movimiento, Nuevo artículo, Exportar CSV. Si no hay centros, un aviso lleva a registrarlos.
- **Registrar movimiento (diálogo):** selector Entrada | Salida | Traspaso; centro (y destino), motivo, fecha (no futura), **varios artículos** buscando por nombre (muestra cuánto hay en el centro y marca en rojo si la cantidad lo supera), evento, donante / "entregado a" y notas. Un `409 INSUFFICIENT_STOCK` aparece bajo la línea que falló.
- **Artículo (`#articulo/<id>`):** existencia total y por centro, datos y acciones (Entrada, Salida, Traspaso, Editar, Dar de baja); **kardex** con filtros por centro y fechas, totales (saldo inicial, entradas, salidas, saldo final), saldo por renglón, "Anular" y exportación CSV.
- **Movimientos (`#movimientos`):** libro completo con filtros por texto (artículo, donante, notas), tipo, motivo, centro, fechas y "Solo yo"; anulados y anulaciones marcados.
- **Centros y categorías (`#inventario-catalogos`):** pestañas; alta y edición en diálogo, baja lógica (un centro con existencias ofrece ir a sus existencias), enlaces a sus artículos.

## 7. Verificación

```powershell
npm test               # incluye test/gate-f6.test.js y test/inventory.test.js
npm run empaquetar     # la prueba de humo agrega: centros, artículo, entrada, salida > existencia → 409, traspaso, kardex = existencia, CSV
```

**Guion de demostración (8 min):** como Ana (solo Inventario) → Inicio sin aviso → Centros y categorías: registrar "Oficina Centro" y "Bodega Norte" → Inventario: nuevo artículo "Silla plegable" (Mobiliario, pieza, mínimo 50) → Registrar movimiento: entrada por donación de 60 sillas y 40 bolsas en una sola captura → Traspaso de 25 sillas a Bodega Norte → Salida de 30 sillas de Bodega Norte: aparece "Solo hay 25 piezas…" bajo la línea → corregir a 20, ligar a "Navidad 2026" → abrir el artículo: existencia 40 (35 + 5), kardex con saldos → filtrar por Bodega Norte → anular la salida con motivo → existencia baja en Inicio → como ADMIN, ver todo en la Bitácora → vista a 360 px en tema oscuro.

## 8. Pendientes para la directiva

- Lista definitiva de **categorías** (hay seis sugeridas) y **centros de acopio** reales.
- ¿Las salidas o los ajustes requieren autorización de un administrador?
- ¿Hace falta manejar **decimales** (kg, litros) o costos / valuación?
- ¿Quieren ver los **regalos de las cartas** en un reporte de inventario? (ADR-0006 §3: sería una vista de solo lectura sobre `letters`).
