import type {
  MaterialRequirementResult,
  MaterialUnit,
} from "../estoque/types";
import type {
  MATERIAL_FORMS,
  PURCHASE_CATEGORIES,
  PURCHASE_PLANNING_CALCULATION_CRITERIA,
  PURCHASE_PLANNING_MODES,
  PURCHASE_NEED_RESULTS,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PLANNING_STATUSES,
  PURCHASE_ORIGINS,
  PURCHASE_PRIORITIES,
  PURCHASE_REQUISITION_STATUSES,
  RECEIPT_STATUSES,
} from "./constants";

export type PurchaseNeedResult = (typeof PURCHASE_NEED_RESULTS)[number];

export type PurchaseOrigin = (typeof PURCHASE_ORIGINS)[number];

export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

export type PurchasePriority = (typeof PURCHASE_PRIORITIES)[number];

export type PurchaseRequisitionStatus =
  (typeof PURCHASE_REQUISITION_STATUSES)[number];

export type PurchasePlanningStatus =
  (typeof PURCHASE_PLANNING_STATUSES)[number];

export type MaterialForm = (typeof MATERIAL_FORMS)[number];

export type PurchasePlanningMode =
  (typeof PURCHASE_PLANNING_MODES)[number];

export type PurchasePlanningCalculationCriterion =
  (typeof PURCHASE_PLANNING_CALCULATION_CRITERIA)[number];

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export type MaterialNeedDecisionInput = {
  saldoLivre: number;
  quantidadeNecessaria: number;
};

export type MaterialNeedDecision = {
  result: PurchaseNeedResult;
  quantidadeConsumoInterno: number;
  quantidadeCompraExterna: number;
};

export type MaterialNeedProcessingStatus =
  | "ci_total"
  | "compra_total"
  | "ci_parcial_compra_parcial";

export type MaterialNeedProcessingInput = {
  projetoId: string;
  ofNumero: string;
  materiaPrimaId: string;
  quantidadeNecessaria: number;
  unidade: MaterialUnit;
  custoUnitarioMaterial?: number;
  localEstoque?: string;
  dataNecessidadeMaterial?: Date;
  observacoes?: string;
};

export type MaterialNeedProcessingPayload = {
  p_projeto_id: string;
  p_of_numero: string;
  p_materia_prima_id: string;
  p_quantidade_necessaria: number;
  p_unidade: MaterialUnit;
  p_custo_unitario_material: number;
  p_local_estoque: string;
  p_data_necessidade_material: Date;
  p_observacoes: string | null;
};

export type MaterialNeedOperationalView = {
  empresaId: string;
  projetoId: string | null;
  ofNumero: string | null;
  materiaPrimaId: string;
  materiaPrimaCodigo: string | null;
  materiaPrimaDescricao: string;
  unidade: MaterialUnit;
  quantidadeConsumoInterno: number;
  quantidadeCompraExterna: number;
  quantidadeTotal: number;
  custoTotalMaterial: number;
  dataNecessidadeMaterial: Date | null;
  ultimaDataCi: Date | null;
  statusRequisicao: PurchaseRequisitionStatus | null;
  statusDecisao: MaterialNeedProcessingStatus;
};

export type InternalConsumptionDraft = {
  projetoId: string;
  ofNumero: string;
  materiaPrimaId: string;
  materialDescricao: string;
  quantidade: number;
  unidade: MaterialUnit;
  saldoConsumido: number;
  custoUnitarioMaterial: number;
  custoTotalMaterial: number;
  dataMovimentacao: Date;
};

export type InternalConsumptionInput = {
  projetoId: string;
  ofNumero: string;
  necessidade: MaterialRequirementResult;
  custoUnitarioMaterial?: number;
  dataMovimentacao: Date;
};

export type RegisterInternalConsumptionInput = {
  projetoId: string;
  ofNumero: string;
  materiaPrimaId: string;
  quantidade: number;
  unidade: MaterialUnit;
  custoUnitarioMaterial?: number;
  localEstoque?: string;
  dataMovimentacao?: Date;
  observacoes?: string;
};

export type PurchaseRequisitionDraft = {
  descricao: string;
  materialDimensao?: string;
  quantidade: number;
  unidade: string;
  origem: PurchaseOrigin;
  projetoNumero?: string;
  ofNumero?: string;
  solicitante: string;
  prioridade: PurchasePriority;
  categoria: PurchaseCategory;
};

export type PurchasePlanningDraft = {
  materiaPrimaId: string;
  descricaoCompra: string;
  materialBase?: string;
  formaMaterial?: MaterialForm;
  bitolaOuEspessura?: string;
  chaveIndustrialCompra?: string;
  modoPlanejamento: PurchasePlanningMode;
  criterioCalculo: PurchasePlanningCalculationCriterion;
  unidadeNecessidade: MaterialUnit;
  quantidadeNecessariaTotal: number;
  unidadeCompra?: string;
  quantidadePlanejadaCompra?: number;
  comprarDescricao?: string;
  sobraPrevista?: number;
  status: PurchasePlanningStatus;
  observacoes?: string;
};

export type PurchasePlanningOrigin = {
  planejamentoCompraId: string;
  requisicaoCompraId: string;
  requisicaoCompraItemId: string;
  projetoId?: string;
  ofNumero?: string;
  quantidadeNecessaria: number;
  quantidadePecas?: number;
  comprimentoNecessario?: number;
  larguraNecessaria?: number;
  espessuraNecessaria?: string;
  dimensaoOperacional?: string;
  incluirNoPlanejamento: boolean;
  ordemAgrupamento?: number;
  unidade: MaterialUnit;
};

export type PurchasePlanningOperationalView = {
  planejamentoCompraId: string;
  empresaId: string;
  numeroPlanejamento: string | null;
  materiaPrimaId: string;
  materiaPrimaCodigo: string | null;
  materiaPrimaDescricao: string;
  descricaoCompra: string;
  materialBase: string | null;
  formaMaterial: MaterialForm | null;
  bitolaOuEspessura: string | null;
  chaveIndustrialCompra: string | null;
  modoPlanejamento: PurchasePlanningMode;
  criterioCalculo: PurchasePlanningCalculationCriterion;
  unidadeNecessidade: MaterialUnit;
  quantidadeNecessariaTotal: number;
  somaTotal: number;
  unidadeCompra: string | null;
  quantidadePlanejadaCompra: number | null;
  sugestaoCompra: number | null;
  comprarDescricao: string | null;
  sobraPrevista: number | null;
  status: PurchasePlanningStatus;
  origensIncluidas: number;
  origensExcluidas: number;
  quantidadeOrigensIncluidas: number | null;
  ofsIncluidas: string | null;
  ultimaOrigemEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UpdatePurchasePlanningDecisionInput = {
  planejamentoCompraId: string;
  modoPlanejamento: PurchasePlanningMode;
  comprarDescricao: string;
  quantidadePlanejadaCompra?: number;
  unidadeCompra?: string;
  sobraPrevista?: number;
};

export type UpdatePurchasePlanningOriginInput = {
  origemId: string;
  incluirNoPlanejamento: boolean;
  ordemAgrupamento?: number;
};

export type PurchaseOrderDraft = {
  planejamentoCompraId: string;
  fornecedorNome?: string;
  status: PurchaseOrderStatus;
};
