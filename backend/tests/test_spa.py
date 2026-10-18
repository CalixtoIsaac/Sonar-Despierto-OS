from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import register_error_handlers
from app.shared.spa import mount_spa


def _spa_client(spa_dir: Path) -> TestClient:
    # Sin documentación propia: así /docs, /redoc y /openapi.json llegan a la ruta comodín
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    register_error_handlers(app)
    mount_spa(app, spa_dir)
    return TestClient(app)


@pytest.fixture
def spa_client(tmp_path: Path) -> TestClient:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>SPA</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('app');", encoding="utf-8")
    (dist / "favicon.ico").write_bytes(b"\x00\x00\x01\x00")
    (tmp_path / "secret.txt").write_text("SECRETO", encoding="utf-8")  # fuera de dist/
    return _spa_client(dist)


def test_root_serves_index(spa_client: TestClient) -> None:
    r = spa_client.get("/")
    assert r.status_code == 200
    assert "SPA" in r.text
    assert r.headers["Cache-Control"] == "no-cache"


def test_deep_link_serves_index(spa_client: TestClient) -> None:
    r = spa_client.get("/app/cartas")
    assert r.status_code == 200
    assert "SPA" in r.text


def test_assets_are_served(spa_client: TestClient) -> None:
    r = spa_client.get("/assets/app.js")
    assert r.status_code == 200
    assert "console.log" in r.text
    assert "javascript" in r.headers["content-type"]


def test_root_files_are_served(spa_client: TestClient) -> None:
    r = spa_client.get("/favicon.ico")
    assert r.status_code == 200
    assert r.content == b"\x00\x00\x01\x00"


@pytest.mark.parametrize("path", ["/api", "/api/v1/x", "/docs", "/redoc", "/openapi.json"])
def test_reserved_paths_are_not_intercepted(spa_client: TestClient, path: str) -> None:
    r = spa_client.get(path)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize(
    "path", ["/..%2F..%2Fsecret.txt", "/..%2Fsecret.txt", "/%2E%2E/secret.txt"]
)
def test_path_traversal_is_blocked(spa_client: TestClient, path: str) -> None:
    r = spa_client.get(path)
    assert "SECRETO" not in r.text


def test_missing_build_shows_placeholder(tmp_path: Path) -> None:
    client = _spa_client(tmp_path / "no-existe")
    r = client.get("/")
    assert r.status_code == 200
    assert "La interfaz no está compilada" in r.text
    assert client.get("/app/cartas").status_code == 404  # sin ruta comodín
