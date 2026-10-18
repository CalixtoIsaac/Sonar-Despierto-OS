"""Formato de error estándar (ver API_Spec.md §1.5)."""

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("sonar")


class AppError(Exception):
    """Error de negocio. Lanzar desde servicios: raise AppError(409, "DUPLICATE_CHILD", "...")."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers  # p. ej. {"Retry-After": "900"}


def _body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


HTTP_CODES = {
    401: ("NOT_AUTHENTICATED", "No has iniciado sesión o tu sesión expiró."),
    403: ("FORBIDDEN", "No tienes permiso para realizar esta acción."),
    404: ("NOT_FOUND", "El recurso solicitado no existe."),
    405: ("METHOD_NOT_ALLOWED", "Método no permitido."),
    413: ("FILE_TOO_LARGE", "El archivo es demasiado grande."),
    429: ("TOO_MANY_REQUESTS", "Demasiadas solicitudes. Intenta más tarde."),
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(exc.code, exc.message, exc.details),
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, msg = HTTP_CODES.get(exc.status_code, ("HTTP_ERROR", str(exc.detail)))
        return JSONResponse(
            status_code=exc.status_code, content=_body(code, msg), headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_body("VALIDATION_ERROR", "Revisa los datos enviados.", details),
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Error no controlado")  # el detalle va al log, nunca a la respuesta
        return JSONResponse(
            status_code=500, content=_body("INTERNAL_ERROR", "Ocurrió un error inesperado.")
        )
