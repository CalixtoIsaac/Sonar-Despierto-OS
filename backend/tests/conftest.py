"""Configuración global de pruebas: directorio de datos y BD SQLite temporales."""

import itertools
import os
import shutil
import tempfile
from collections.abc import Callable, Iterator
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
from fastapi import APIRouter, Depends, FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.deps import require_admin, require_module  # noqa: E402
from app.core.modules import ModuleKey, UserRole  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import new_session  # noqa: E402
from app.main import create_app  # noqa: E402
from app.modules.auth.rate_limit import login_rate_limiter  # noqa: E402
from app.modules.users.models import User  # noqa: E402
from app.modules.users.service import create_user, ensure_first_admin  # noqa: E402

ADMIN_EMAIL = "admin@sonardespierto.org"
ADMIN_PASSWORD = "Admin12345"
DEFAULT_PASSWORD = "Clave12345"

# Rutas de prueba para ejercitar require_module y require_admin
_test_router = APIRouter()


@_test_router.get("/cartas", dependencies=[Depends(require_module(ModuleKey.CARTAS))])
def _solo_cartas() -> dict[str, bool]:
    return {"ok": True}


@_test_router.get("/admin", dependencies=[Depends(require_admin)])
def _solo_admin() -> dict[str, bool]:
    return {"ok": True}


@pytest.fixture(scope="session")
def app() -> FastAPI:
    application = create_app()
    # La SPA no está montada en pruebas, así que agregar rutas después es seguro
    application.include_router(_test_router, prefix="/api/v1/_test")
    return application


@pytest.fixture(scope="session")
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:  # ejecuta el lifespan (migraciones)
        yield test_client


@pytest.fixture(autouse=True)
def clean_db(client: TestClient) -> Iterator[None]:
    """Cada prueba empieza con la BD vacía + el admin inicial (cambio de contraseña pendiente)."""
    with new_session() as s:
        for table in reversed(Base.metadata.sorted_tables):
            s.execute(table.delete())
        s.commit()
        ensure_first_admin(s)
    login_rate_limiter.reset_all()
    yield


@pytest.fixture
def db() -> Iterator[Session]:
    session = new_session()
    try:
        yield session
    finally:
        session.close()


_emails = itertools.count(1)


@pytest.fixture
def make_user(db: Session) -> Callable[..., tuple[User, str]]:
    """Crea usuarios sin cambio de contraseña pendiente. Devuelve (user, password)."""

    def _make(
        *,
        email: str | None = None,
        password: str = DEFAULT_PASSWORD,
        role: UserRole = UserRole.OPERADOR,
        modules: tuple[ModuleKey, ...] = (),
        must_change_password: bool = False,
        first_name: str = "Usuario",
        last_name: str = "Prueba",
    ) -> tuple[User, str]:
        user = create_user(
            db,
            email=email or f"usuario{next(_emails)}@sonardespierto.org",
            password=password,
            first_name=first_name,
            last_name=last_name,
            role=role,
            modules=modules,
            must_change_password=must_change_password,
        )
        return user, password

    return _make


@pytest.fixture
def login(client: TestClient) -> Callable[[str, str], dict[str, str]]:
    def _login(email: str, password: str) -> dict[str, str]:
        r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _login


@pytest.fixture
def admin_headers(
    make_user: Callable[..., tuple[User, str]], login: Callable[[str, str], dict[str, str]]
) -> dict[str, str]:
    user, password = make_user(role=UserRole.ADMIN)
    return login(user.email, password)


@pytest.fixture
def operator_headers(
    make_user: Callable[..., tuple[User, str]], login: Callable[[str, str], dict[str, str]]
) -> dict[str, str]:
    user, password = make_user(modules=(ModuleKey.CARTAS,))
    return login(user.email, password)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    from app.db.session import dispose_engine

    dispose_engine()
    shutil.rmtree(_TMP, ignore_errors=True)
