from collections.abc import Iterator

import pytest

from app.core.config import Settings
from app.core.paths import DATA_DIR


@pytest.fixture
def no_secret_key_file() -> Iterator[None]:
    key_file = DATA_DIR / "secret.key"
    key_file.unlink(missing_ok=True)
    yield
    key_file.unlink(missing_ok=True)


def test_empty_database_url_uses_sqlite_in_data_dir() -> None:
    url = Settings(DATABASE_URL="").database_url
    assert url == f"sqlite:///{(DATA_DIR / 'sonar.db').as_posix()}"
    assert url.endswith("/sonar.db")


@pytest.mark.usefixtures("no_secret_key_file")
def test_empty_jwt_secret_is_generated_once_and_reused() -> None:
    first = Settings(JWT_SECRET_KEY="")
    assert (DATA_DIR / "secret.key").is_file()
    assert len(first.JWT_SECRET_KEY) >= 64
    second = Settings(JWT_SECRET_KEY="")
    assert second.JWT_SECRET_KEY == first.JWT_SECRET_KEY


@pytest.mark.usefixtures("no_secret_key_file")
def test_placeholder_jwt_secret_uses_key_file() -> None:
    generated = Settings(JWT_SECRET_KEY="").JWT_SECRET_KEY
    assert generated == Settings(JWT_SECRET_KEY="CAMBIAR_X").JWT_SECRET_KEY


def test_explicit_jwt_secret_is_kept() -> None:
    assert Settings(JWT_SECRET_KEY="una-clave-explicita").JWT_SECRET_KEY == "una-clave-explicita"


def test_lan_mode_binds_all_interfaces() -> None:
    assert Settings(LAN_MODE=True).bind_host == "0.0.0.0"  # noqa: S104
    assert Settings(LAN_MODE=False, HOST="127.0.0.1").bind_host == "127.0.0.1"


def test_docs_disabled_in_production_by_default() -> None:
    assert Settings(APP_ENV="production", ENABLE_DOCS=None).docs_enabled is False
    assert Settings(APP_ENV="development", ENABLE_DOCS=None).docs_enabled is True
    assert Settings(APP_ENV="production", ENABLE_DOCS=True).docs_enabled is True


def test_config_env_in_data_dir_overrides_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    config_env = DATA_DIR / "config.env"
    config_env.write_text("LOGIN_MAX_ATTEMPTS=9\nMAX_UPLOAD_MB=7\n", encoding="utf-8")
    try:
        assert Settings().LOGIN_MAX_ATTEMPTS == 9
        # Las variables de entorno ganan al archivo
        monkeypatch.setenv("MAX_UPLOAD_MB", "3")
        assert Settings().MAX_UPLOAD_MB == 3
    finally:
        config_env.unlink()
