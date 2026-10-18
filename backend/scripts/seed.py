"""Aplica las migraciones y crea el administrador inicial si la BD está vacía.

Uso (desde backend/):  python -m scripts.seed
"""

from app.core.config import get_settings
from app.db.migrate import run_migrations
from app.db.session import dispose_engine, new_session
from app.modules.users.service import CREDENTIALS_FILE_NAME, ensure_first_admin


def main() -> None:
    settings = get_settings()
    run_migrations()
    print("Migraciones aplicadas.")
    with new_session() as db:
        email = ensure_first_admin(db)
    dispose_engine()

    if email is None:
        print("Ya existían usuarios: no se creó ningún administrador.")
        return
    print(f"Se creó el administrador inicial: {email}")
    credentials = settings.data_dir / CREDENTIALS_FILE_NAME
    if credentials.is_file():
        print(f"La contraseña temporal quedó en: {credentials}")
    else:
        print("La contraseña es la definida en FIRST_ADMIN_PASSWORD.")
    print("Al entrar por primera vez, el sistema pedirá cambiarla.")


if __name__ == "__main__":
    main()
