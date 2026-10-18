from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.modules import ALL_MODULES, UserRole
from app.modules.audit.models import AuditLog
from app.modules.users.models import User

LOGIN_URL = "/api/v1/auth/login"
MakeUser = Callable[..., tuple[User, str]]


def test_login_ok_returns_tokens_and_user(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user(role=UserRole.ADMIN)
    r = client.post(LOGIN_URL, json={"email": user.email, "password": password})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 1800
    assert body["user"]["email"] == user.email
    assert body["user"]["modules"] == [m.value for m in ALL_MODULES]
    assert "password_hash" not in r.text


def test_login_normalizes_email(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user(email="ana@sonardespierto.org")
    r = client.post(LOGIN_URL, json={"email": "  ANA@SonarDespierto.org ", "password": password})
    assert r.status_code == 200


def test_wrong_password_and_unknown_email_give_same_error(
    client: TestClient, make_user: MakeUser
) -> None:
    user, _ = make_user()
    wrong = client.post(LOGIN_URL, json={"email": user.email, "password": "Incorrecta1"})
    unknown = client.post(
        LOGIN_URL, json={"email": "nadie@sonardespierto.org", "password": "Incorrecta1"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["error"] == {
        "code": "INVALID_CREDENTIALS",
        "message": "Correo o contraseña incorrectos.",
        "details": None,
    }


def test_disabled_user_with_correct_password(
    client: TestClient, make_user: MakeUser, db: Session
) -> None:
    user, password = make_user()
    user.is_active = False
    db.commit()
    r = client.post(LOGIN_URL, json={"email": user.email, "password": password})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ACCOUNT_DISABLED"
    assert r.json()["error"]["message"] == "Tu cuenta está desactivada. Contacta al administrador."


def test_login_updates_last_login_at(client: TestClient, make_user: MakeUser, db: Session) -> None:
    user, password = make_user()
    assert user.last_login_at is None
    client.post(LOGIN_URL, json={"email": user.email, "password": password})
    db.expire_all()
    assert db.get(User, user.id).last_login_at is not None


def test_login_is_audited_without_password(
    client: TestClient, make_user: MakeUser, db: Session
) -> None:
    user, password = make_user()
    client.post(LOGIN_URL, json={"email": user.email, "password": "Incorrecta1"})
    client.post(LOGIN_URL, json={"email": user.email, "password": password})
    logs = db.scalars(select(AuditLog).order_by(AuditLog.id)).all()
    assert [log.action for log in logs] == ["LOGIN_FAILED", "LOGIN"]
    assert all(log.user_id == user.id and log.ip_address for log in logs)
    for log in logs:
        assert "Incorrecta1" not in str(log.detail)
        assert password not in str(log.detail)


def test_empty_body_is_validation_error(client: TestClient) -> None:
    r = client.post(LOGIN_URL, json={})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
