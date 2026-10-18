from collections.abc import Callable

import pytest
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.modules import ALL_MODULES, ModuleKey, UserRole
from app.core.security import check_password_policy
from app.modules.users.models import User
from app.modules.users.service import (
    create_user,
    effective_modules,
    generate_temporary_password,
    has_module,
)

MakeUser = Callable[..., tuple[User, str]]


def test_duplicate_email(db: Session, make_user: MakeUser) -> None:
    make_user(email="ana@sonardespierto.org")
    with pytest.raises(AppError) as exc_info:
        create_user(
            db,
            email=" ANA@sonardespierto.org ",
            password="Clave12345",
            first_name="Ana",
            last_name="Otra",
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "EMAIL_ALREADY_EXISTS"
    assert exc_info.value.message == "Ya existe un usuario con ese correo."


def test_password_outside_policy_is_rejected(db: Session) -> None:
    with pytest.raises(ValueError):
        create_user(
            db, email="x@sonardespierto.org", password="corta", first_name="X", last_name="Y"
        )


def test_admin_has_all_modules_in_order(make_user: MakeUser) -> None:
    admin, _ = make_user(role=UserRole.ADMIN, modules=(ModuleKey.CARTAS,))
    assert effective_modules(admin) == list(ALL_MODULES)
    assert admin.module_permissions == []  # el ADMIN no guarda filas de módulos


def test_operator_modules_follow_catalog_order(make_user: MakeUser) -> None:
    operator, _ = make_user(modules=(ModuleKey.REPORTES, ModuleKey.CARTAS, ModuleKey.VOLUNTARIOS))
    assert effective_modules(operator) == [
        ModuleKey.VOLUNTARIOS,
        ModuleKey.CARTAS,
        ModuleKey.REPORTES,
    ]
    assert has_module(operator, ModuleKey.CARTAS)
    assert not has_module(operator, ModuleKey.BENEFICIARIOS)


def test_temporary_passwords_meet_policy() -> None:
    ambiguous = set("0O1lI")
    for _ in range(100):
        password = generate_temporary_password()
        assert len(password) == 12
        assert check_password_policy(password)
        assert not ambiguous & set(password)
