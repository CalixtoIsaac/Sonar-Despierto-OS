"""Esquemas de la API de autenticación (Fase 1 §3.7)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from app.core.modules import ModuleKey, UserRole
from app.core.security import PASSWORD_POLICY_MESSAGE, check_password_policy
from app.modules.users.models import User
from app.modules.users.service import effective_modules
from app.shared.schemas import UtcDateTime


class LoginRequest(BaseModel):
    # Sin validar formato de correo: no se revela información (§3.7)
    email: str = Field(min_length=3, max_length=255, examples=["admin@sonardespierto.org"])
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_policy(cls, value: str) -> str:
        if not check_password_policy(value):
            # PydanticCustomError: el mensaje sale sin el prefijo "Value error,"
            raise PydanticCustomError("password_policy", PASSWORD_POLICY_MESSAGE)
        return value


class UserMe(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: UserRole
    is_active: bool
    must_change_password: bool
    modules: list[ModuleKey]
    last_login_at: UtcDateTime | None

    @classmethod
    def from_user(cls, user: User) -> "UserMe":
        return cls(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            role=user.role,
            is_active=user.is_active,
            must_change_password=user.must_change_password,
            modules=effective_modules(user),
            last_login_at=user.last_login_at,
        )


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105  esquema OAuth2, no un secreto
    expires_in: int  # segundos de vida del access_token
    user: UserMe
