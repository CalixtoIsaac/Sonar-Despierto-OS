/**
 * Catálogos de personas del lado del navegador. Espejo de lib/catalogs.js (lo verifica una prueba).
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

  // Filtro "estado" de los listados de personas → is_active de la API
  const ESTADO_OPTIONS = [['', 'Activos'], ['inactivos', 'Dados de baja'], ['todos', 'Todos']];
  const estadoToActive = (estado) => (estado === 'inactivos' ? 'false' : (estado === 'todos' ? undefined : 'true'));

  return {
    SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_AREA_LABEL, GENDERS, GENDER_LABEL, CHILD_MAX_AGE, VOLUNTEER_MIN_AGE,
    ESTADO_OPTIONS, estadoToActive
  };
})();

if (typeof module !== 'undefined') module.exports = Catalogos;
