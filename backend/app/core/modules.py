"""Roles y catálogo de módulos (Fase 1 §3.5). El frontend replica estos valores."""

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    OPERADOR = "OPERADOR"


class ModuleKey(StrEnum):  # el orden define el orden del menú
    VOLUNTARIOS = "VOLUNTARIOS"
    BENEFICIARIOS = "BENEFICIARIOS"  # niños, escuelas, tutores (datos de menores)
    EVENTOS = "EVENTOS"
    CARTAS = "CARTAS"
    CALENDARIO = "CALENDARIO"
    INVENTARIO = "INVENTARIO"
    REPORTES = "REPORTES"


MODULE_LABELS: dict[ModuleKey, str] = {
    ModuleKey.VOLUNTARIOS: "Voluntarios",
    ModuleKey.BENEFICIARIOS: "Beneficiarios",
    ModuleKey.EVENTOS: "Eventos",
    ModuleKey.CARTAS: "Cartas de Navidad",
    ModuleKey.CALENDARIO: "Calendario",
    ModuleKey.INVENTARIO: "Inventario",
    ModuleKey.REPORTES: "Reportes",
}
ALL_MODULES: tuple[ModuleKey, ...] = tuple(ModuleKey)
