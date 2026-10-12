"""Punto de entrada: uvicorn app.main:app --reload (desde la carpeta backend)."""
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.errors import register_error_handlers
from app.routers import health

logging.basicConfig(level=logging.INFO if settings.is_dev else logging.WARNING)

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="API del Sistema de Gestión Integral de Soñar Despierto.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(health.router, prefix=settings.API_PREFIX)

# Frontend estático (se monta al final para no tapar /api ni /docs)
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
