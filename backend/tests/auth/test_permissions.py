from collections.abc import Callable

from fastapi.testclient import TestClient

from app.modules.users.models import User

CARTAS_URL = "/api/v1/_test/cartas"
ADMIN_URL = "/api/v1/_test/admin"


def test_admin_has_everything(client: TestClient, admin_headers: dict[str, str]) -> None:
    assert client.get(CARTAS_URL, headers=admin_headers).status_code == 200
    assert client.get(ADMIN_URL, headers=admin_headers).status_code == 200


def test_operator_with_module(client: TestClient, operator_headers: dict[str, str]) -> None:
    assert client.get(CARTAS_URL, headers=operator_headers).status_code == 200
    r = client.get(ADMIN_URL, headers=operator_headers)
    assert r.status_code == 403
    assert r.json()["error"] == {
        "code": "FORBIDDEN",
        "message": "No tienes permiso para realizar esta acción.",
        "details": None,
    }


def test_operator_without_module(
    client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    login: Callable[[str, str], dict[str, str]],
) -> None:
    user, password = make_user(modules=())
    r = client.get(CARTAS_URL, headers=login(user.email, password))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "MODULE_FORBIDDEN"
    assert r.json()["error"]["message"] == "No tienes acceso al módulo Cartas de Navidad."


def test_protected_route_without_token(client: TestClient) -> None:
    r = client.get(CARTAS_URL)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "NOT_AUTHENTICATED"
