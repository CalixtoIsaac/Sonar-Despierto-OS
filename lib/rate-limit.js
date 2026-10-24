/**
 * Límite de intentos fallidos (ADR-0007): ventana deslizante en memoria.
 * Válido para el proceso único del MVP local; se reinicia al reiniciar el servidor.
 *
 *   const limiter = new RateLimiter({ max: 5, windowMs: 15 * 60e3 });
 *   limiter.retryAfter(key)  → segundos restantes si está bloqueado, o null
 *   limiter.registerFailure(key) · limiter.reset(key) · limiter.resetAll()
 */
class RateLimiter {
  constructor({ max, windowMs, clock = () => Date.now() }) {
    this.max = max;
    this.windowMs = windowMs;
    this.clock = clock;
    this.failures = new Map();
  }

  prune(key, now) {
    const list = (this.failures.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  retryAfter(key) {
    const now = this.clock();
    const list = this.prune(key, now);
    if (list.length < this.max) return null;
    // Se desbloquea cuando el fallo que completó el máximo sale de la ventana
    const unlockAt = list[list.length - this.max] + this.windowMs;
    return Math.max(1, Math.ceil((unlockAt - now) / 1000));
  }

  registerFailure(key) {
    const now = this.clock();
    const list = this.prune(key, now);
    list.push(now);
    this.failures.set(key, list);
  }

  reset(key) {
    this.failures.delete(key);
  }

  resetAll() {
    this.failures.clear();
  }
}

module.exports = { RateLimiter };
