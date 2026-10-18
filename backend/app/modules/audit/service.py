"""Registro en la bitácora. No hace commit: lo hace el servicio que llama (misma transacción)."""

from typing import Any

from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog

# Nunca se guardan en la bitácora
_SENSITIVE_KEYS = frozenset({"password", "token", "access_token", "refresh_token"})


def _sanitize(detail: dict[str, Any] | None) -> dict[str, Any] | None:
    if detail is None:
        return None
    return {k: v for k, v in detail.items() if k.lower() not in _SENSITIVE_KEYS}


def record_audit(
    db: Session,
    *,
    action: str,
    entity: str,
    entity_id: int | None = None,
    user_id: int | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        action=action,
        entity=entity,
        entity_id=entity_id,
        user_id=user_id,
        detail=_sanitize(detail),
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
