"""Servicio de la SPA compilada (frontend/dist) en el mismo puerto que la API."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

# Rutas que nunca deben responderse con index.html
_RESERVED_PREFIXES = ("api/", "docs", "redoc", "openapi.json")

_NOT_BUILT_HTML = """<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Soñar Despierto</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto;">
  <h1>Soñar Despierto</h1>
  <p>La interfaz no está compilada. Ejecuta <code>scripts\\build.ps1</code> o usa
  <code>npm run dev</code> en <a href="http://localhost:5173">http://localhost:5173</a>.</p>
  <p>La API está en <a href="/docs">/docs</a>.</p>
</body>
</html>"""


def mount_spa(app: FastAPI, spa_dir: Path) -> None:
    """Registra la SPA. Debe llamarse AL FINAL de create_app() porque agrega una ruta comodín."""
    spa_root = spa_dir.resolve()
    index_file = spa_root / "index.html"

    if not index_file.is_file():

        @app.get("/", include_in_schema=False)
        def spa_not_built() -> HTMLResponse:
            return HTMLResponse(_NOT_BUILT_HTML)

        return

    assets_dir = spa_root / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith(_RESERVED_PREFIXES):
            raise HTTPException(status_code=404)
        if full_path:
            candidate = (spa_root / full_path).resolve()
            # is_relative_to impide salir de dist/ con "../" (path traversal)
            if candidate.is_relative_to(spa_root) and candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(index_file, headers={"Cache-Control": "no-cache"})
