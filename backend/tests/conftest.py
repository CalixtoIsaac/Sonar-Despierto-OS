"""Configuración global de pruebas: directorio de datos y BD SQLite temporales."""

import os
import shutil
import tempfile
from collections.abc import Iterator
from pathlib import Path

# Las variables deben definirse ANTES de importar `app` (la configuración se lee al importar)
_TMP = Path(tempfile.mkdtemp(prefix="sd-test-"))
os.environ.update(
    {
        "SD_DATA_DIR": str(_TMP),
        "APP_ENV": "test",
        "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
        "JWT_SECRET_KEY": "clave-de-pruebas-" + "x" * 48,
        "FIRST_ADMIN_EMAIL": "admin@sonardespierto.org",
        "FIRST_ADMIN_PASSWORD": "Admin12345",
        "AUTO_MIGRATE": "true",
        "SPA_DIR": str(_TMP / "sin-frontend"),  # sin SPA → sin ruta comodín
        "ENABLE_DOCS": "true",
    }
)

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def app() -> FastAPI:
    return create_app()


@pytest.fixture(scope="session")
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:  # ejecuta el lifespan (migraciones)
        yield test_client


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    from app.db.session import dispose_engine

    dispose_engine()
    shutil.rmtree(_TMP, ignore_errors=True)
