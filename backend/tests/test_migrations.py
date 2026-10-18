import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.db.migrate import build_alembic_config, run_migrations
from app.db.session import get_engine

_INSERT_USER = text(
    "INSERT INTO users (email, password_hash, role, first_name, last_name, is_active,"
    " must_change_password, token_version, created_at, updated_at)"
    " VALUES (:email, 'x', :role, 'A', 'B', 1, 0, 0, '2026-01-01', '2026-01-01')"
)


def test_run_migrations_is_idempotent() -> None:
    run_migrations()
    run_migrations()


def test_tables_exist() -> None:
    tables = set(inspect(get_engine()).get_table_names())
    assert {"users", "user_module_permissions", "audit_logs", "alembic_version"} <= tables


def test_role_check_constraint() -> None:
    with get_engine().begin() as conn, pytest.raises(IntegrityError):
        conn.execute(_INSERT_USER, {"email": "hacker@sonardespierto.org", "role": "HACKER"})


def test_deleting_user_cascades_permissions() -> None:
    with get_engine().begin() as conn:
        conn.execute(_INSERT_USER, {"email": "cascada@sonardespierto.org", "role": "OPERADOR"})
        user_id = conn.execute(
            text("SELECT id FROM users WHERE email = 'cascada@sonardespierto.org'")
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO user_module_permissions (user_id, module, created_at)"
                " VALUES (:uid, 'CARTAS', '2026-01-01')"
            ),
            {"uid": user_id},
        )
        conn.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})
        remaining = conn.execute(
            text("SELECT COUNT(*) FROM user_module_permissions WHERE user_id = :uid"),
            {"uid": user_id},
        ).scalar_one()
    assert remaining == 0


def test_downgrade_and_upgrade_again() -> None:
    cfg = build_alembic_config()
    command.downgrade(cfg, "base")
    assert "users" not in inspect(get_engine()).get_table_names()
    command.upgrade(cfg, "head")
    assert "users" in inspect(get_engine()).get_table_names()
