"""Motor y sesiones de base de datos (motor perezoso: se crea en el primer uso)."""

import logging
from collections.abc import Generator
from typing import Any

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SessionFactory = sessionmaker(autoflush=False, expire_on_commit=False)

_engine: Engine | None = None


def _set_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


def _build_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})
        event.listen(engine, "connect", _set_sqlite_pragmas)
        return engine
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600)


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _build_engine(get_settings().database_url)
    return _engine


def new_session() -> Session:
    return SessionFactory(bind=get_engine())


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI: una sesión por petición."""
    db = new_session()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        # Solo el tipo de error: el mensaje podría incluir datos de conexión
        logger.warning("No se pudo conectar a la base de datos (%s)", type(exc).__name__)
        return False


def dispose_engine() -> None:
    """Cierra las conexiones (en Windows libera el archivo de SQLite)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None
