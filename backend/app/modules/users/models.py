"""Modelos de usuarios y permisos por módulo (Fase 1 §3.6)."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.modules import ModuleKey, UserRole
from app.db.base import Base, TimestampMixin
from app.db.types import IdType, enum_column, utcnow


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (Index(None, "role", "is_active"),)

    id: Mapped[int] = mapped_column(IdType, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole, "user_role", 20), nullable=False, default=UserRole.OPERADOR
    )
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    module_permissions: Mapped[list["UserModulePermission"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class UserModulePermission(Base):
    __tablename__ = "user_module_permissions"
    __table_args__ = (UniqueConstraint("user_id", "module"),)

    id: Mapped[int] = mapped_column(IdType, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        IdType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    module: Mapped[ModuleKey] = mapped_column(
        enum_column(ModuleKey, "module_key", 30), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="module_permissions")
