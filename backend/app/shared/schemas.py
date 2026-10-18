"""Esquemas base compartidos por los módulos."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer


def _to_utc_iso(value: datetime) -> str:
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return aware.isoformat().replace("+00:00", "Z")


# Fechas-hora de la API: ISO 8601 en UTC con sufijo Z (en la BD se guardan sin zona)
UtcDateTime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
