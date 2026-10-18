from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.users.models import User

ME_URL = "/api/v1/auth/me"
REFRESH_URL = "/api/v1/auth/refresh"
MakeUser = Callable[..., tuple[User, str]]


def _tokens(client: TestClient, user: User, password: str) -> dict[str, str]:
    r = client.post("/api/v1/auth/login", json={"email": user.email, "password": password})
    assert r.status_code == 200
    return r.json()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _error_code(response: object) -> str:
    return response.json()["error"]["code"]  # type: ignore[attr-defined]


def test_me_without_token(client: TestClient) -> None:
    r = client.get(ME_URL)
    assert r.status_code == 401
    assert _error_code(r) == "NOT_AUTHENTICATED"


def test_garbage_token(client: TestClient) -> None:
    r = client.get(ME_URL, headers=_bearer("esto-no-es-un-jwt"))
    assert r.status_code == 401
    assert _error_code(r) == "TOKEN_INVALID"


def test_expired_token(client: TestClient, make_user: MakeUser) -> None:
    user, _ = make_user()
    settings = get_settings()
    past = datetime.now(UTC) - timedelta(minutes=5)
    token = jwt.encode(
        {
            "sub": str(user.id),
            "role": user.role.value,
            "type": "access",
            "ver": 0,
            "iat": past - timedelta(minutes=30),
            "exp": past,
        },
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    r = client.get(ME_URL, headers=_bearer(token))
    assert r.status_code == 401
    assert _error_code(r) == "TOKEN_EXPIRED"


def test_refresh_token_cannot_be_used_as_access(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user()
    tokens = _tokens(client, user, password)
    r = client.get(ME_URL, headers=_bearer(tokens["refresh_token"]))
    assert r.status_code == 401
    assert _error_code(r) == "TOKEN_INVALID"


def test_access_token_cannot_be_used_to_refresh(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user()
    tokens = _tokens(client, user, password)
    r = client.post(REFRESH_URL, json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401
    assert _error_code(r) == "TOKEN_INVALID"


def test_valid_refresh_returns_new_pair(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user()
    tokens = _tokens(client, user, password)
    r = client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert new["access_token"] and new["refresh_token"]
    assert client.get(ME_URL, headers=_bearer(new["access_token"])).status_code == 200


def test_logout_invalidates_previous_tokens(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user()
    tokens = _tokens(client, user, password)
    r = client.post("/api/v1/auth/logout", headers=_bearer(tokens["access_token"]))
    assert r.status_code == 204
    assert r.content == b""

    me = client.get(ME_URL, headers=_bearer(tokens["access_token"]))
    assert me.status_code == 401
    assert _error_code(me) == "TOKEN_INVALID"
    refresh = client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    assert refresh.status_code == 401


def test_user_disabled_after_login(client: TestClient, make_user: MakeUser, db: Session) -> None:
    user, password = make_user()
    tokens = _tokens(client, user, password)
    user.is_active = False
    db.commit()
    r = client.get(ME_URL, headers=_bearer(tokens["access_token"]))
    assert r.status_code == 401
    assert _error_code(r) == "NOT_AUTHENTICATED"
    refresh = client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    assert refresh.status_code == 401


def test_me_dates_are_utc_with_z(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user()
    tokens = _tokens(client, user, password)
    assert tokens["user"]["last_login_at"].endswith("Z")
    me = client.get(ME_URL, headers=_bearer(tokens["access_token"])).json()
    assert me["last_login_at"].endswith("Z")
    assert "password_hash" not in me
