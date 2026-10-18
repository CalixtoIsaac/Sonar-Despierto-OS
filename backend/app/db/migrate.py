"""Migraciones programáticas (las usan el arranque de la app y el lanzador)."""

from alembic import command
from alembic.config import Config

from app.core.config import get_settings
from app.core.paths import ALEMBIC_DIR, ALEMBIC_INI


def build_alembic_config() -> Config:
    cfg = Config(str(ALEMBIC_INI)) if ALEMBIC_INI.is_file() else Config()
    cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
    cfg.attributes["configure_logging"] = False  # no pisar el logging de la app
    return cfg


def run_migrations() -> None:
    command.upgrade(build_alembic_config(), "head")
