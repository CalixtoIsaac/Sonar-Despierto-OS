"""Límite de intentos fallidos de login (ADR-0007)."""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from app.core.config import get_settings

RateKey = tuple[str, str]  # (ip, email)


class LoginRateLimiter:
    """Ventana deslizante en memoria por (ip, email). Válido para el proceso único del MVP local."""

    def __init__(
        self,
        max_attempts: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._clock = clock
        self._failures: dict[RateKey, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: RateKey, now: float) -> deque[float]:
        attempts = self._failures.get(key, deque())
        while attempts and now - attempts[0] >= self.window_seconds:
            attempts.popleft()
        if not attempts:
            self._failures.pop(key, None)
        return attempts

    def retry_after(self, key: RateKey) -> int | None:
        """Segundos restantes si la clave está bloqueada; None si puede intentarlo."""
        with self._lock:
            now = self._clock()
            attempts = self._prune(key, now)
            if len(attempts) < self.max_attempts:
                return None
            # Se desbloquea cuando el fallo que completa el máximo sale de la ventana
            unlock_at = attempts[-self.max_attempts] + self.window_seconds
            return max(1, math.ceil(unlock_at - now))

    def register_failure(self, key: RateKey) -> None:
        with self._lock:
            now = self._clock()
            self._prune(key, now)
            self._failures.setdefault(key, deque()).append(now)

    def reset(self, key: RateKey) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def reset_all(self) -> None:
        with self._lock:
            self._failures.clear()


_settings = get_settings()
login_rate_limiter = LoginRateLimiter(
    _settings.LOGIN_MAX_ATTEMPTS, _settings.LOGIN_WINDOW_MINUTES * 60
)
