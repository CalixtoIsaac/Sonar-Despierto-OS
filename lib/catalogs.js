/**
 * Catálogos de la Fase 3 (personas). Espejo en el navegador: public/js/catalogos.js.
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

// Edades permitidas
const CHILD_MAX_AGE = 17;
const VOLUNTEER_MIN_AGE = 15;

module.exports = {
  SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_AREA_LABELS, GENDERS, GENDER_LABELS, CHILD_MAX_AGE, VOLUNTEER_MIN_AGE
};
