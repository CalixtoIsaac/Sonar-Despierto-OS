# Soñar Despierto — Sistema de Gestión

Plataforma web para gestionar voluntarios, niños beneficiarios, escuelas y cartas de Navidad.
Documentación de diseño en [`docs/`](docs/).

<p align="center">
  <img width="225" height="225" alt="image" src="https://github.com/user-attachments/assets/d0fa246f-259d-4ec5-8467-b680b2a6e29f" />
</p>

## Requisitos de desarrollo
- Windows 10/11
- Python 3.12
- Node 22 LTS
- Git

## Puesta en marcha (Windows / PowerShell)

```powershell
# 1. Prepara el entorno (entorno virtual, dependencias y backend\.env)
powershell -ExecutionPolicy Bypass -File scripts\setup-dev.ps1

# 2. Levanta la API en modo desarrollo
powershell -ExecutionPolicy Bypass -File scripts\dev-backend.ps1
```

Abre:
- http://127.0.0.1:8000/api/v1/health → `{"status":"ok"}`
- http://127.0.0.1:8000/docs → Swagger UI

## Pruebas y calidad
```powershell
cd backend
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\ruff.exe format --check .
.\.venv\Scripts\python.exe -m pytest
```

## Documentación
- Hoja de ruta: [`docs/Roadmap_Fases.md`](docs/Roadmap_Fases.md)
- Decisiones de arquitectura (ADR): [`docs/adr/`](docs/adr/)
- Prompts y tareas por fase: [`docs/fases/`](docs/fases/)

## Estado
Fase 1 (fundación y esqueleto ejecutable) en curso:
- [x] 1.1 Saneamiento del repositorio y estructura modular
- [ ] 1.2 Núcleo backend: configuración, datos locales, SQLite, Alembic y SPA
- [ ] 1.3 Usuarios, autenticación JWT y permisos por módulo
- [ ] 1.4 Migración del diseño Lovable a una SPA con Vite
- [ ] 1.5 Integración de autenticación frontend ↔ API
- [ ] 1.6 Lanzador, build y ejecutable Windows
