export const DEVELOPMENT_REVIEWS = ["pdr", "cdr", "fdr"] as const;

export const DEVELOPMENT_REVIEW_LABELS = {
  pdr: "PDR",
  cdr: "CDR",
  fdr: "FDR",
} as const;

export const DEVELOPMENT_REVIEW_DESCRIPTIONS = {
  pdr: "Revisao preliminar do projeto. Congela o projeto basico.",
  cdr: "Revisao critica do projeto. Congela o projeto detalhado.",
  fdr: "Revisao final antes da fabricacao definitiva.",
} as const;

export const DEFAULT_CUSTOMER_RESPONSE_BUSINESS_DAYS = 3;
