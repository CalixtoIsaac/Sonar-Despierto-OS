# ADR-0013: Inventario como libro de movimientos — existencias por centro, anulaciones y salidas sin saldo negativo

- **Estado:** Aceptado (esquema base; categorías, centros y flujos pendientes de validar con la directiva)
- **Fecha:** 2026-11-02
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana)
- **Relacionado con:** ADR-0006 (inventario separado de las cartas), ADR-0009, ADR-0010, ADR-0011, `fases/Fase_6_Contratos.md`, `Modelo_Datos.md` §0.5

## Contexto

La Fase 6 implementa el Inventario que el ADR-0006 dejó definido a grandes rasgos: insumos, mobiliario y materiales (no los regalos de las cartas), con existencias **calculadas** de movimientos de entrada y salida y sin salidas que dejen existencias negativas. La hoja de ruta fija el Gate: *una salida mayor a la existencia se rechaza y el kardex cuadra con las existencias*. La directiva aún no entrega la lista de categorías, los centros de acopio ni los flujos, así que el esquema debe absorber esas reglas sin migraciones grandes. En la operación real los artículos están en **varios lugares** (oficina, bodegas, escuelas aliadas), se capturan donaciones de muchos artículos a la vez y a veces se registra días después de que ocurrió.

## Decisión

1. **Catálogos editables:** `inventory_categories` y `collection_centers` (nombre único sin acentos, baja lógica). La migración siembra seis categorías sugeridas que la directiva puede renombrar o dar de baja.
2. **Existencia por artículo y centro:** el artículo no pertenece a un centro (a diferencia del borrador del ADR-0006); cada movimiento lleva `center_id` y la existencia se calcula por par `(artículo, centro)`. Un mismo artículo puede estar en varios centros.
3. **Libro inmutable:** `inventory_movements` solo admite inserciones (disparador contra `UPDATE`, sin endpoint de borrado). Nada guarda la existencia: siempre es `SUM(entradas) − SUM(salidas)`.
4. **Correcciones por anulación:** un error se corrige con un contra-movimiento (`reason = 'ANULACION'`, `reverses_id`, fecha de hoy, motivo obligatorio). Se anula una sola vez (índice único sobre `reverses_id`), una anulación no se anula y solo puede anular quien registró el movimiento o un ADMIN. Así el kardex conserva el error y su corrección.
5. **Traspasos atómicos:** un traspaso son dos movimientos (`SALIDA` en el origen y `ENTRADA` en el destino, `reason = 'TRASPASO'`, mismo `transfer_id`) creados en la misma transacción; anular cualquiera de los dos anula ambos.
6. **Salida sin saldo negativo en ninguna fecha:** la cantidad disponible para una salida con fecha *d* es `min(saldo al cierre de d, saldo mínimo de los movimientos posteriores a d)`. Así una salida capturada con fecha atrasada no puede dejar el kardex en negativo en un día intermedio. Si no alcanza → `409 INSUFFICIENT_STOCK` con `available`, `requested` y la línea que falló.
7. **Concurrencia:** la revisión y el guardado corren en una transacción `IMMEDIATE` (como ADR-0011 y ADR-0012): dos salidas simultáneas que juntas superan la existencia → una `201` y otra `409`. Además, un disparador de la BD rechaza cualquier salida que deje la existencia total del centro en negativo (defensa si alguien inserta por fuera de la API).
8. **Capturas de varias líneas:** `POST /inventory/movements` recibe 1–50 artículos con los mismos datos de cabecera (centro, motivo, fecha, evento, donante); se guardan todos o ninguno.
9. **Fechas locales y nunca futuras:** `movement_date` es `YYYY-MM-DD` de Veracruz (como ADR-0012). Una fecha futura → `422`.
10. **Cantidades enteras** con la unidad del artículo (pieza, par, juego, caja, paquete, bolsa, kilogramo, litro). La unidad no se cambia si el artículo ya tiene movimientos (`400 ITEM_UNIT_LOCKED`).
11. **Bajas protegidas:** no se da de baja un artículo o un centro con existencias (`409 ITEM_HAS_STOCK` / `CENTER_HAS_STOCK`); uno dado de baja no recibe movimientos nuevos.
12. **Motivos cerrados por tipo:** entradas (donación, compra, devolución, ajuste, otro) y salidas (uso en evento, entrega, merma, ajuste, otro); `TRASPASO` y `ANULACION` los pone el sistema. Vínculo opcional a un evento no cerrado.
13. **Bitácora por artículo:** `INVENTORY_MOVEMENT_CREATED` e `INVENTORY_MOVEMENT_REVERSED` con `entity = inventory_items` (para ver el historial desde la ficha del artículo); el detalle guarda ids, tipo, motivo, cantidad y centros, nunca el donante ni las notas.

## Consecuencias

- ✅ Gate cumplido y probado (`test/gate-f6.test.js`): salida mayor a la existencia → `409` sin guardar ninguna línea; el kardex (saldo final, por centro y por periodo) coincide con las existencias y con una consulta SQL de control.
- ✅ Las existencias no se pueden "editar a mano" ni descuadrar: solo cambian con movimientos auditados.
- ✅ La F7 puede leer existencias, existencias bajas (`min_stock`) y movimientos por evento sin cambios de esquema.
- ⚠️ Calcular existencias con `SUM` en cada consulta es suficiente para miles de movimientos; si crece mucho se puede agregar una tabla de saldos mantenida por disparadores sin cambiar la API.
- ⚠️ Sin cantidades decimales (kilogramos y litros se cuentan enteros). Si la directiva lo necesita, se agrega una escala por unidad.
- ⚠️ Pendiente de la directiva: categorías definitivas, centros de acopio, si las entradas o salidas requieren autorización y si quieren ver los regalos de cartas en un reporte (ADR-0006 §3).

## Alternativas consideradas

- **Columna `stock` editable en el artículo:** contradice el ADR-0006 y permite descuadres sin rastro.
- **Editar o borrar movimientos:** rompe el kardex y la bitácora; la anulación conserva la historia.
- **Artículo ligado a un solo centro:** obligaría a duplicar artículos por bodega y haría imposibles los traspasos.
- **Revisar solo la existencia actual al registrar una salida:** con fechas atrasadas dejaría saldos negativos en el kardex de días anteriores.
