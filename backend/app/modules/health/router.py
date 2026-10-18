from fastapi import APIRouter

from app import __version__
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import check_db_connection, get_engine

router = APIRouter(tags=["Salud"])


@router.get("/health", summary="Estado de la API")
def health() -> dict[str, str]:
    return {"status": "ok", "app": get_settings().APP_ID, "version": __version__}


@router.get("/health/db", summary="Estado de la conexión a la base de datos")
def health_db() -> dict[str, str]:
    if not check_db_connection():
        raise AppError(503, "DB_UNAVAILABLE", "No se pudo conectar a la base de datos.")
    return {"status": "ok", "database": get_engine().dialect.name}
