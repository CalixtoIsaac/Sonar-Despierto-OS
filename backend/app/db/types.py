"""Tipos y utilidades portables entre SQLite, MySQL y PostgreSQL (ADR-0002)."""

from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import BigInteger, Integer
from sqlalchemy import Enum as SAEnum

# BIGINT en MySQL/PostgreSQL; INTEGER en SQLite (necesario para el autoincremento del rowid)
IdType = BigInteger().with_variant(Integer(), "sqlite")


def utcnow() -> datetime:
    """Fecha-hora actual en UTC *sin* tzinfo (así se guarda en la BD)."""
    return datetime.now(UTC).replace(tzinfo=None)


def enum_column(enum_cls: type[Enum], name: str, length: int = 30) -> SAEnum:
    """Enum portable: VARCHAR + CHECK con nombre (no ENUM nativo)."""
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        validate_strings=True,
        values_callable=lambda e: [m.value for m in e],
    )
