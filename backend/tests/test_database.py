from app.db.session import check_db_connection, get_engine
from app.db.types import utcnow


def test_sqlite_foreign_keys_enabled() -> None:
    with get_engine().connect() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1


def test_sqlite_uses_wal() -> None:
    with get_engine().connect() as conn:
        assert conn.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"


def test_check_db_connection() -> None:
    assert check_db_connection() is True


def test_utcnow_is_naive() -> None:
    assert utcnow().tzinfo is None
