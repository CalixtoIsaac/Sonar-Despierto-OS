"""Modelo de la bitácora (Modelo_Datos.md §4.10, Fase 1 §3.6)."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import IdType, utcnow


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index(None, "entity", "entity_id"),
        Index(None, "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(IdType, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(IdType, ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    entity: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(BigInteger)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
