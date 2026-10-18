"""Tareas de arranque: directorio de datos, migraciones y datos iniciales."""

import logging

from app.core.config import get_settings
from app.core.paths import ensure_data_dirs
from app.db.migrate import run_migrations
from app.db.session import get_engine

logger = logging.getLogger(__name__)


def run_startup_tasks() -> None:
    ensure_data_dirs()
    if get_settings().AUTO_MIGRATE:
        run_migrations()
    # TODO(1.3): crear administrador inicial
    # Solo el dialecto: la URL completa podría contener credenciales (nube)
    logger.info("Base de datos lista: %s", get_engine().dialect.name)
