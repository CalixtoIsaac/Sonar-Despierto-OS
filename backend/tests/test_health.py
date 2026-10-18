from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "app": "sonar-despierto", "version": "0.1.0"}


def test_health_db_reports_sqlite(client: TestClient) -> None:
    r = client.get("/api/v1/health/db")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "sqlite"}


def test_not_found_uses_standard_error(client: TestClient) -> None:
    r = client.get("/api/v1/no-existe")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_docs_available(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200


def test_security_headers(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "same-origin"
