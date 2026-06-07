import type { DEVELOPMENT_REVIEWS } from "./constants";

export type DevelopmentReview = (typeof DEVELOPMENT_REVIEWS)[number];

export type CustomerApprovalStatus =
  | "aguardando_cliente"
  | "aprovado_cliente"
  | "alteracao_solicitada"
  | "atrasado";
