# -*- mode: python ; coding: utf-8 -*-
# Construir desde la raíz del repo:  pyinstaller launcher\sonar_despierto.spec --noconfirm --clean
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parent          # SPECPATH = carpeta del .spec (launcher/)
BACKEND = ROOT / "backend"

# collect_submodules("app") necesita poder importar el paquete `app` (backend/app)
sys.path.insert(0, str(BACKEND))

hiddenimports = (
    collect_submodules("app")
    + collect_submodules("alembic.ddl")
    + [
        "uvicorn.logging", "uvicorn.loops.asyncio", "uvicorn.protocols.http.h11_impl",
        "uvicorn.lifespan.on", "sqlalchemy.dialects.sqlite", "logging.config", "email_validator",
    ]
)

a = Analysis(
    [str(ROOT / "launcher" / "launcher.py")],
    pathex=[str(BACKEND)],
    datas=[
        (str(ROOT / "frontend" / "dist"), "frontend/dist"),
        (str(BACKEND / "alembic"), "backend/alembic"),
        (str(BACKEND / "alembic.ini"), "backend"),
        (str(ROOT / "launcher" / "config.env.template"), "launcher"),
    ],
    hiddenimports=hiddenimports,
    excludes=["tkinter", "pytest", "pymysql", "IPython"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True, name="SonarDespierto",
    console=True, icon=str(ROOT / "launcher" / "assets" / "icon.ico"), upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="SonarDespierto")
