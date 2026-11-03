/**
 * Catálogos de personas (F3), de eventos y cartas (F4), del calendario (F5) y del inventario (F6) del lado del navegador.
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

  // Fase 5 — calendario de actividades (ADR-0012)
  const ACTIVITY_TYPES = ['JUNTA', 'CAPACITACION', 'ACOPIO', 'EVENTO', 'OTRO'];
  const ACTIVITY_TYPE_LABEL = { JUNTA: 'Junta', CAPACITACION: 'Capacitación', ACOPIO: 'Acopio', EVENTO: 'Evento', OTRO: 'Otra' };
  const ACTIVITY_STATUSES = ['PROGRAMADA', 'REALIZADA', 'CANCELADA'];
  const ACTIVITY_STATUS_LABEL = { PROGRAMADA: 'Programada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada' };
  const ACTIVITY_MAX_RANGE_DAYS = 92;

  // Fase 6 — inventario (ADR-0013)
  const INVENTORY_UNITS = ['PIEZA', 'PAR', 'JUEGO', 'CAJA', 'PAQUETE', 'BOLSA', 'KILOGRAMO', 'LITRO'];
  const INVENTORY_UNIT_LABEL = {
    PIEZA: 'Pieza', PAR: 'Par', JUEGO: 'Juego', CAJA: 'Caja', PAQUETE: 'Paquete', BOLSA: 'Bolsa', KILOGRAMO: 'Kilogramo', LITRO: 'Litro'
  };
  // Plural corto para mostrar cantidades: "12 piezas", "3 kg"
  const INVENTORY_UNIT_PLURAL = {
    PIEZA: 'piezas', PAR: 'pares', JUEGO: 'juegos', CAJA: 'cajas', PAQUETE: 'paquetes', BOLSA: 'bolsas', KILOGRAMO: 'kg', LITRO: 'litros'
  };
  const ENTRY_REASONS = ['DONACION', 'COMPRA', 'DEVOLUCION', 'AJUSTE', 'OTRO'];
  const EXIT_REASONS = ['USO_EVENTO', 'ENTREGA', 'MERMA', 'AJUSTE', 'OTRO'];
  const MOVEMENT_REASON_LABEL = {
    DONACION: 'Donación', COMPRA: 'Compra', DEVOLUCION: 'Devolución', USO_EVENTO: 'Uso en evento',
    ENTREGA: 'Entrega a beneficiarios', MERMA: 'Merma o daño', AJUSTE: 'Ajuste por conteo', OTRO: 'Otro',
    TRASPASO: 'Traspaso entre centros', ANULACION: 'Anulación'
  };
  const INVENTORY_MAX_QUANTITY = 1000000;
  const INVENTORY_MAX_LINES = 50;

  // Filtro "estado" de los listados de personas → is_active de la API
  const ESTADO_OPTIONS = [['', 'Activos'], ['inactivos', 'Dados de baja'], ['todos', 'Todos']];
  const estadoToActive = (estado) => (estado === 'inactivos' ? 'false' : (estado === 'todos' ? undefined : 'true'));

  return {
    SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_AREA_LABEL, GENDERS, GENDER_LABEL, CHILD_MAX_AGE, VOLUNTEER_MIN_AGE,
    EVENT_TYPES, EVENT_TYPE_LABEL, EVENT_STATUSES, EVENT_STATUS_LABEL, PARTICIPATION_STATUSES, PARTICIPATION_STATUS_LABEL,
    LETTER_STATUSES, LETTER_STATUS_LABEL, LETTER_EVENT_TYPES, DEFAULT_LETTERS_PER_SPONSOR, MAX_LETTERS_PER_SPONSOR,
    ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL, ACTIVITY_STATUSES, ACTIVITY_STATUS_LABEL, ACTIVITY_MAX_RANGE_DAYS,
    INVENTORY_UNITS, INVENTORY_UNIT_LABEL, INVENTORY_UNIT_PLURAL, ENTRY_REASONS, EXIT_REASONS, MOVEMENT_REASON_LABEL,
    INVENTORY_MAX_QUANTITY, INVENTORY_MAX_LINES,
    ESTADO_OPTIONS, estadoToActive
  };
})();

if (typeof module !== 'undefined') module.exports = Catalogos;
