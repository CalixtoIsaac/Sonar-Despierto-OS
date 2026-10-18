"""Registro central de modelos.

Importar este módulo carga todos los modelos ORM para que queden registrados en
``Base.metadata``. Lo usan ``alembic/env.py`` (autogenerate) y las pruebas.
Cada módulo de dominio que defina modelos debe agregarse aquí, por ejemplo:

    from app.modules.users import models as users_models  # noqa: F401

Por ahora no hay modelos: la subtarea 1.3 agrega usuarios, permisos y auditoría.
"""
