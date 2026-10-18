"""Crea un usuario desde la consola (desarrollo y soporte hasta que exista la UI de la Fase 2).

Uso (desde backend/):
  python -m scripts.create_user --email ana@sonardespierto.org --first-name Ana --last-name Prueba \
      --role OPERADOR --modules CARTAS,CALENDARIO [--password Clave1234] [--no-must-change]
"""

import argparse
import sys

from app.core.errors import AppError
from app.core.modules import ModuleKey, UserRole
from app.db.session import dispose_engine, new_session
from app.modules.users.service import create_user, effective_modules, generate_temporary_password


def _parse_modules(raw: str) -> list[ModuleKey]:
    modules: list[ModuleKey] = []
    for item in (part.strip().upper() for part in raw.split(",") if part.strip()):
        try:
            modules.append(ModuleKey(item))
        except ValueError:
            valid = ", ".join(m.value for m in ModuleKey)
            raise argparse.ArgumentTypeError(
                f"Módulo desconocido: {item}. Valores válidos: {valid}"
            ) from None
    return modules


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.create_user", description="Crea un usuario de Soñar Despierto."
    )
    parser.add_argument("--email", required=True, help="Correo del usuario")
    parser.add_argument("--first-name", required=True, help="Nombre(s)")
    parser.add_argument("--last-name", required=True, help="Apellidos")
    parser.add_argument(
        "--role", choices=[r.value for r in UserRole], default=UserRole.OPERADOR.value
    )
    parser.add_argument(
        "--modules",
        type=_parse_modules,
        default=[],
        help="Módulos separados por comas (solo OPERADOR), p. ej. CARTAS,CALENDARIO",
    )
    parser.add_argument("--password", help="Si se omite, se genera una contraseña temporal")
    parser.add_argument(
        "--no-must-change",
        action="store_true",
        help="No obligar a cambiar la contraseña en el primer acceso",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    password = args.password or generate_temporary_password()
    try:
        with new_session() as db:
            user = create_user(
                db,
                email=args.email,
                password=password,
                first_name=args.first_name,
                last_name=args.last_name,
                role=UserRole(args.role),
                modules=args.modules,
                must_change_password=not args.no_must_change,
            )
            modules = ", ".join(m.value for m in effective_modules(user)) or "(ninguno)"
    except AppError as exc:
        print(f"Error: {exc.message}", file=sys.stderr)
        return 1
    except ValueError as exc:  # contraseña fuera de la política
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        dispose_engine()

    print(f"Usuario creado: {user.email} ({user.role.value})")
    print(f"Módulos: {modules}")
    if not args.password:
        print(f"Contraseña temporal (se muestra una sola vez): {password}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
