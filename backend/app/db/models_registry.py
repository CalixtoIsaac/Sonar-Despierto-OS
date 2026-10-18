"""Registro central de modelos.

Importar este módulo carga todos los modelos ORM para que queden registrados en
``Base.metadata``. Lo usan ``alembic/env.py`` (autogenerate) y las pruebas.
Cada módulo de dominio que defina modelos debe agregarse aquí.
"""

from app.modules.audit import models as audit_models  # noqa: F401
from app.modules.users import models as users_models  # noqa: F401
