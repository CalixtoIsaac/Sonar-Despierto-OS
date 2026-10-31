/**
 * Validación de cuerpos de la API (Fase 2 en adelante). Acumula TODOS los errores del cuerpo y
 * responde un solo 422 con details: [{ field, message }].
 *
 *   const c = collect();
 *   const name = textField(req.body, 'first_name', { required: true, max: 80 }, c);
 *   c.throwIfAny();
 *
 * O con un esquema completo (rutas de la Fase 3):
 *   const data = validateFields(req.body, SCHEMA, { partial: true });   // PATCH
 */
const { validationError } = require('./errors');

const MSG = Object.freeze({
  required: 'Este campo es obligatorio.',
  max: (n) => `Máximo ${n} caracteres.`,
  phone: 'El teléfono debe tener 10 dígitos.',
  email: 'Escribe un correo electrónico válido.',
  notAllowed: 'Campo no permitido.',
  emptyBody: 'Envía al menos un campo para actualizar.',
  bool: 'Debe ser verdadero o falso.',
  option: 'Elige una opción válida.',
  date: 'Escribe una fecha válida (AAAA-MM-DD).',
  id: 'Identificador no válido.',
  text: 'Debe ser texto.',
  int: (min, max) => `Escribe un número entero entre ${min} y ${max}.`
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** null/'' → null; quita espacios, guiones, puntos y paréntesis; si no son 10 dígitos lanza Error. */
function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).replace(/[\s\-.()]/g, '');
  if (text === '') return null;
  if (!/^\d{10}$/.test(text)) throw new Error(MSG.phone);
  return text;
}

function isEmail(text) {
  return typeof text === 'string' && text.length <= 255 && EMAIL_RE.test(text);
}

/** 'YYYY-MM-DD' de calendario real. */
function isIsoDate(text) {
  const m = DATE_RE.exec(String(text ?? ''));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function parseId(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'string' && /^\d{1,15}$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return n > 0 ? n : null;
  }
  return null;
}

class Collector {
  constructor() { this.details = []; }
  add(field, message) {
    if (!this.details.some((d) => d.field === field)) this.details.push({ field, message });
  }
  has(field) { return this.details.some((d) => d.field === field); }
  get ok() { return this.details.length === 0; }
  throwIfAny() { if (this.details.length) throw validationError(this.details); }
}

const collect = () => new Collector();

/** Texto recortado o null. Acumula errores en c. */
function textField(body, name, { required = false, max = 255 } = {}, c = collect()) {
  const raw = body ? body[name] : undefined;
  if (raw === undefined || raw === null) {
    if (required) c.add(name, MSG.required);
    return null;
  }
  if (typeof raw !== 'string') { c.add(name, MSG.text); return null; }
  const text = raw.trim();
  if (!text) {
    if (required) c.add(name, MSG.required);
    return null;
  }
  if ([...text].length > max) { c.add(name, MSG.max(max)); return null; }
  return text;
}

/**
 * Valida un campo según su definición:
 *   { type: 'text'|'email'|'phone'|'date'|'enum'|'bool'|'id'|'int', required, max, values, message, check, min (int) }
 * check(value) → mensaje de error o null (reglas extra: rango de edad, etc.).
 */
function validateField(body, name, def, c) {
  const raw = body[name];
  const missing = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
  if (missing) {
    if (def.required) c.add(name, MSG.required);
    return def.type === 'bool' ? (def.default ?? null) : null;
  }
  let value;
  switch (def.type) {
    case 'text':
      value = textField(body, name, { required: def.required, max: def.max || 255 }, c);
      break;
    case 'email':
      value = typeof raw === 'string' ? raw.trim().toLowerCase() : null;
      if (!isEmail(value)) { c.add(name, MSG.email); return null; }
      break;
    case 'phone':
      try { value = normalizePhone(typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '-'); } catch {
        c.add(name, MSG.phone);
        return null;
      }
      if (value === null && def.required) c.add(name, MSG.required);
      break;
    case 'date':
      value = typeof raw === 'string' ? raw.trim() : '';
      if (!isIsoDate(value)) { c.add(name, MSG.date); return null; }
      break;
    case 'enum':
      value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
      if (!def.values.includes(value)) { c.add(name, def.message || MSG.option); return null; }
      break;
    case 'bool':
      if (typeof raw !== 'boolean') { c.add(name, MSG.bool); return null; }
      value = raw;
      break;
    case 'id':
      value = parseId(raw);
      if (value === null) { c.add(name, MSG.id); return null; }
      break;
    case 'int': {
      const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && /^-?\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : NaN);
      const min = def.min ?? 0;
      const max = def.max ?? 1e9;
      if (!Number.isInteger(n) || n < min || n > max) { c.add(name, def.message || MSG.int(min, max)); return null; }
      value = n;
      break;
    }
    default:
      throw new Error(`Tipo de campo desconocido: ${def.type}`);
  }
  if (value !== null && def.check && !c.has(name)) {
    const message = def.check(value);
    if (message) { c.add(name, message); return null; }
  }
  return value;
}

/**
 * Valida un cuerpo completo contra un esquema { campo: definición }.
 * - Campos desconocidos → 'Campo no permitido.'
 * - partial (PATCH): solo devuelve los campos presentes; ninguno → 'Envía al menos un campo…'.
 *   En PATCH, un campo obligatorio no puede venir vacío; uno opcional con null/'' se borra (null).
 * Devuelve { campo: valor } y lanza 422 con todos los errores.
 */
function validateFields(body, schema, { partial = false, c = collect() } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) c.add(key, MSG.notAllowed);
  }
  const out = {};
  const names = partial ? Object.keys(input).filter((k) => schema[k]) : Object.keys(schema);
  if (partial && names.length === 0 && c.ok) c.add('body', MSG.emptyBody);
  for (const name of names) out[name] = validateField(input, name, schema[name], c);
  c.throwIfAny();
  return out;
}

module.exports = {
  MSG, normalizePhone, isEmail, isIsoDate, parseId, collect, textField, validateField, validateFields
};
