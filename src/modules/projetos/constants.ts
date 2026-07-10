export const PROJECT_NUMBER_PATTERN = /^[0-9]{6}$/;

export const PROJECT_TYPES = [
  "fabricacao",
  "desenvolvimento",
  "industrializacao",
  "servico",
] as const;

export const PROJECT_STATUSES = [
  "rascunho",
  "em_analise",
  "reprovado",
  "aprovado",
] as const;

export const PROJECT_TYPE_LABELS = {
  fabricacao: "Fabricação",
  desenvolvimento: "Desenvolvimento",
  industrializacao: "Industrialização",
  servico: "Serviço",
} as const;

export const PROJECT_STATUS_LABELS = {
  rascunho: "Em elaboração",
  em_analise: "Em análise",
  reprovado: "Reprovado",
  aprovado: "Aprovado",
} as const;

export const PROJECT_PRIORITIES = ["baixa", "normal", "urgente"] as const;

export const PROJECT_PRIORITY_LABELS = {
  baixa: "Baixa",
  normal: "Normal",
  urgente: "Urgente",
} as const;
