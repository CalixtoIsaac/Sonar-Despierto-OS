"""Contraseñas (bcrypt), política de contraseñas y tokens JWT (ADR-0007, Fase 1 §3.8)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import TYPE_CHECKING, Any, Literal

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.errors import AppError

if TYPE_CHECKING:
    from app.modules.users.models import User

TokenType = Literal["access", "refresh"]

BCRYPT_ROUNDS = 12
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72  # límite de bcrypt (en bytes UTF-8)
PASSWORD_POLICY_MESSAGE = (
    "La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número."  # noqa: S105
)

# Mensajes para el usuario (no son secretos)
TOKEN_EXPIRED_MESSAGE = "Tu sesión expiró. Inicia sesión de nuevo."  # noqa: S105
TOKEN_INVALID_MESSAGE = "La sesión no es válida. Inicia sesión de nuevo."  # noqa: S105


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:  # hash con formato inválido o contraseña de más de 72 bytes
        return False


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return hash_password("contrasena-ficticia-para-igualar-tiempos")


def verify_dummy_password(password: str) -> None:
    """Gasta el mismo tiempo que una verificación real (no revela si el correo existe)."""
    verify_password(password, _dummy_hash())


def check_password_policy(password: str) -> bool:
    return (
        PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH
        and len(password.encode()) <= PASSWORD_MAX_LENGTH
        and any(c.isalpha() for c in password)
        and any(c.isdigit() for c in password)
    )


def create_token(user: User, token_type: TokenType) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    if token_type == "access":  # noqa: S105  tipo de token, no una contraseña
        expires = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    else:
        expires = now + timedelta(hours=settings.REFRESH_TOKEN_EXPIRE_HOURS)
    claims = {
        "sub": str(user.id),
        "role": user.role.value,
        "type": token_type,
        "ver": user.token_version,
        "iat": now,
        "exp": expires,
    }
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub", "type", "ver"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "TOKEN_EXPIRED", TOKEN_EXPIRED_MESSAGE) from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(401, "TOKEN_INVALID", TOKEN_INVALID_MESSAGE) from exc
    if payload.get("type") != expected_type:
        raise AppError(401, "TOKEN_INVALID", TOKEN_INVALID_MESSAGE)
    return payload
