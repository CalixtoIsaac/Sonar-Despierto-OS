"""Rutas del programa y del directorio de datos (ADR-0003).

Funciona desde el código fuente y como ejecutable.
"""

import os
import sys
from pathlib import Path

APP_FOLDER_NAME = "SonarDespierto"
IS_FROZEN: bool = bool(getattr(sys, "frozen", False))

if IS_FROZEN:  # PyInstaller one-folder: los datos empaquetados viven en sys._MEIPASS
    BUNDLE_DIR = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    BACKEND_DIR = BUNDLE_DIR / "backend"
else:
    BACKEND_DIR = Path(__file__).resolve().parents[2]  # .../backend
    BUNDLE_DIR = BACKEND_DIR.parent  # raíz del repositorio

ALEMBIC_DIR = BACKEND_DIR / "alembic"
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
DEFAULT_SPA_DIR = BUNDLE_DIR / "frontend" / "dist"


def resolve_data_dir() -> Path:
    """Orden: SD_DATA_DIR > %LOCALAPPDATA%/SonarDespierto (ejecutable) > <repo>/.data (fuente)."""
    env_dir = os.environ.get("SD_DATA_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()
    if IS_FROZEN:
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / APP_FOLDER_NAME
    return BUNDLE_DIR / ".data"


DATA_DIR: Path = resolve_data_dir()


def ensure_data_dirs(data_dir: Path = DATA_DIR) -> None:
    for sub in ("", "logs", "uploads", "backups"):
        (data_dir / sub).mkdir(parents=True, exist_ok=True)
