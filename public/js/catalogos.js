/**
 * Catálogos de personas (F3) y de eventos y cartas (F4) del lado del navegador.
 * Espejo de lib/catalogs.js (lo verifica una prueba).
 */
const Catalogos = (() => {
  const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const VOLUNTEER_AREAS = ['LOGISTICA', 'GUIA_NINOS', 'ACOPIO_REGALOS', 'REGISTRO', 'ALIMENTOS', 'FOTOGRAFIA', 'PADRINO', 'OTRO'];
  const VOLUNTEER_AREA_LABEL = {
    LOGISTICA: 'Logística',
    GUIA_NINOS: 'Guía de niñas y niños',
    ACOPIO_REGALOS: 'Acopio de regalos',
    REGISTRO: 'Registro',
    ALIMENTOS: 'Alimentos',
    FOTOGRAFIA: 'Fotografía',
    PADRINO: 'Padrino o madrina',
    OTRO: 'Otra'
  };
  const GENDERS = ['NINA', 'NINO', 'OTRO', 'NO_ESPECIFICA'];
  const GENDER_LABEL = { NINA: 'Niña', NINO: 'Niño', OTRO: 'Otro', NO_ESPECIFICA: 'No especifica' };
  const CHILD_MAX_AGE = 17;
  const VOLUNTEER_MIN_AGE = 15;

  // Fase 4 — eventos y cartas
  const EVENT_TYPES = ['NAVIDAD', 'DIA_DEL_NINO', 'OTRO'];
  const EVENT_TYPE_LABEL = { NAVIDAD: 'Navidad', DIA_DEL_NINO: 'Día del Niño', OTRO: 'Otro' };
  const EVENT_STATUSES = ['BORRADOR', 'ABIERTO', 'EN_CURSO', 'CERRADO'];
  const EVENT_STATUS_LABEL = { BORRADOR: 'Borrador', ABIERTO: 'Abierto', EN_CURSO: 'En curso', CERRADO: 'Cerrado' };
  const PARTICIPATION_STATUSES = ['POSTULADO', 'CONFIRMADO', 'RECHAZADO', 'CANCELADO'];
  const PARTICIPATION_STATUS_LABEL = { POSTULADO: 'Postulado', CONFIRMADO: 'Confirmado', RECHAZADO: 'Rechazado', CANCELADO: 'Cancelado' };
  const LETTER_STATUSES = ['PENDIENTE', 'ASIGNADO', 'RECIBIDO', 'ENTREGADO'];
  const LETTER_STATUS_LABEL = { PENDIENTE: 'Pendiente', ASIGNADO: 'Con padrino', RECIBIDO: 'Regalo recibido', ENTREGADO: 'Entregado' };
  const LETTER_EVENT_TYPES = ['NAVIDAD'];
  const DEFAULT_LETTERS_PER_SPONSOR = 3;
  const MAX_LETTERS_PER_SPONSOR = 20;

  // Filtro "estado" de los listados de personas → is_active de la API
  const ESTADO_OPTIONS = [['', 'Activos'], ['inactivos', 'Dados de baja'], ['todos', 'Todos']];
  const estadoToActive = (estado) => (estado === 'inactivos' ? 'false' : (estado === 'todos' ? undefined : 'true'));

  return {
    SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_AREA_LABEL, GENDERS, GENDER_LABEL, CHILD_MAX_AGE, VOLUNTEER_MIN_AGE,
    EVENT_TYPES, EVENT_TYPE_LABEL, EVENT_STATUSES, EVENT_STATUS_LABEL, PARTICIPATION_STATUSES, PARTICIPATION_STATUS_LABEL,
    LETTER_STATUSES, LETTER_STATUS_LABEL, LETTER_EVENT_TYPES, DEFAULT_LETTERS_PER_SPONSOR, MAX_LETTERS_PER_SPONSOR,
    ESTADO_OPTIONS, estadoToActive
  };
})();

if (typeof module !== 'undefined') module.exports = Catalogos;
