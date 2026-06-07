export const OF_PRIORITIES = ["baixa", "normal", "urgente"] as const;

export const OF_STATUSES = [
  "simulacao",
  "aguardando_material",
  "pronta_programacao",
  "programada",
  "producao",
  "parada",
  "finalizada",
] as const;

export const OF_PRIORITY_LABELS = {
  baixa: "Baixa",
  normal: "Normal",
  urgente: "Urgente",
} as const;

export const OF_STATUS_LABELS = {
  simulacao: "Simulacao",
  aguardando_material: "Aguardando material",
  pronta_programacao: "Pronta programacao",
  programada: "Programada",
  producao: "Producao",
  parada: "Parada",
  finalizada: "Finalizada",
} as const;

export const DEFAULT_PRODUCTION_SETTINGS = {
  diasBufferEntrega: 3,
  considerarSabado: false,
  eficienciaEngenharia: 0.75,
  eficienciaProducao: 0.85,
  eficienciaMontagem: 0.75,
  prazoRespostaClienteDiasUteis: 3,
} as const;

export const PRODUCTION_QUEUE_TYPES = ["simulacao", "real"] as const;

export const PRODUCTION_QUEUE_TYPE_LABELS = {
  simulacao: "Fila Simulacao",
  real: "Fila Real Producao",
} as const;
