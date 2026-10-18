"""Lógica de usuarios: alta, permisos efectivos, administrador inicial y contraseñas temporales."""

import logging
import secrets
from collections.abc import Iterable
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.modules import ALL_MODULES, ModuleKey, UserRole
from app.core.security import PASSWORD_POLICY_MESSAGE, check_password_policy, hash_password
from app.modules.audit.service import record_audit
from app.modules.users.models import User, UserModulePermission

logger = logging.getLogger(__name__)

CREDENTIALS_FILE_NAME = "CREDENCIALES_INICIALES.txt"
# Sin caracteres ambiguos al dictarlos o copiarlos a mano (0/O, 1/l/I)
_TEMP_LETTERS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
_TEMP_DIGITS = "23456789"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def effective_modules(user: User) -> list[ModuleKey]:
    """ADMIN tiene todos; OPERADOR solo los suyos. Siempre en el orden del catálogo."""
    if user.role == UserRole.ADMIN:
        return list(ALL_MODULES)
    granted = {p.module for p in user.module_permissions}
    return [m for m in ALL_MODULES if m in granted]


def has_module(user: User, module: ModuleKey) -> bool:
    return user.role == UserRole.ADMIN or module in effective_modules(user)


def create_user(
    db: Session,
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role: UserRole = UserRole.OPERADOR,
    modules: Iterable[ModuleKey] = (),
    must_change_password: bool = True,
    phone: str | None = None,
) -> User:
    email = normalize_email(email)
    if not check_password_policy(password):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    if get_user_by_email(db, email) is not None:
        raise AppError(409, "EMAIL_ALREADY_EXISTS", "Ya existe un usuario con ese correo.")
    user = User(
        email=email,
        password_hash=hash_password(password),
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        role=role,
        phone=phone,
        must_change_password=must_change_password,
    )
    if role != UserRole.ADMIN:  # el ADMIN tiene todos los módulos implícitamente
        user.module_permissions = [
            UserModulePermission(module=m) for m in ALL_MODULES if m in set(modules)
        ]
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def generate_temporary_password(length: int = 12) -> str:
    alphabet = _TEMP_LETTERS + _TEMP_DIGITS
    chars = [secrets.choice(_TEMP_LETTERS), secrets.choice(_TEMP_DIGITS)]
    chars += [secrets.choice(alphabet) for _ in range(max(length, 8) - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _credentials_path() -> Path:
    return get_settings().data_dir / CREDENTIALS_FILE_NAME


def write_credentials_file(email: str, password: str, reason: str) -> Path:
    settings = get_settings()
    path = _credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "SOÑAR DESPIERTO — CREDENCIALES DE ACCESO\n"
        "========================================\n\n"
        f"Motivo: {reason}\n\n"
        f"Dirección del sistema: http://localhost:{settings.PORT}\n"
        f"Correo: {email}\n"
        f"Contraseña temporal: {password}\n\n"
        "Al entrar, el sistema te pedirá cambiar esta contraseña.\n"
        "Este archivo se borra automáticamente cuando cambies la contraseña.\n",
        encoding="utf-8",
    )
    return path


def remove_credentials_file_if_owner(email: str) -> None:
    path = _credentials_path()
    if path.is_file() and normalize_email(email) in path.read_text(encoding="utf-8"):
        path.unlink(missing_ok=True)


def ensure_first_admin(db: Session, settings: Settings | None = None) -> str | None:
    """Crea el ADMIN inicial si no hay usuarios. Devuelve su correo, o None si ya había usuarios."""
    settings = settings or get_settings()
    if db.scalar(select(func.count(User.id))):
        return None

    email = normalize_email(settings.FIRST_ADMIN_EMAIL)
    password = settings.FIRST_ADMIN_PASSWORD
    if password and not check_password_policy(password):
        logger.warning(
            "FIRST_ADMIN_PASSWORD no cumple la política; se generará una contraseña temporal"
        )
        password = ""
    generated = not password
    if generated:
        password = generate_temporary_password()

    create_user(
        db,
        email=email,
        password=password,
        first_name="Administrador",
        last_name="General",
        role=UserRole.ADMIN,
        must_change_password=True,
    )
    if generated:
        write_credentials_file(email, password, "Primer arranque del sistema")
    logger.info("Se creó el administrador inicial (%s)", email)
    return email


def reset_password_to_temporary(db: Session, email: str | None = None) -> tuple[User, str]:
    """Asigna una contraseña temporal (soporte). Sin correo: el primer ADMIN activo."""
    if email is None:
        user = db.scalar(
            select(User)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
            .order_by(User.id)
        )
    else:
        user = get_user_by_email(db, email)
    if user is None:
        raise AppError(404, "NOT_FOUND", "No existe un usuario con ese correo.")

    password = generate_temporary_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    user.is_active = True
    user.token_version += 1  # invalida las sesiones abiertas
    record_audit(db, action="PASSWORD_RESET", entity="users", entity_id=user.id, user_id=user.id)
    db.commit()
    write_credentials_file(user.email, password, "Restablecimiento de contraseña")
    return user, password
