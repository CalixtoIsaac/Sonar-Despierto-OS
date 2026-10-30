/**
 * Middlewares de autenticación y autorización reutilizables por todas las rutas (ADR-0004).
 *
 *   router.use(requireAuth)                    → sesión válida y contraseña ya cambiada
 *   router.get('/x', requireAuthAllowPending)  → sesión válida aunque deba cambiar la contraseña
 *   router.use(requireAdmin)                   → solo ADMIN
 *   router.use(requireModule('CARTAS'))        → ADMIN, u OPERADOR con ese módulo
 *
 * Los permisos se leen de la BD en CADA petición: quitar un módulo tiene efecto inmediato.
 * El frontend solo oculta; la validación real siempre ocurre aquí.
 */
const { AppError } = require('./errors');
const { MODULE_LABELS } = require('./modules');
const { verifySessionToken, TOKEN_INVALID_MESSAGE } = require('./security');
const users = require('../services/users');

const NOT_AUTHENTICATED = 'No has iniciado sesión o tu sesión expiró.';

function authenticate(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new AppError(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED);

  const { userId, version } = verifySessionToken(match[1]);
  const user = users.getUser(userId);
  if (!user || !user.is_active) throw new AppError(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED);
  if (user.token_version !== version) throw new AppError(401, 'TOKEN_INVALID', TOKEN_INVALID_MESSAGE);
  return user;
}

function requireAuthAllowPending(req, res, next) {
  try {
    req.user = authenticate(req);
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  try {
    req.user = authenticate(req);
    if (req.user.must_change_password) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Debes cambiar tu contraseña antes de continuar.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user.role !== 'ADMIN') {
      return next(new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.'));
    }
    next();
  });
}

function requireModule(module) {
  if (!MODULE_LABELS[module]) throw new Error(`Módulo desconocido: ${module}`);
  return function moduleGuard(req, res, next) {
    requireAuth(req, res, (err) => {
      if (err) return next(err);
      if (!users.hasModule(req.user, module)) {
        return next(new AppError(403, 'MODULE_FORBIDDEN', `No tienes acceso al módulo ${MODULE_LABELS[module]}.`));
      }
      next();
    });
  };
}

module.exports = { requireAuth, requireAuthAllowPending, requireAdmin, requireModule };
