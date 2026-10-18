from app.db.migrate import run_migrations


def test_run_migrations_is_idempotent() -> None:
    run_migrations()
    run_migrations()
