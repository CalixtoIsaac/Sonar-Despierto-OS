# Soñar Despierto — Sistema de Gestión

Plataforma web para gestionar voluntarios, niños beneficiarios, escuelas y cartas de Navidad.
Documentación de diseño en [`docs/`](docs/).

## Requisitos
- Python 3.12
- MySQL 8.0+

## Puesta en marcha (Windows / PowerShell)

```powershell
# 1. Base de datos (una sola vez): ejecuta backend/scripts/create_database.sql en MySQL

# 2. Entorno virtual y dependencias
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. Configuración
copy .env.example .env      # edita DATABASE_URL y JWT_SECRET_KEY

# 4. Levantar la API
uvicorn app.main:app --reload
```

Abre:
- http://localhost:8000/api/v1/health → `{"status":"ok"}`
- http://localhost:8000/api/v1/health/db → confirma la conexión a MySQL
- http://localhost:8000/docs → Swagger UI

## Pruebas
```powershell
cd backend
pytest
```

## Estado
- [x] Paso 1: esqueleto backend, configuración, conexión BD, `/health`
- [ ] Paso 2: modelos + migración inicial + seed admin
