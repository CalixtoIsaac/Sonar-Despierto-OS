// Estatus de las cartas de Navidad (ADR-0006). Etiquetas de Pantallas_UI.md §1.1.

export const LETTER_STATUSES = ["PENDIENTE", "ASIGNADO", "RECIBIDO", "ENTREGADO"] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

export const LETTER_STATUS_LABEL: Record<LetterStatus, string> = {
  PENDIENTE: "Pendiente",
  ASIGNADO: "Con padrino",
  RECIBIDO: "Regalo recibido",
  ENTREGADO: "Entregado ✓",
};
