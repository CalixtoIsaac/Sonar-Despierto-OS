/**
 * Teléfonos de 10 dígitos (México). Espejo de normalizePhone en lib/validation.js.
 */
const Phone = (() => {
  /** Quita espacios, guiones, puntos y paréntesis. */
  const normalize = (raw) => String(raw ?? '').replace(/[\s\-.()]/g, '');
  const isValid = (raw) => /^\d{10}$/.test(normalize(raw));
  /** '2291234567' → '229 123 4567' (cualquier otro texto se devuelve igual). */
  function format(raw) {
    const n = normalize(raw);
    return /^\d{10}$/.test(n) ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : String(raw ?? '');
  }
  return { normalize, isValid, format };
})();

if (typeof module !== 'undefined') module.exports = Phone;
