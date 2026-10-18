"""Tareas de arranque: directorio de datos, migraciones y datos iniciales."""

import logging

from app.core.config import get_settings
from app.core.paths import ensure_data_dirs
from app.db.migrate import run_migrations
from app.db.session import get_engine, new_session
from app.modules.users.service import ensure_first_admin

logger = logging.getLogger(__name__)


def run_startup_tasks() -> None:
    ensure_data_dirs()
    if get_settings().AUTO_MIGRATE:
        run_migrations()
        with new_session() as db:
            ensure_first_admin(db)
    # Solo el dialecto: la URL completa podría contener credenciales (nube)
    logger.info("Base de datos lista: %s", get_engine().dialect.name)
