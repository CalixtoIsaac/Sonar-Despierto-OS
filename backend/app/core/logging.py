"""Logging de la aplicación: consola + archivo rotativo en {DATA_DIR}/logs/sonar.log."""

import logging
from logging.handlers import RotatingFileHandler

from app.core.config import Settings

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
_HANDLER_FLAG = "_sonar_handler"  # marca los handlers propios para no duplicarlos


def setup_logging(settings: Settings) -> None:
    """Configura el logger raíz. Es idempotente: reemplaza los handlers que creó antes."""
    root = logging.getLogger()
    for handler in [h for h in root.handlers if getattr(h, _HANDLER_FLAG, False)]:
        root.removeHandler(handler)
        handler.close()

    log_dir = settings.data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter(LOG_FORMAT)
    handlers: list[logging.Handler] = [
        logging.StreamHandler(),
        RotatingFileHandler(
            log_dir / "sonar.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8"
        ),
    ]
    for handler in handlers:
        handler.setFormatter(formatter)
        setattr(handler, _HANDLER_FLAG, True)
        root.addHandler(handler)
    root.setLevel(logging.DEBUG if settings.APP_ENV == "development" else logging.INFO)

    for noisy in ("sqlalchemy.engine", "watchfiles"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    # uvicorn trae sus propios handlers: se quitan para que todo pase por el raíz (y al archivo)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
