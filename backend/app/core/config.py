"""Configuración central: lee variables del archivo .env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    APP_NAME: str = "Soñar Despierto API"
    APP_ENV: str = "development"
    API_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "mysql+pymysql://sonar_app:CAMBIAR@localhost:3306/sonar_despierto"

    JWT_SECRET_KEY: str = "CAMBIAR"  # noqa: S105  marcador, no es un secreto (la 1.2 lo reescribe)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    FRONTEND_ORIGIN: str = "http://localhost:8000"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 5

    FIRST_ADMIN_EMAIL: str = "admin@sonardespierto.org"
    FIRST_ADMIN_PASSWORD: str = "CAMBIAR"  # noqa: S105  marcador, no es un secreto

    @property
    def is_dev(self) -> bool:
        return self.APP_ENV == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
