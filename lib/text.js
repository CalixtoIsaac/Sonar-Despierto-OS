/**
 * Utilidades de texto para búsquedas y detección de duplicados (portables: se calculan en Node y se
 * guardan en columnas *_key, así no dependemos de funciones de acentos de cada motor de BD).
 */

/** "  José  Pérez-Núñez " → "jose perez-nunez" (sin acentos, minúsculas, espacios simples). */
function normalizeKey(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Palabras de una búsqueda ya normalizadas (máximo 6). */
function searchTokens(text) {
  return normalizeKey(text).split(' ').filter(Boolean).slice(0, 6);
}

/** Fecha de hoy (YYYY-MM-DD) en hora de Veracruz. */
function todayLocal(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

/** Edad cumplida (YYYY-MM-DD) a una fecha; null si no hay fecha. */
function ageOn(birthDate, onDate = todayLocal()) {
  if (!birthDate) return null;
  const [by, bm, bd] = String(birthDate).split('-').map(Number);
  const [ty, tm, td] = onDate.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

module.exports = { normalizeKey, searchTokens, todayLocal, ageOn };
