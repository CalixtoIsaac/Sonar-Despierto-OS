# ADR-0014: Dashboard con conteos calculados al momento, sin datos personales y Excel sin dependencias

- **Estado:** Aceptado
- **Fecha:** 2026-11-05
- **Decisores:** Equipo de desarrollo (aprobado por Isaac Galeana)
- **Relacionado con:** ADR-0004 (módulo `REPORTES`), ADR-0006, ADR-0009, ADR-0010, ADR-0011, ADR-0013, `fases/Fase_7_Contratos.md`

## Contexto

La Fase 7 entrega el dashboard de la coordinación (P05) y la exportación a Excel. El Gate exige que *las cifras del dashboard coincidan con consultas SQL de control*. La información viene de cuatro módulos (personas, cartas, calendario, inventario) con permisos distintos, y la de niñas y niños solo se ve con `BENEFICIARIOS`. El programa corre sin internet en una PC de la oficina y se entrega como paquete portátil; los requerimientos piden "gráficas en tiempo real" y exportar a Excel.

## Decisión

1. **Calcular al momento:** cada indicador es una consulta sobre las tablas de las Fases 3–6 en la petición; no hay tablas de resumen, caché ni migración nueva. La pantalla se refresca cada 60 s mientras está visible.
2. **Solo conteos, un solo módulo:** `/api/reports` (módulo `REPORTES`) devuelve cifras agregadas y nombres de escuelas, eventos, actividades y artículos, nunca datos de personas. Así basta `REPORTES` para verlo, sin abrir `BENEFICIARIOS`. Los avisos enlazan a los listados con nombres solo si la persona tiene ese módulo.
3. **Definiciones únicas** en `services/reports.js` (ver contratos §2): pantalla, API y Excel usan los mismos números; el Excel se construye con la respuesta del mismo servicio.
4. **Avance semanal reconstruido del historial** (`letter_status_history`, solo inserción): estatus de las cartas al cierre de cada semana local; el último punto debe ser igual al estatus actual (se prueba).
5. **Inventario por evento** a partir del libro de movimientos: sin traspasos y restando anulaciones.
6. **Excel propio (`lib/xlsx.js`)**: Office Open XML mínimo con `zlib` de Node (sin paquetes nuevos que instalar en la PC de destino), solo valores (sin fórmulas → sin inyección de fórmulas), tipos numéricos y de porcentaje reales. Cada exportación queda en la bitácora (`DATA_EXPORTED`, `entity = events`).
7. **Gráficas con HTML y CSS** (sin Recharts ni Chart.js): barras segmentadas, columnas apiladas y anillos con `conic-gradient`, con tokens del tema y texto accesible.

## Consecuencias

- ✅ Gate cumplido y probado (`test/gate-f7.test.js`): cada cifra de la API y del Excel coincide con una consulta SQL independiente.
- ✅ Nada que sincronizar: una carta registrada aparece en el siguiente refresco.
- ✅ Sin dependencias nuevas; el paquete portátil no cambia de tamaño.
- ⚠️ Con decenas de miles de cartas las consultas siguen siendo rápidas (hay índices por evento y estatus); si el avance semanal crece mucho se limita a 26 semanas.
- ⚠️ El generador de Excel cubre lo que usamos (texto, números, porcentajes, varias tablas por hoja); fórmulas, gráficas dentro del Excel o celdas combinadas no están soportadas.
- ⚠️ Quien tenga `REPORTES` ve conteos de todos los módulos; la directiva decide a quién se le asigna.

## Alternativas consideradas

- **Tablas de resumen actualizadas con disparadores:** más rápido con volúmenes grandes, pero agrega estado que puede descuadrarse y complica el Gate.
- **Exigir los módulos de origen para cada bloque:** obligaría a dar `BENEFICIARIOS` (datos de menores) a quien solo necesita cifras.
- **`exceljs` o SheetJS:** completos, pero agregan dependencias grandes al paquete portátil; CSV no permite varias hojas ni formatos de porcentaje.
- **Recharts / Chart.js:** el frontend es sin frameworks (ADR-0009) y debe funcionar sin CDN; las gráficas necesarias son simples.
