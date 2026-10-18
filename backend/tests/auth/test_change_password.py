from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.security import PASSWORD_POLICY_MESSAGE
from app.modules.users.service import CREDENTIALS_FILE_NAME, write_credentials_file

ADMIN_EMAIL = "admin@sonardespierto.org"
ADMIN_PASSWORD = "Admin12345"
CHANGE_URL = "/api/v1/auth/change-password"
Login = Callable[[str, str], dict[str, str]]


@pytest.fixture
def pending_headers(login: Login) -> dict[str, str]:
    """Admin inicial: debe cambiar su contraseña."""
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


def test_me_allowed_with_pending_change(
    client: TestClient, pending_headers: dict[str, str]
) -> None:
    r = client.get("/api/v1/auth/me", headers=pending_headers)
    assert r.status_code == 200
    assert r.json()["must_change_password"] is True


def test_protected_route_requires_change(
    client: TestClient, pending_headers: dict[str, str]
) -> None:
    r = client.get("/api/v1/_test/cartas", headers=pending_headers)
    assert r.status_code == 403
    assert r.json()["error"] == {
        "code": "PASSWORD_CHANGE_REQUIRED",
        "message": "Debes cambiar tu contraseña antes de continuar.",
        "details": None,
    }


def test_wrong_current_password(client: TestClient, pending_headers: dict[str, str]) -> None:
    r = client.post(
        CHANGE_URL,
        headers=pending_headers,
        json={"current_password": "Incorrecta1", "new_password": "NuevaClave1"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
    assert r.json()["error"]["message"] == "La contraseña actual no es correcta."


@pytest.mark.parametrize("weak", ["abcdefgh", "12345678", "abc1", "a1" * 40])
def test_weak_new_password(client: TestClient, pending_headers: dict[str, str], weak: str) -> None:
    r = client.post(
        CHANGE_URL,
        headers=pending_headers,
        json={"current_password": ADMIN_PASSWORD, "new_password": weak},
    )
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"] == [{"field": "new_password", "message": PASSWORD_POLICY_MESSAGE}]


def test_reused_password(client: TestClient, pending_headers: dict[str, str]) -> None:
    r = client.post(
        CHANGE_URL,
        headers=pending_headers,
        json={"current_password": ADMIN_PASSWORD, "new_password": ADMIN_PASSWORD},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "PASSWORD_REUSED"
    assert r.json()["error"]["message"] == "La nueva contraseña debe ser distinta de la actual."


def test_change_password_success(client: TestClient, pending_headers: dict[str, str]) -> None:
    credentials = get_settings().data_dir / CREDENTIALS_FILE_NAME
    write_credentials_file(ADMIN_EMAIL, ADMIN_PASSWORD, "Prueba")
    assert credentials.is_file()

    r = client.post(
        CHANGE_URL,
        headers=pending_headers,
        json={"current_password": ADMIN_PASSWORD, "new_password": "NuevaClave1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["must_change_password"] is False
    assert not credentials.exists()

    old = client.get("/api/v1/auth/me", headers=pending_headers)
    assert old.status_code == 401
    new_headers = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.get("/api/v1/_test/cartas", headers=new_headers).status_code == 200

    login = client.post(
        "/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": "NuevaClave1"}
    )
    assert login.status_code == 200


def test_credentials_file_of_other_user_is_kept(
    client: TestClient, pending_headers: dict[str, str]
) -> None:
    credentials = get_settings().data_dir / CREDENTIALS_FILE_NAME
    write_credentials_file("otro@sonardespierto.org", "Temporal123", "Prueba")
    try:
        r = client.post(
            CHANGE_URL,
            headers=pending_headers,
            json={"current_password": ADMIN_PASSWORD, "new_password": "NuevaClave1"},
        )
        assert r.status_code == 200
        assert credentials.is_file()
    finally:
        credentials.unlink(missing_ok=True)
