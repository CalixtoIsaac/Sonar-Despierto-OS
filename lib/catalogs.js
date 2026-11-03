/**
 * Catálogos de las Fases 3 (personas), 4 (eventos y cartas), 5 (calendario) y 6 (inventario). Espejo en el navegador: public/js/catalogos.js.
 * Los valores se guardan en la BD (TEXT + CHECK); las etiquetas son para pantalla y CSV.
 */
const SHIRT_SIZES = Object.freeze(['XS', 'S', 'M', 'L', 'XL', 'XXL']);

const VOLUNTEER_AREAS = Object.freeze([
  'LOGISTICA', 'GUIA_NINOS', 'ACOPIO_REGALOS', 'REGISTRO', 'ALIMENTOS', 'FOTOGRAFIA', 'PADRINO', 'OTRO'
]);
const VOLUNTEER_AREA_LABELS = Object.freeze({
  LOGISTICA: 'Logística',
  GUIA_NINOS: 'Guía de niñas y niños',
  ACOPIO_REGALOS: 'Acopio de regalos',
  REGISTRO: 'Registro',
  ALIMENTOS: 'Alimentos',
  FOTOGRAFIA: 'Fotografía',
  PADRINO: 'Padrino o madrina',
  OTRO: 'Otra'
});

const GENDERS = Object.freeze(['NINA', 'NINO', 'OTRO', 'NO_ESPECIFICA']);
const GENDER_LABELS = Object.freeze({ NINA: 'Niña', NINO: 'Niño', OTRO: 'Otro', NO_ESPECIFICA: 'No especifica' });

// Fase 4 — eventos y cartas (ADR-0011)
const EVENT_TYPES = Object.freeze(['NAVIDAD', 'DIA_DEL_NINO', 'OTRO']);
const EVENT_TYPE_LABELS = Object.freeze({ NAVIDAD: 'Navidad', DIA_DEL_NINO: 'Día del Niño', OTRO: 'Otro' });
// El orden es el del ciclo de vida: avanzar = ir a un índice mayor
const EVENT_STATUSES = Object.freeze(['BORRADOR', 'ABIERTO', 'EN_CURSO', 'CERRADO']);
const EVENT_STATUS_LABELS = Object.freeze({ BORRADOR: 'Borrador', ABIERTO: 'Abierto', EN_CURSO: 'En curso', CERRADO: 'Cerrado' });
const PARTICIPATION_STATUSES = Object.freeze(['POSTULADO', 'CONFIRMADO', 'RECHAZADO', 'CANCELADO']);
const PARTICIPATION_STATUS_LABELS = Object.freeze({
  POSTULADO: 'Postulado', CONFIRMADO: 'Confirmado', RECHAZADO: 'Rechazado', CANCELADO: 'Cancelado'
});
const LETTER_STATUSES = Object.freeze(['PENDIENTE', 'ASIGNADO', 'RECIBIDO', 'ENTREGADO']);
const LETTER_STATUS_LABELS = Object.freeze({
  PENDIENTE: 'Pendiente', ASIGNADO: 'Con padrino', RECIBIDO: 'Regalo recibido', ENTREGADO: 'Entregado'
});
const LETTER_EVENT_TYPES = Object.freeze(['NAVIDAD']); // tipos de evento que aceptan cartas
const DEFAULT_LETTERS_PER_SPONSOR = 3;
const MAX_LETTERS_PER_SPONSOR = 20;

// Fase 5 — calendario de actividades (ADR-0012)
const ACTIVITY_TYPES = Object.freeze(['JUNTA', 'CAPACITACION', 'ACOPIO', 'EVENTO', 'OTRO']);
const ACTIVITY_TYPE_LABELS = Object.freeze({
  JUNTA: 'Junta', CAPACITACION: 'Capacitación', ACOPIO: 'Acopio', EVENTO: 'Evento', OTRO: 'Otra'
});
const ACTIVITY_STATUSES = Object.freeze(['PROGRAMADA', 'REALIZADA', 'CANCELADA']);
const ACTIVITY_STATUS_LABELS = Object.freeze({ PROGRAMADA: 'Programada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada' });
const ACTIVITY_MAX_RANGE_DAYS = 92;     // rango máximo de GET /activities (una vista mensual usa 42)
const ACTIVITY_LIST_LIMIT = 500;        // máximo de actividades por consulta del calendario
const ACTIVITY_MAX_VOLUNTEERS = 200;

// Fase 6 — inventario (ADR-0006, ADR-0013). Cantidades enteras: la unidad dice qué se cuenta.
const INVENTORY_UNITS = Object.freeze(['PIEZA', 'PAR', 'JUEGO', 'CAJA', 'PAQUETE', 'BOLSA', 'KILOGRAMO', 'LITRO']);
const INVENTORY_UNIT_LABELS = Object.freeze({
  PIEZA: 'Pieza', PAR: 'Par', JUEGO: 'Juego', CAJA: 'Caja', PAQUETE: 'Paquete', BOLSA: 'Bolsa', KILOGRAMO: 'Kilogramo', LITRO: 'Litro'
});
const MOVEMENT_DIRECTIONS = Object.freeze(['ENTRADA', 'SALIDA']);
const MOVEMENT_DIRECTION_LABELS = Object.freeze({ ENTRADA: 'Entrada', SALIDA: 'Salida' });
// Motivos que la persona elige; TRASPASO y ANULACION los pone el sistema
const ENTRY_REASONS = Object.freeze(['DONACION', 'COMPRA', 'DEVOLUCION', 'AJUSTE', 'OTRO']);
const EXIT_REASONS = Object.freeze(['USO_EVENTO', 'ENTREGA', 'MERMA', 'AJUSTE', 'OTRO']);
const SYSTEM_REASONS = Object.freeze(['TRASPASO', 'ANULACION']);
const MOVEMENT_REASONS = Object.freeze([...new Set([...ENTRY_REASONS, ...EXIT_REASONS, ...SYSTEM_REASONS])]);
const MOVEMENT_REASON_LABELS = Object.freeze({
  DONACION: 'Donación', COMPRA: 'Compra', DEVOLUCION: 'Devolución', USO_EVENTO: 'Uso en evento',
  ENTREGA: 'Entrega a beneficiarios', MERMA: 'Merma o daño', AJUSTE: 'Ajuste por conteo', OTRO: 'Otro',
  TRASPASO: 'Traspaso entre centros', ANULACION: 'Anulación'
});
const MOVEMENT_TYPES = Object.freeze(['ENTRADA', 'SALIDA', 'TRASPASO']); // lo que se captura en POST /inventory/movements
const INVENTORY_MAX_QUANTITY = 1000000;
const INVENTORY_MAX_LINES = 50;          // artículos por captura
const INVENTORY_DEFAULT_CATEGORIES = Object.freeze([
  'Juguetes donados (sin carta)', 'Bolsas y empaques', 'Mobiliario', 'Papelería y materiales', 'Alimentos y bebidas', 'Limpieza e higiene'
]);

// Edades permitidas
const CHILD_MAX_AGE = 17;
const VOLUNTEER_MIN_AGE = 15;

module.exports = {
  SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_AREA_LABELS, GENDERS, GENDER_LABELS, CHILD_MAX_AGE, VOLUNTEER_MIN_AGE,
  EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_STATUSES, EVENT_STATUS_LABELS, PARTICIPATION_STATUSES, PARTICIPATION_STATUS_LABELS,
  LETTER_STATUSES, LETTER_STATUS_LABELS, LETTER_EVENT_TYPES, DEFAULT_LETTERS_PER_SPONSOR, MAX_LETTERS_PER_SPONSOR,
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, ACTIVITY_STATUSES, ACTIVITY_STATUS_LABELS, ACTIVITY_MAX_RANGE_DAYS,
  ACTIVITY_LIST_LIMIT, ACTIVITY_MAX_VOLUNTEERS,
  INVENTORY_UNITS, INVENTORY_UNIT_LABELS, MOVEMENT_DIRECTIONS, MOVEMENT_DIRECTION_LABELS, ENTRY_REASONS, EXIT_REASONS,
  SYSTEM_REASONS, MOVEMENT_REASONS, MOVEMENT_REASON_LABELS, MOVEMENT_TYPES, INVENTORY_MAX_QUANTITY, INVENTORY_MAX_LINES,
  INVENTORY_DEFAULT_CATEGORIES
};
