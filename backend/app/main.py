"""Punto de entrada: uvicorn app.main:app --reload (desde la carpeta backend)."""

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import setup_logging
from app.db.session import dispose_engine
from app.db.startup import run_startup_tasks
from app.modules.auth.router import router as auth_router
from app.modules.health.router import router as health_router
from app.shared.spa import mount_spa


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    run_startup_tasks()
    yield
    dispose_engine()


async def security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings)
    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        version=__version__,
        lifespan=lifespan,
        description="API del Sistema de Gestión Integral de Soñar Despierto.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    if settings.CORS_ORIGINS and not settings.is_production:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    app.middleware("http")(security_headers)
    register_error_handlers(app)
    app.include_router(health_router, prefix=settings.API_PREFIX)
    app.include_router(auth_router, prefix=settings.API_PREFIX)
    mount_spa(app, settings.spa_dir)  # SIEMPRE AL FINAL (ruta comodín)
    return app


app = create_app()
