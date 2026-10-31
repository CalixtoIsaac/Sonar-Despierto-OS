/**
 * Catálogos de las Fases 3 (personas) y 4 (eventos y cartas). Espejo en el navegador: public/js/catalogos.js.
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

// Edades permitidas
const CHILD_MAX_AGE = 17;
const VOLUNTEER_MIN_AGE = 15;

module.exports = {
  SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_AREA_LABELS, GENDERS, GENDER_LABELS, CHILD_MAX_AGE, VOLUNTEER_MIN_AGE,
  EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_STATUSES, EVENT_STATUS_LABELS, PARTICIPATION_STATUSES, PARTICIPATION_STATUS_LABELS,
  LETTER_STATUSES, LETTER_STATUS_LABELS, LETTER_EVENT_TYPES, DEFAULT_LETTERS_PER_SPONSOR, MAX_LETTERS_PER_SPONSOR
};
