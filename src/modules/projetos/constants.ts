export const PROJECT_NUMBER_PATTERN = /^[0-9]{6}$/;

export const PROJECT_TYPES = ["fabricacao", "desenvolvimento"] as const;

export const PROJECT_STATUSES = [
  "em_elaboracao",
  "em_analise",
  "aprovado",
  "perdido",
  "cancelado",
] as const;

export const PROJECT_TYPE_LABELS = {
  fabricacao: "Fabricação",
  desenvolvimento: "Desenvolvimento",
} as const;

export const PROJECT_STATUS_LABELS = {
  em_elaboracao: "Em elaboração",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  perdido: "Perdido",
  cancelado: "Cancelado",
} as const;

export const PROJECT_PRIORITIES = ["baixa", "normal", "urgente"] as const;

export const PROJECT_PRIORITY_LABELS = {
  baixa: "Baixa",
  normal: "Normal",
  urgente: "Urgente",
} as const;
