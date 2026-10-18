"""Endpoints de autenticación (Fase 1 §3.7). Sin lógica: delegan en el servicio."""

from typing import Any

from fastapi import APIRouter, Response, status

from app.core.deps import ClientIp, CurrentUserAllowPending, DbSession
from app.modules.auth import service
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserMe,
)

router = APIRouter(prefix="/auth", tags=["Autenticación"])


def _errors(*items: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    """Documenta en Swagger los códigos de error de cada endpoint."""
    responses: dict[int | str, dict[str, Any]] = {}
    for status_code, description in items:
        responses[status_code] = {"description": description}
    return responses


_UNAUTHENTICATED = (401, "NOT_AUTHENTICATED, TOKEN_EXPIRED o TOKEN_INVALID")


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Iniciar sesión",
    description="Valida correo y contraseña y devuelve un par de tokens (access y refresh).",
    responses=_errors(
        (401, "INVALID_CREDENTIALS: correo o contraseña incorrectos"),
        (403, "ACCOUNT_DISABLED: la cuenta está desactivada"),
        (422, "VALIDATION_ERROR"),
        (429, "TOO_MANY_REQUESTS: demasiados intentos fallidos (incluye Retry-After)"),
    ),
)
def login(payload: LoginRequest, ip: ClientIp, db: DbSession) -> TokenResponse:
    return service.login(db, payload.email, payload.password, ip)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Renovar la sesión",
    description="Cambia un refresh_token válido por un par de tokens nuevo.",
    responses=_errors(
        (401, "TOKEN_EXPIRED o TOKEN_INVALID"),
        (422, "VALIDATION_ERROR"),
    ),
)
def refresh(payload: RefreshRequest, db: DbSession) -> TokenResponse:
    return service.refresh_tokens(db, payload.refresh_token)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Cerrar sesión",
    description="Invalida todos los tokens emitidos al usuario.",
    responses=_errors(_UNAUTHENTICATED),
)
def logout(
    user: CurrentUserAllowPending,
    ip: ClientIp,
    db: DbSession,
) -> Response:
    service.logout(db, user, ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me",
    response_model=UserMe,
    summary="Usuario actual",
    description="Datos de la cuenta y módulos a los que tiene acceso.",
    responses=_errors(_UNAUTHENTICATED),
)
def me(user: CurrentUserAllowPending) -> UserMe:
    return UserMe.from_user(user)


@router.post(
    "/change-password",
    response_model=TokenResponse,
    summary="Cambiar contraseña",
    description=(
        "Cambia la contraseña del usuario actual, invalida los tokens anteriores "
        "y devuelve un par nuevo. Obligatorio si must_change_password es true."
    ),
    responses=_errors(
        (400, "INVALID_CURRENT_PASSWORD o PASSWORD_REUSED"),
        _UNAUTHENTICATED,
        (422, "VALIDATION_ERROR: la nueva contraseña no cumple la política"),
    ),
)
def change_password(
    payload: ChangePasswordRequest,
    user: CurrentUserAllowPending,
    ip: ClientIp,
    db: DbSession,
) -> TokenResponse:
    return service.change_password(db, user, payload.current_password, payload.new_password, ip)
