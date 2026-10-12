# Arquitectura y Convenciones del Proyecto — Soñar Despierto

> **Propósito:** fijar la estructura de carpetas, configuración, convenciones y orden de construcción **antes** de generar código, para que todo el código (escrito por personas o por IA) sea consistente.
> **Documentos relacionados:** `Requerimientos_Tecnicos.md`, `Modelo_Datos.md`, `API_Spec.md`, `Pantallas_UI.md`

---

## 1. Arquitectura general

```mermaid
flowchart LR
    B[Navegador<br/>HTML/CSS/JS Vanilla] -- "HTTPS + JSON<br/>Bearer JWT" --> A[FastAPI<br/>/api/v1]
    A -- SQLAlchemy 2.0 --> D[(MySQL 8)]
    A -- archivos --> S[/uploads/ privado<br/>fotos de cartas/]
```

- **Frontend estático** servido por el propio FastAPI (`StaticFiles`) en desarrollo; en producción puede ir detrás de Nginx.
- **Backend en capas:** `routers` (HTTP) → `services` (reglas de negocio) → `models` (SQLAlchemy). Los routers **no** contienen lógica de negocio.

## 2. Stack y versiones

| Pieza | Elección |
|---|---|
| Python | 3.12 |
| Framework | FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.0 (estilo tipado `Mapped[...]`) |
| Driver MySQL | PyMySQL |
| Migraciones | Alembic |
| Validación | Pydantic v2 + `pydantic-settings` |
| Seguridad | `passlib[bcrypt]` (o `bcrypt`), `python-jose` / `PyJWT` |
| Imágenes | Pillow (redimensionar y quitar EXIF) |
| Pruebas | pytest + httpx (`TestClient`) |
| Calidad | Ruff (lint + formato) |
| Frontend | HTML5, CSS3 (variables CSS), JS ES Modules, sin build step |

## 3. Estructura de carpetas

```text
Sonar-Despierto-OS/
├── docs/
│   ├── Requerimientos_Tecnicos.md
│   ├── Modelo_Datos.md
│   ├── API_Spec.md
│   ├── Pantallas_UI.md
│   └── Arquitectura_y_Convenciones.md
├── backend/
│   ├── app/
│   │   ├── main.py              # crea la app, CORS, routers, static
│   │   ├── core/
│   │   │   ├── config.py        # Settings (lee .env)
│   │   │   ├── security.py      # hash, JWT
│   │   │   ├── deps.py          # get_db, get_current_user, require_roles(...)
│   │   │   └── errors.py        # AppError + handlers → formato de error estándar
│   │   ├── db/
│   │   │   ├── base.py          # Base declarativa
│   │   │   └── session.py       # engine, SessionLocal
│   │   ├── models/              # un archivo por tabla
│   │   ├── schemas/             # Pydantic: *Create, *Update, *Out
│   │   ├── services/            # lógica: letters_service.py, children_service.py...
│   │   ├── routers/             # auth.py, users.py, volunteers.py, schools.py,
│   │   │                        # children.py, events.py, letters.py, dashboard.py
│   │   └── utils/               # paginación, archivos, auditoría
│   ├── alembic/
│   ├── scripts/seed.py
│   ├── tests/
│   ├── uploads/                 # fotos (fuera de git, fuera de static)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html               # login
│   ├── registro.html
│   ├── admin/ tutor/ voluntario/  # páginas por rol
│   ├── css/  (variables.css, base.css, components.css)
│   ├── js/
│   │   ├── api.js  auth.js  layout.js
│   │   ├── components/          # datatable.js, modal.js, toast.js...
│   │   └── pages/               # un módulo JS por página
│   └── assets/                  # logo, íconos
├── .gitignore
└── README.md
```

> El `Main.py` vacío actual en la raíz se elimina o se reemplaza por `backend/app/main.py`.

## 4. Variables de entorno (`backend/.env.example`)

```ini
APP_ENV=development
DATABASE_URL=mysql+pymysql://sonar_app:CAMBIAR@localhost:3306/sonar_despierto
JWT_SECRET_KEY=CAMBIAR_POR_CADENA_LARGA_ALEATORIA
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
FRONTEND_ORIGIN=http://localhost:8000
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=5
FIRST_ADMIN_EMAIL=admin@sonardespierto.org
FIRST_ADMIN_PASSWORD=CAMBIAR
```

`.env` **nunca** se sube a git (`.gitignore`: `.env`, `uploads/`, `__pycache__/`, `.venv/`).

## 5. Convenciones de código

| Ámbito | Regla |
|---|---|
| Idioma | Código, tablas, variables y rutas en **inglés**; textos de UI y mensajes de error en **español**. |
| Python | PEP 8 vía Ruff, type hints obligatorios, funciones de servicio puras que reciben `db: Session`. |
| Schemas | `XCreate` (entrada), `XUpdate` (todo opcional, para PATCH), `XOut` (salida). `model_config = ConfigDict(from_attributes=True)`. |
| Errores | Lanzar `AppError(status, code, message)`; nunca `HTTPException` con texto libre en servicios. |
| Permisos | Dependencia `require_roles("ADMIN", "TUTOR")` en cada router + filtro de alcance en el servicio. |
| Transacciones | Un `commit` por request en el servicio; transiciones de carta con `with_for_update()`. |
| JS | ES Modules, `const`/`let`, sin librerías salvo necesidad clara; nada de lógica de permisos confiada solo al frontend. |
| CSS | Variables en `:root` con la paleta (`--color-coral: #EF4044` …); clases BEM ligeras (`.card`, `.card__title`). |
| Git | Rama `main` estable; ramas `feat/<modulo>`; commits en español con prefijo (`feat:`, `fix:`, `docs:`). |

## 6. Seguridad (resumen operativo)

- Tokens en `sessionStorage` (se borran al cerrar la pestaña); en Fase 2 evaluar cookie `HttpOnly`.
- Nunca escribir datos de niños en `console.log` ni en logs del servidor.
- Validar permisos **siempre** en backend (el frontend solo oculta botones).
- Usuario MySQL con privilegios mínimos; respaldo diario de la BD.

## 7. Orden de construcción recomendado

| Paso | Entregable | Verificación |
|---|---|---|
| 1 | Esqueleto backend, config, conexión BD, `/health` | `uvicorn` levanta y `/docs` abre |
| 2 | Modelos + migración inicial Alembic + seed admin | Tablas creadas en MySQL |
| 3 | Auth (register, login, refresh, me, change-password) + `require_roles` | Pruebas de login y 401/403 |
| 4 | Frontend base: `api.js`, login, layout por rol, guard | Login redirige al dashboard correcto |
| 5 | Voluntarios (perfil, listado, export) + pantallas P02, P03, P08, P09 | |
| 6 | Escuelas, usuarios/tutores + P10, P11 | |
| 7 | Niños + P12–P14 | Duplicados devuelven 409; tutor solo ve los suyos |
| 8 | Eventos + postulaciones + P22–P24 | |
| 9 | Cartas (crear, foto, adopt/release, status, historial) + P15–P21 | Prueba de concurrencia en adopción |
| 10 | Dashboard summary + P05–P07 | |
| 11 | Pruebas finales, revisión de seguridad, datos semilla de demo | |

## 8. Definición de "terminado" por módulo
1. Endpoints documentados en Swagger y coinciden con `API_Spec.md`.
2. Pruebas de: caso feliz, validación (422), permiso (403/404 de alcance), duplicado/conflicto (409).
3. Pantalla con estados de carga, vacío y error.
4. Usable en móvil a 360 px.
