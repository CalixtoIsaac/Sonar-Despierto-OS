from collections.abc import Callable

from fastapi.testclient import TestClient

from app.modules.auth.rate_limit import LoginRateLimiter
from app.modules.users.models import User

LOGIN_URL = "/api/v1/auth/login"
MakeUser = Callable[..., tuple[User, str]]


def _fail(client: TestClient, email: str, times: int) -> None:
    for _ in range(times):
        r = client.post(LOGIN_URL, json={"email": email, "password": "Incorrecta1"})
        assert r.status_code == 401


def test_sixth_attempt_is_blocked(client: TestClient, make_user: MakeUser) -> None:
    user, _ = make_user()
    _fail(client, user.email, 5)
    r = client.post(LOGIN_URL, json={"email": user.email, "password": "Incorrecta1"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "TOO_MANY_REQUESTS"
    assert r.json()["error"]["message"].startswith("Demasiados intentos fallidos.")
    assert int(r.headers["Retry-After"]) > 0


def test_blocked_even_with_correct_password(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user()
    _fail(client, user.email, 5)
    r = client.post(LOGIN_URL, json={"email": user.email, "password": password})
    assert r.status_code == 429


def test_other_email_from_same_ip_is_not_blocked(client: TestClient, make_user: MakeUser) -> None:
    blocked, _ = make_user()
    other, password = make_user()
    _fail(client, blocked.email, 5)
    r = client.post(LOGIN_URL, json={"email": other.email, "password": password})
    assert r.status_code == 200


def test_successful_login_resets_counter(client: TestClient, make_user: MakeUser) -> None:
    user, password = make_user()
    _fail(client, user.email, 4)
    assert (
        client.post(LOGIN_URL, json={"email": user.email, "password": password}).status_code == 200
    )
    _fail(client, user.email, 4)  # sin el reinicio, el 5.º fallo + este bloquearían
    assert (
        client.post(LOGIN_URL, json={"email": user.email, "password": password}).status_code == 200
    )


def test_window_expires() -> None:
    now = [1000.0]
    limiter = LoginRateLimiter(max_attempts=3, window_seconds=60, clock=lambda: now[0])
    key = ("127.0.0.1", "ana@sonardespierto.org")
    for _ in range(3):
        limiter.register_failure(key)
    assert limiter.retry_after(key) == 60
    now[0] += 30
    assert limiter.retry_after(key) == 30
    now[0] += 30
    assert limiter.retry_after(key) is None


def test_reset_clears_key() -> None:
    limiter = LoginRateLimiter(max_attempts=1, window_seconds=60)
    key = ("127.0.0.1", "ana@sonardespierto.org")
    limiter.register_failure(key)
    assert limiter.retry_after(key) is not None
    limiter.reset(key)
    assert limiter.retry_after(key) is None
