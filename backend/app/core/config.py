"""Configuración central por capas (ver Fase 1 §3.4).

Precedencia: variables de entorno > {DATA_DIR}/config.env > backend/.env > valores por defecto.
"""

import secrets
from functools import lru_cache
from pathlib import Path
from typing import ClassVar, Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import BACKEND_DIR, DATA_DIR, DEFAULT_SPA_DIR, IS_FROZEN, ensure_data_dirs

AppEnv = Literal["development", "test", "production"]

# Los valores que empiezan así se consideran "sin configurar" (plantillas antiguas de .env)
_PLACEHOLDER_PREFIX = "CAMBIAR"


class Settings(BaseSettings):
    # En pydantic-settings el ÚLTIMO archivo de la tupla tiene prioridad
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", DATA_DIR / "config.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: ClassVar[str] = "Soñar Despierto"
    APP_ID: ClassVar[str] = "sonar-despierto"  # el lanzador lo usa para reconocer su instancia
    API_PREFIX: ClassVar[str] = "/api/v1"

    APP_ENV: AppEnv = "production" if IS_FROZEN else "development"
    DATABASE_URL: str = ""
    HOST: str = "127.0.0.1"
    PORT: int = 8765
    LAN_MODE: bool = False

    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_HOURS: int = 12

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    SPA_DIR: str = ""
    AUTO_MIGRATE: bool = True
    ENABLE_DOCS: bool | None = None

    FIRST_ADMIN_EMAIL: str = "admin@sonardespierto.org"
    FIRST_ADMIN_PASSWORD: str = ""

    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_WINDOW_MINUTES: int = 15
    MAX_UPLOAD_MB: int = 5

    @model_validator(mode="after")
    def _resolve_jwt_secret(self) -> Self:
        """Sin clave configurada se lee (o se crea una sola vez) {DATA_DIR}/secret.key."""
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY.startswith(_PLACEHOLDER_PREFIX):
            ensure_data_dirs()
            key_file = DATA_DIR / "secret.key"
            key = key_file.read_text(encoding="utf-8").strip() if key_file.is_file() else ""
            if not key:
                key = secrets.token_urlsafe(64)
                key_file.write_text(key, encoding="utf-8")
            self.JWT_SECRET_KEY = key
        return self

    @property
    def data_dir(self) -> Path:
        return DATA_DIR

    @property
    def database_url(self) -> str:
        return self.DATABASE_URL or f"sqlite:///{(DATA_DIR / 'sonar.db').as_posix()}"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def bind_host(self) -> str:
        return "0.0.0.0" if self.LAN_MODE else self.HOST  # noqa: S104  LAN_MODE es explícito

    @property
    def spa_dir(self) -> Path:
        return Path(self.SPA_DIR) if self.SPA_DIR else DEFAULT_SPA_DIR

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def docs_enabled(self) -> bool:
        return self.ENABLE_DOCS if self.ENABLE_DOCS is not None else not self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
