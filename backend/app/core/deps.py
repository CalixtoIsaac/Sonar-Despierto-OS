"""Dependencias de autenticación y autorización reutilizables por todos los módulos.

Uso: APIRouter(prefix="/letters", dependencies=[Depends(require_module(ModuleKey.CARTAS))])
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.modules import MODULE_LABELS, ModuleKey, UserRole
from app.core.security import TOKEN_INVALID_MESSAGE, decode_token
from app.db.session import get_db
from app.modules.users.models import User
from app.modules.users.service import get_user, has_module

__all__ = [
    "ClientIp",
    "CurrentUser",
    "CurrentUserAllowPending",
    "DbSession",
    "bearer_scheme",
    "client_ip",
    "get_current_user",
    "get_current_user_allow_pending",
    "get_db",
    "require_admin",
    "require_module",
]

bearer_scheme = HTTPBearer(auto_error=False, description="Pega aquí el access_token")

_NOT_AUTHENTICATED = ("NOT_AUTHENTICATED", "No has iniciado sesión o tu sesión expiró.")


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


DbSession = Annotated[Session, Depends(get_db)]
ClientIp = Annotated[str, Depends(client_ip)]
_Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def get_current_user_allow_pending(credentials: _Credentials, db: DbSession) -> User:
    """Usuario autenticado, aunque tenga pendiente el cambio de contraseña."""
    if credentials is None:
        raise AppError(401, *_NOT_AUTHENTICATED)
    payload = decode_token(credentials.credentials, "access")
    try:
        user = get_user(db, int(payload["sub"]))
    except (TypeError, ValueError) as exc:
        raise AppError(401, "TOKEN_INVALID", TOKEN_INVALID_MESSAGE) from exc
    if user is None or not user.is_active:
        raise AppError(401, *_NOT_AUTHENTICATED)
    if payload["ver"] != user.token_version:
        raise AppError(401, "TOKEN_INVALID", TOKEN_INVALID_MESSAGE)
    return user


CurrentUserAllowPending = Annotated[User, Depends(get_current_user_allow_pending)]


def get_current_user(user: CurrentUserAllowPending) -> User:
    if user.must_change_password:
        raise AppError(
            403, "PASSWORD_CHANGE_REQUIRED", "Debes cambiar tu contraseña antes de continuar."
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != UserRole.ADMIN:
        raise AppError(403, "FORBIDDEN", "No tienes permiso para realizar esta acción.")
    return user


def require_module(module: ModuleKey) -> Callable[..., User]:
    """Fábrica de dependencias: ADMIN pasa siempre; OPERADOR necesita el módulo."""

    def dependency(user: CurrentUser) -> User:
        if not has_module(user, module):
            raise AppError(
                403, "MODULE_FORBIDDEN", f"No tienes acceso al módulo {MODULE_LABELS[module]}."
            )
        return user

    return dependency
