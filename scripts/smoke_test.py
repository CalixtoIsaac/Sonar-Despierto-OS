"""Prueba de humo del sistema completo (ejecutable o código fuente). Solo biblioteca estándar.

Uso:
  python scripts/smoke_test.py --exe dist/SonarDespierto/SonarDespierto.exe
  python scripts/smoke_test.py            # desde el código fuente (requiere npm run build)
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
APP_ID = "sonar-despierto"
STARTUP_TIMEOUT_S = 90
NEW_PASSWORD = "HumoPrueba2026"  # noqa: S105  solo vive en la BD temporal de la prueba
# Variables que no deben heredarse: la prueba parte de un arranque limpio
_CLEAN_ENV_KEYS = ("DATABASE_URL", "SD_DATA_DIR", "JWT_SECRET_KEY", "APP_ENV", "ENABLE_DOCS")


class SmokeError(Exception):
    """Un paso de la prueba falló."""


def request(
    base: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, str]:
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    # S310: la URL base siempre es http://127.0.0.1:<puerto> (servidor local)
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=10) as res:  # noqa: S310
            return res.status, res.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def check(condition: bool, step: str) -> None:
    if not condition:
        raise SmokeError(step)
    print(f"  ok  {step}")


def clean_env() -> dict[str, str]:
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("FIRST_ADMIN_") and k not in _CLEAN_ENV_KEYS
    }
    # Vacías de forma explícita: así tampoco las toma de un backend/.env de desarrollo
    env.update(
        {"FIRST_ADMIN_PASSWORD": "", "DATABASE_URL": "", "JWT_SECRET_KEY": "", "PYTHONUTF8": "1"}
    )
    return env


def wait_until_ready(base: str, process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise SmokeError(f"el proceso terminó al arrancar (código {process.returncode})")
        try:
            status, text = request(base, "GET", "/api/v1/health")
            if status == 200 and json.loads(text).get("app") == APP_ID:
                return
        except (OSError, ValueError):
            pass  # todavía no responde
        time.sleep(0.5)
    raise SmokeError(f"/api/v1/health no respondió en {STARTUP_TIMEOUT_S} s")


def read_credentials(path: Path) -> tuple[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition(":")
        if sep:
            values[key.strip()] = value.strip()
    return values["Correo"], values["Contraseña temporal"]


def run_checks(base: str, data_dir: Path, frozen: bool) -> None:
    check((data_dir / "sonar.db").is_file(), "existe sonar.db en el directorio de datos")
    credentials = data_dir / "CREDENCIALES_INICIALES.txt"
    check(credentials.is_file(), "existe CREDENCIALES_INICIALES.txt")
    email, password = read_credentials(credentials)

    status, text = request(
        base, "POST", "/api/v1/auth/login", {"email": email, "password": password}
    )
    login = json.loads(text) if status == 200 else {}
    check(
        status == 200 and login.get("user", {}).get("must_change_password") is True,
        "login del administrador inicial (must_change_password = true)",
    )

    status, text = request(base, "GET", "/api/v1/_x")
    check(
        status == 404 and json.loads(text)["error"]["code"] == "NOT_FOUND",
        "ruta inexistente de la API → 404 JSON",
    )

    status, text = request(
        base,
        "POST",
        "/api/v1/auth/change-password",
        {"current_password": password, "new_password": NEW_PASSWORD},
        token=login["access_token"],
    )
    check(status == 200, "cambio de contraseña → 200")
    check(not credentials.exists(), "el archivo de credenciales se borró")
    new_token = json.loads(text)["access_token"]

    status, _ = request(base, "GET", "/api/v1/auth/me", token=new_token)
    check(status == 200, "/auth/me con el token nuevo → 200")

    for path in ("/", "/app/calendario"):
        status, text = request(base, "GET", path)
        check(status == 200 and '<div id="root">' in text, f"GET {path} → interfaz (SPA)")

    if frozen:
        status, _ = request(base, "GET", "/docs")
        check(status == 404, "/docs desactivado en producción → 404")


def stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def main(argv: list[str] | None = None) -> int:
    # Salida en UTF-8 también cuando se redirige (en Windows sería cp1252 y fallaría con "→")
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Prueba de humo de Soñar Despierto")
    parser.add_argument("--exe", help="Ruta a SonarDespierto.exe (si se omite, usa el código)")
    parser.add_argument("--port", type=int, default=8799)
    args = parser.parse_args(argv)

    if args.exe:
        command = [str(Path(args.exe).resolve())]
    else:
        command = [sys.executable, str(ROOT / "launcher" / "launcher.py")]
    data_dir = Path(tempfile.mkdtemp(prefix="sd-smoke-"))
    command += ["--no-browser", "--port", str(args.port), "--data-dir", str(data_dir)]
    base = f"http://127.0.0.1:{args.port}"

    print(f"Prueba de humo: {' '.join(command)}")
    log_path = data_dir.parent / f"{data_dir.name}-salida.txt"
    with log_path.open("wb") as log:
        process = subprocess.Popen(  # noqa: S603  comando construido por este script
            command, env=clean_env(), stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL
        )
        try:
            wait_until_ready(base, process)
            run_checks(base, data_dir, frozen=bool(args.exe))
        except (SmokeError, KeyError, ValueError) as exc:
            print(f"SMOKE TEST FALLÓ: {exc}")
            stop(process)
            print("--- salida del proceso ---")
            print(log_path.read_text(encoding="utf-8", errors="replace")[-4000:])
            return 1
        finally:
            stop(process)
            shutil.rmtree(data_dir, ignore_errors=True)
    log_path.unlink(missing_ok=True)
    print("SMOKE TEST OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
