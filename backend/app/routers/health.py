from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db.session import check_db_connection

router = APIRouter(tags=["Salud"])


@router.get("/health", summary="Estado de la API")
def health():
    return {"status": "ok"}


@router.get("/health/db", summary="Estado de la conexión a MySQL")
def health_db():
    if check_db_connection():
        return {"status": "ok", "database": "conectada"}
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "DB_UNAVAILABLE",
                           "message": "No se pudo conectar a la base de datos.", "details": None}},
    )
