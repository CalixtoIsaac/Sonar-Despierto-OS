# ADR-0006: Inventario separado del ciclo de vida de las cartas

- **Estado:** Aceptado (el detalle del inventario sigue en definición por la directiva)
- **Fecha:** 2026-10-17
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana)
- **Relacionado con:** `PROJECT_CONTEXT.md` §3.2 y §3.4, `Modelo_Datos.md` §4.7–4.8 y §6

## Contexto

- La propuesta base de Inventario incluye controlar las cartas con estados "Recibido" y "Entregado".
- El módulo de Cartas ya tiene una **máquina de estados** (`PENDIENTE → ASIGNADO → RECIBIDO → ENTREGADO`) con historial inmutable (`letter_status_history`), cuyo objetivo de negocio es la **trazabilidad del 100 %** de los regalos.
- Llevar el mismo hecho en dos lugares (estatus de la carta y movimiento de inventario) produciría datos contradictorios.

## Decisión

1. **El estatus de la carta es la única fuente de verdad** sobre si un regalo fue recibido o entregado. Inventario **no** duplica ese estado.
2. El módulo de Inventario (Fase 6) cubre **insumos, mobiliario y materiales** (p. ej. bolsas, juguetes donados sin carta, mesas, sillas), con:
   - `inventory_items` (artículo, categoría, unidad, centro de acopio);
   - `inventory_movements` (entrada/salida, cantidad, fecha, responsable, notas);
   - existencias **calculadas** a partir de los movimientos (nunca editadas a mano); no se permiten salidas que dejen existencias negativas.
3. Si la directiva confirma que necesita ver regalos de cartas dentro del inventario, se hará con una **vista o reporte de solo lectura** sobre `letters` (o un movimiento generado automáticamente por la transición de estatus, nunca capturado a mano).
4. El esquema de Inventario se diseña con **categorías y centros de acopio como catálogos editables** para absorber las reglas que entregue la directiva sin migraciones grandes.

## Consecuencias

- ✅ Sin datos contradictorios; la trazabilidad de cartas no depende de capturas duplicadas.
- ✅ El inventario puede evolucionar libremente con las definiciones de la directiva.
- ⚠️ Antes de iniciar la Fase 6 se debe validar con la directiva la lista de categorías, los centros de acopio y los flujos de entrada y salida.

## Alternativas consideradas

- **Inventario como fuente de verdad de los regalos:** descartado; rompe la máquina de estados y el historial de cartas.
- **Doble captura:** descartado por inconsistencias.
