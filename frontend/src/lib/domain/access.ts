// Espejo de backend/app/core/modules.py (Fase 1 §3.5). Mantener sincronizado.

export const USER_ROLES = ["ADMIN", "OPERADOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrador",
  OPERADOR: "Operador",
};

// El orden define el orden del menú
export const MODULE_KEYS = [
  "VOLUNTARIOS",
  "BENEFICIARIOS",
  "EVENTOS",
  "CARTAS",
  "CALENDARIO",
  "INVENTARIO",
  "REPORTES",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_INFO: Record<ModuleKey, { label: string; phase: number; description: string }> =
  {
    VOLUNTARIOS: {
      label: "Voluntarios",
      phase: 3,
      description: "Registro de voluntarios, contacto de emergencia, talla y área de apoyo.",
    },
    BENEFICIARIOS: {
      label: "Beneficiarios",
      phase: 3,
      description: "Niños, escuelas y tutores responsables, con consentimiento del tutor.",
    },
    EVENTOS: {
      label: "Eventos",
      phase: 4,
      description: "Macro-eventos de Navidad y Día del Niño y su logística.",
    },
    CARTAS: {
      label: "Cartas de Navidad",
      phase: 4,
      description: "Cartas, padrinos, estatus del regalo e historial completo.",
    },
    CALENDARIO: {
      label: "Calendario",
      phase: 5,
      description: "Juntas, capacitaciones, acopios y eventos en vista mensual y semanal.",
    },
    INVENTARIO: {
      label: "Inventario",
      phase: 6,
      description: "Insumos, mobiliario y materiales por centro de acopio.",
    },
    REPORTES: {
      label: "Reportes",
      phase: 7,
      description: "Indicadores por evento y exportaciones.",
    },
  };
