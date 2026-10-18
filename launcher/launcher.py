"""Lanzador de Soñar Despierto: prepara los datos, inicia el servidor local y abre el navegador.

Ver ADR-0003. Uso desde el código fuente:  python launcher/launcher.py [--no-browser] [--port N]
"""

from __future__ import annotations

import argparse
import contextlib
import ipaddress
import json
import os
import shutil
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import uvicorn

    from app.core.config import Settings

APP_ID = "sonar-despierto"
PORT_SEARCH_RANGE = 20
STARTUP_TIMEOUT_S = 60
BANNER_WIDTH = 60

IS_FROZEN = bool(getattr(sys, "frozen", False))

if not IS_FROZEN:  # desde el código fuente: hace importable el paquete `app`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="SonarDespierto", description="Sistema de Gestión Soñar Despierto"
    )
    parser.add_argument(
        "--no-browser", action="store_true", help="No abrir el navegador al iniciar"
    )
    parser.add_argument("--port", type=int, help="Puerto a usar (sustituye a PORT de config.env)")
    parser.add_argument(
        "--lan", action="store_true", help="Permitir el acceso desde otras PCs de la red"
    )
    parser.add_argument("--data-dir", help="Carpeta de datos (por defecto %%LOCALAPPDATA%%)")
    parser.add_argument(
        "--reset-admin",
        action="store_true",
        help="Asigna una contraseña temporal al administrador y termina",
    )
    parser.add_argument("--email", help="Con --reset-admin: correo del usuario a restablecer")
    return parser.parse_args(argv)


def apply_env(args: argparse.Namespace) -> None:
    """Se ejecuta ANTES de importar app.* (paths y config leen el entorno al importarse)."""
    if args.data_dir:
        os.environ["SD_DATA_DIR"] = str(Path(args.data_dir).expanduser().resolve())
    if args.port:
        os.environ["PORT"] = str(args.port)
    if args.lan:
        os.environ["LAN_MODE"] = "true"
    if IS_FROZEN:
        os.environ.setdefault("APP_ENV", "production")


def configure_console() -> None:
    """Consola en UTF-8 (acentos y ñ) y título de la ventana en Windows."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            # Consola sin soporte: se deja como está
            with contextlib.suppress(OSError, ValueError):
                reconfigure(encoding="utf-8", errors="replace")
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.kernel32.SetConsoleTitleW("Soñar Despierto")
        except (AttributeError, OSError):
            pass  # sin consola (p. ej. salida redirigida)


def template_path() -> Path:
    """Plantilla de config.env: junto a launcher.py o, en el ejecutable, en _MEIPASS/launcher."""
    if IS_FROZEN:
        return Path(sys._MEIPASS) / "launcher" / "config.env.template"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent / "config.env.template"


def write_default_config(data_dir: Path) -> bool:
    """Copia la plantilla a {data_dir}/config.env si no existe. Devuelve True si la creó."""
    target = data_dir / "config.env"
    if target.exists():
        return False
    source = template_path()
    if not source.is_file():
        return False
    data_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return True


def health_info(port: int, timeout: float = 1.5) -> dict[str, Any] | None:
    """Respuesta de GET /api/v1/health en este equipo, o None si no responde."""
    url = f"http://127.0.0.1:{port}/api/v1/health"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310  URL local fija
            data = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def is_our_instance(port: int) -> bool:
    info = health_info(port)
    return info is not None and info.get("app") == APP_ID


def port_is_free(host: str, port: int) -> bool:
    """Intenta ocupar el puerto. Sin SO_REUSEADDR: en Windows permitiría puertos ya ocupados."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def find_free_port(host: str, start: int, span: int = PORT_SEARCH_RANGE) -> int:
    for port in range(start, start + span):
        if port_is_free(host, port):
            return port
    raise RuntimeError(f"No hay puertos libres entre {start} y {start + span - 1}.")


def lan_ipv4_addresses() -> list[str]:
    """IPv4 de este equipo en la red local (sin 127.*). No envía tráfico."""
    found: list[str] = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.append(str(info[4][0]))
    except OSError:
        pass  # nombre de equipo no resoluble
    try:
        # Truco UDP: connect() solo elige la interfaz de salida, no envía paquetes
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))
            found.append(str(sock.getsockname()[0]))
    except OSError:
        pass  # sin red

    result: list[str] = []
    for address in found:
        try:
            ip = ipaddress.IPv4Address(address)
        except ValueError:
            continue
        if ip.is_loopback or ip.is_unspecified or ip.is_link_local or address in result:
            continue
        result.append(address)
    return result


def _line(label: str, value: str) -> str:
    return f"  {label:<30}{value}"


def print_banner(local_url: str, lan_urls: list[str], data_dir: Path, version: str) -> None:
    lines = [
        "=" * BANNER_WIDTH,
        f"  Soñar Despierto — Sistema de Gestión  v{version}",
        "-" * BANNER_WIDTH,
        _line("Abierto en esta computadora:", local_url),
    ]
    if lan_urls:
        lines.append(_line("Desde otras PCs de la red:", lan_urls[0]))
        lines.extend(_line("", url) for url in lan_urls[1:])
    else:
        lines.append("  Acceso desde otras PCs: desactivado (LAN_MODE=false en config.env)")
    lines += [
        _line("Datos y respaldos en:", str(data_dir)),
        "-" * BANNER_WIDTH,
        "  NO cierres esta ventana mientras uses el sistema.",
        "  Para apagarlo: cierra esta ventana o presiona Ctrl+C.",
        "=" * BANNER_WIDTH,
    ]
    print("\n".join(lines), flush=True)


def print_initial_credentials(data_dir: Path) -> None:
    """Si hay credenciales iniciales pendientes de cambio, las muestra enmarcadas."""
    path = data_dir / "CREDENCIALES_INICIALES.txt"
    if not path.is_file():
        return
    content = path.read_text(encoding="utf-8").strip()
    print("\n" + "*" * BANNER_WIDTH)
    for line in content.splitlines():
        print(f"  {line}")
    print(f"\n  (También están en: {path})")
    print("*" * BANNER_WIDTH, flush=True)


def announce_when_ready(
    server: uvicorn.Server, port: int, settings: Settings, open_browser: bool
) -> None:
    """Hilo: espera a que el servidor responda; luego banner, credenciales y navegador."""
    from app import __version__

    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    while time.monotonic() < deadline:
        if server.started and health_info(port) is not None:
            break
        if server.should_exit:
            return
        time.sleep(0.25)
    else:
        print("Aviso: el sistema tarda en responder. Revisa el registro en la carpeta de datos.")
        return

    local_url = f"http://localhost:{port}"
    lan_urls = [f"http://{ip}:{port}" for ip in lan_ipv4_addresses()] if settings.LAN_MODE else []
    print_banner(local_url, lan_urls, settings.data_dir, __version__)
    print_initial_credentials(settings.data_dir)
    if open_browser:
        webbrowser.open(f"{local_url}/")


def reset_admin(email: str | None) -> int:
    """Asigna una contraseña temporal (soporte). Sin correo: el primer administrador activo."""
    from app.core.errors import AppError
    from app.db.migrate import run_migrations
    from app.db.session import dispose_engine, new_session
    from app.modules.users.service import CREDENTIALS_FILE_NAME, reset_password_to_temporary

    try:
        run_migrations()
        with new_session() as db:
            user, password = reset_password_to_temporary(db, email)
            user_email = user.email
    except AppError as exc:
        print(f"Error: {exc.message}")
        return 1
    finally:
        dispose_engine()

    from app.core.config import get_settings

    print(f"Se restableció la contraseña de {user_email}.")
    print(f"Contraseña temporal (se muestra una sola vez): {password}")
    print(f"También quedó en: {get_settings().data_dir / CREDENTIALS_FILE_NAME}")
    print("Al entrar, el sistema pedirá cambiarla.")
    return 0


def pause_if_frozen() -> None:
    """En el ejecutable, evita que la ventana se cierre antes de poder leer el mensaje."""
    if IS_FROZEN:
        with contextlib.suppress(EOFError):  # sin consola interactiva
            input("\nPresiona Enter para cerrar...")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    apply_env(args)
    configure_console()

    from app.core import paths  # importación diferida (después de apply_env)

    paths.ensure_data_dirs(paths.DATA_DIR)
    write_default_config(paths.DATA_DIR)

    from app.core.config import get_settings

    settings = get_settings()

    if args.reset_admin:
        code = reset_admin(args.email)
        pause_if_frozen()
        return code

    if is_our_instance(settings.PORT):
        print("Soñar Despierto ya está abierto. Abriendo el navegador…")
        if not args.no_browser:
            webbrowser.open(f"http://localhost:{settings.PORT}/")
        return 0

    try:
        port = (
            settings.PORT
            if port_is_free(settings.bind_host, settings.PORT)
            else find_free_port(settings.bind_host, settings.PORT + 1)
        )
    except RuntimeError as exc:
        print(f"Error: {exc}")
        pause_if_frozen()
        return 1
    if port != settings.PORT:
        print(f"Aviso: el puerto {settings.PORT} está ocupado por otro programa; se usará {port}.")

    import uvicorn

    from app.main import app

    config = uvicorn.Config(
        app,
        host=settings.bind_host,
        port=port,
        log_config=None,
        access_log=False,
        http="h11",
        loop="asyncio",
        lifespan="on",
    )
    server = uvicorn.Server(config)
    threading.Thread(
        target=announce_when_ready,
        args=(server, port, settings, not args.no_browser),
        daemon=True,
    ).start()
    with contextlib.suppress(KeyboardInterrupt, SystemExit):
        server.run()  # hilo principal: Ctrl+C lo maneja uvicorn
    if not server.started:
        print(
            "No se pudo iniciar el sistema. Revisa el registro en:",
            paths.DATA_DIR / "logs" / "sonar.log",
        )
        pause_if_frozen()
        return 1
    print("Sistema detenido. Ya puedes cerrar esta ventana.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
