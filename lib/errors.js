/**
 * Formato de error estándar de la API (ADR-0009, mismo estilo que SEMA):
 *
 *   { "error": "Mensaje para la persona usuaria.", "code": "CODIGO_EN_MAYUSCULAS", "details": [...] }
 *
 * - "error" siempre en español y listo para mostrarse en pantalla.
 * - "code" es estable: el frontend y las pruebas deciden con él, nunca con el texto.
 * - "details" solo en errores de validación: [{ field, message }].
 *
 * En servicios y rutas: throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo.')
 */
class AppError extends Error {
  constructor(status, code, message, { details, headers, extra } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers; // p. ej. { 'Retry-After': '900' }
    this.extra = extra; // campos adicionales del cuerpo, p. ej. { existing_id: 12 } en un 409 de duplicado
  }
}

const VALIDATION_MESSAGE = 'Revisa los datos enviados.';

/** Error 422 a partir de una lista [{ field, message }]. */
function validationError(details) {
  return new AppError(422, 'VALIDATION_ERROR', VALIDATION_MESSAGE, { details });
}

function body(code, message, details, extra) {
  const out = { error: message, code };
  if (details !== undefined) out.details = details;
  if (extra) Object.assign(out, extra);
  return out;
}

/** Envuelve un manejador async para que sus errores lleguen a errorHandler. */
const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

function notFoundApi(req, res) {
  res.status(404).json(body('NOT_FOUND', 'Ruta de la API no encontrada.'));
}

function createErrorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
      if (err.headers) res.set(err.headers);
      return res.status(err.status).json(body(err.code, err.message, err.details, err.extra));
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json(body('INVALID_JSON', 'El cuerpo de la petición no es un JSON válido.'));
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json(body('PAYLOAD_TOO_LARGE', 'La petición es demasiado grande.'));
    }
    // El detalle va al log, nunca a la respuesta
    if (logger) logger.error('Error no controlado', err);
    return res.status(500).json(body('INTERNAL_ERROR', 'Ocurrió un error inesperado.'));
  };
}

module.exports = { AppError, validationError, VALIDATION_MESSAGE, wrap, notFoundApi, createErrorHandler, body };
