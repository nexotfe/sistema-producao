import type {
  MATERIAL_UNITS,
  STOCK_DECISION_STATUSES,
} from "./constants";

export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export type StockDecisionStatus = (typeof STOCK_DECISION_STATUSES)[number];

export type MaterialRequirementInput = {
  materiaPrimaId: string;
  materiaPrimaDescricao: string;
  consumoUnitario: number;
  quantidadeFabricar: number;
  unidade: MaterialUnit;
  saldoDisponivel: number;
  saldoReservado: number;
};

export type MaterialRequirementResult = {
  materiaPrimaId: string;
  materiaPrimaDescricao: string;
  unidade: MaterialUnit;
  quantidadeNecessaria: number;
  saldoDisponivel: number;
  saldoReservado: number;
  saldoLivre: number;
  quantidadeConsumirInterno: number;
  quantidadeComprar: number;
  materiaPrimaDisponivel: boolean;
  status: StockDecisionStatus;
};

export type PurchaseRequisitionInput = {
  projetoNumero: string;
  ofNumero: string;
  dataNecessidadeMaterial: Date;
  necessidade: MaterialRequirementResult;
};

export type PurchaseRequisitionDraft = {
  materiaPrimaId: string;
  materiaPrimaDescricao: string;
  quantidadeNecessaria: number;
  unidade: MaterialUnit;
  projetoNumero: string;
  ofNumero: string;
  dataNecessidadeMaterial: Date;
};
