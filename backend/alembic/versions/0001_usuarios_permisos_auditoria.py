"""usuarios, permisos por módulo y bitácora

Revision ID: 0001
Revises:
Create Date: 2026-10-17

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Ids: BIGINT en MySQL/PostgreSQL, INTEGER en SQLite (autoincremento) — ADR-0002
ID_TYPE = sa.BigInteger().with_variant(sa.Integer(), "sqlite")

USER_ROLES = ("ADMIN", "OPERADOR")
MODULE_KEYS = (
    "VOLUNTARIOS",
    "BENEFICIARIOS",
    "EVENTOS",
    "CARTAS",
    "CALENDARIO",
    "INVENTARIO",
    "REPORTES",
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", ID_TYPE, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                *USER_ROLES, name="user_role", native_enum=False, create_constraint=True, length=20
            ),
            nullable=False,
        ),
        sa.Column("first_name", sa.String(length=80), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("idx_users_role_is_active"), "users", ["role", "is_active"])

    op.create_table(
        "user_module_permissions",
        sa.Column("id", ID_TYPE, nullable=False),
        sa.Column("user_id", ID_TYPE, nullable=False),
        sa.Column(
            "module",
            sa.Enum(
                *MODULE_KEYS,
                name="module_key",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_module_permissions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_module_permissions")),
        sa.UniqueConstraint(
            "user_id", "module", name=op.f("uq_user_module_permissions_user_id_module")
        ),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", ID_TYPE, nullable=False),
        sa.Column("user_id", ID_TYPE, nullable=True),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("entity", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.BigInteger(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(
        op.f("idx_audit_logs_entity_entity_id"), "audit_logs", ["entity", "entity_id"]
    )
    op.create_index(
        op.f("idx_audit_logs_user_id_created_at"), "audit_logs", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index(op.f("idx_audit_logs_user_id_created_at"), table_name="audit_logs")
    op.drop_index(op.f("idx_audit_logs_entity_entity_id"), table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_table("user_module_permissions")
    op.drop_index(op.f("idx_users_role_is_active"), table_name="users")
    op.drop_table("users")
