export const MATERIAL_UNITS = ["kg", "metro", "barra", "chapa", "peca"] as const;

export const STOCK_DECISION_STATUSES = [
  "disponivel",
  "compra_necessaria",
] as const;

export const STOCK_DECISION_STATUS_LABELS = {
  disponivel: "Disponivel",
  compra_necessaria: "Compra necessaria",
} as const;
