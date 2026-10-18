"""Lógica de autenticación (Fase 1 §3.7 y §3.8, ADR-0007)."""

import math

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import (
    TOKEN_INVALID_MESSAGE,
    create_token,
    decode_token,
    hash_password,
    verify_dummy_password,
    verify_password,
)
from app.db.types import utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.rate_limit import login_rate_limiter
from app.modules.auth.schemas import TokenResponse, UserMe
from app.modules.users.models import User
from app.modules.users.service import (
    get_user,
    get_user_by_email,
    normalize_email,
    remove_credentials_file_if_owner,
)


def build_token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_token(user, "access"),
        refresh_token=create_token(user, "refresh"),
        expires_in=get_settings().ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserMe.from_user(user),
    )


def login(db: Session, email: str, password: str, ip: str) -> TokenResponse:
    email = normalize_email(email)
    key = (ip, email)
    seconds = login_rate_limiter.retry_after(key)
    if seconds is not None:
        raise AppError(
            429,
            "TOO_MANY_REQUESTS",
            f"Demasiados intentos fallidos. Intenta de nuevo en {math.ceil(seconds / 60)} minutos.",
            headers={"Retry-After": str(seconds)},
        )

    user = get_user_by_email(db, email)
    if user is None:
        verify_dummy_password(password)  # mismo tiempo de respuesta que con un correo real
    elif verify_password(password, user.password_hash):
        if not user.is_active:
            record_audit(
                db,
                action="LOGIN_FAILED",
                entity="users",
                entity_id=user.id,
                user_id=user.id,
                detail={"reason": "disabled"},
                ip_address=ip,
            )
            db.commit()
            raise AppError(
                403, "ACCOUNT_DISABLED", "Tu cuenta está desactivada. Contacta al administrador."
            )
        login_rate_limiter.reset(key)
        user.last_login_at = utcnow()
        record_audit(
            db, action="LOGIN", entity="users", entity_id=user.id, user_id=user.id, ip_address=ip
        )
        db.commit()
        return build_token_response(user)

    # Fallo: mismo mensaje si el correo no existe o si la contraseña es incorrecta
    login_rate_limiter.register_failure(key)
    record_audit(
        db,
        action="LOGIN_FAILED",
        entity="users",
        entity_id=user.id if user else None,
        user_id=user.id if user else None,
        detail={"email": email},
        ip_address=ip,
    )
    db.commit()
    raise AppError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.")


def refresh_tokens(db: Session, refresh_token: str) -> TokenResponse:
    payload = decode_token(refresh_token, "refresh")
    try:
        user = get_user(db, int(payload["sub"]))
    except (TypeError, ValueError):
        user = None
    if user is None or not user.is_active or payload["ver"] != user.token_version:
        raise AppError(401, "TOKEN_INVALID", TOKEN_INVALID_MESSAGE)
    return build_token_response(user)


def logout(db: Session, user: User, ip: str) -> None:
    user.token_version += 1  # invalida access y refresh emitidos
    record_audit(
        db, action="LOGOUT", entity="users", entity_id=user.id, user_id=user.id, ip_address=ip
    )
    db.commit()


def change_password(
    db: Session, user: User, current_password: str, new_password: str, ip: str
) -> TokenResponse:
    if not verify_password(current_password, user.password_hash):
        raise AppError(400, "INVALID_CURRENT_PASSWORD", "La contraseña actual no es correcta.")
    if new_password == current_password:
        raise AppError(
            400, "PASSWORD_REUSED", "La nueva contraseña debe ser distinta de la actual."
        )
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.token_version += 1
    record_audit(
        db,
        action="PASSWORD_CHANGED",
        entity="users",
        entity_id=user.id,
        user_id=user.id,
        ip_address=ip,
    )
    db.commit()
    remove_credentials_file_if_owner(user.email)
    return build_token_response(user)
