export const PURCHASE_NEED_RESULTS = [
  "consumo_interno",
  "consumo_interno_parcial_requisicao_compra",
  "requisicao_compra",
] as const;

export const PURCHASE_ORIGINS = ["projeto", "operacional"] as const;

export const PURCHASE_CATEGORIES = [
  "materia_prima",
  "uso_consumo",
  "ferramenta",
  "manutencao",
  "escritorio",
  "terceiros",
] as const;

export const PURCHASE_PRIORITIES = ["baixa", "normal", "urgente"] as const;

export const PURCHASE_REQUISITION_STATUSES = [
  "aberta",
  "em_compra",
  "atendida",
  "cancelada",
] as const;

export const PURCHASE_PLANNING_STATUSES = [
  "em_planejamento",
  "pronto_pedido",
  "convertido_pedido",
  "cancelado",
] as const;

export const MATERIAL_FORMS = [
  "barra",
  "chapa",
  "bloco",
  "tubo",
  "perfil",
  "peca",
] as const;

export const PURCHASE_PLANNING_MODES = [
  "manual",
  "somar_todas",
  "por_of",
  "agrupamento_parcial",
] as const;

export const PURCHASE_PLANNING_CALCULATION_CRITERIA = [
  "manual",
  "comprimento",
  "area",
  "volume",
  "peca",
] as const;

export const PURCHASE_ORDER_STATUSES = [
  "rascunho",
  "enviado",
  "confirmado",
  "cancelado",
] as const;

export const RECEIPT_STATUSES = [
  "conferido",
  "aprovado",
  "reprovado",
  "divergencia",
] as const;
