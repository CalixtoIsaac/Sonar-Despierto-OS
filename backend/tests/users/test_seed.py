import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.modules import UserRole
from app.core.security import check_password_policy, verify_password
from app.modules.audit.models import AuditLog
from app.modules.users.models import User
from app.modules.users.service import (
    CREDENTIALS_FILE_NAME,
    ensure_first_admin,
    reset_password_to_temporary,
)

ADMIN_EMAIL = "admin@sonardespierto.org"


def _read_temp_password(text: str) -> str:
    line = next(li for li in text.splitlines() if li.startswith("Contraseña temporal:"))
    return line.split(":", 1)[1].strip()


def test_first_admin_with_generated_password(db: Session) -> None:
    db.execute(delete(User))
    db.commit()
    settings = get_settings().model_copy(update={"FIRST_ADMIN_PASSWORD": ""})
    credentials = settings.data_dir / CREDENTIALS_FILE_NAME
    try:
        assert ensure_first_admin(db, settings) == ADMIN_EMAIL
        admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        assert admin is not None
        assert admin.role == UserRole.ADMIN
        assert admin.must_change_password is True
        assert (admin.first_name, admin.last_name) == ("Administrador", "General")

        text = credentials.read_text(encoding="utf-8")
        assert ADMIN_EMAIL in text
        password = _read_temp_password(text)
        assert check_password_policy(password)
        assert verify_password(password, admin.password_hash)

        assert ensure_first_admin(db, settings) is None  # idempotente
    finally:
        credentials.unlink(missing_ok=True)


def test_invalid_first_admin_password_falls_back_to_temporary(db: Session) -> None:
    db.execute(delete(User))
    db.commit()
    settings = get_settings().model_copy(update={"FIRST_ADMIN_PASSWORD": "corta"})
    credentials = settings.data_dir / CREDENTIALS_FILE_NAME
    try:
        assert ensure_first_admin(db, settings) == ADMIN_EMAIL
        assert credentials.is_file()
    finally:
        credentials.unlink(missing_ok=True)


def test_reset_password_to_temporary_invalidates_tokens(client: TestClient, db: Session) -> None:
    r = client.post("/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": "Admin12345"})
    old_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    credentials = get_settings().data_dir / CREDENTIALS_FILE_NAME
    try:
        user, password = reset_password_to_temporary(db)  # sin correo: primer ADMIN activo
        assert user.email == ADMIN_EMAIL
        assert user.must_change_password is True
        assert check_password_policy(password)
        assert password in credentials.read_text(encoding="utf-8")
        assert db.scalar(select(AuditLog).where(AuditLog.action == "PASSWORD_RESET"))

        assert client.get("/api/v1/auth/me", headers=old_headers).status_code == 401
        new_login = client.post(
            "/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": password}
        )
        assert new_login.status_code == 200
    finally:
        credentials.unlink(missing_ok=True)


def test_reset_unknown_email(db: Session) -> None:
    with pytest.raises(AppError) as exc_info:
        reset_password_to_temporary(db, "nadie@sonardespierto.org")
    assert exc_info.value.status_code == 404
    assert exc_info.value.code == "NOT_FOUND"
