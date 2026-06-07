import type {
  InternalConsumptionDraft,
  InternalConsumptionInput,
  MaterialNeedDecision,
  MaterialNeedDecisionInput,
  MaterialNeedProcessingInput,
  MaterialNeedProcessingPayload,
  RegisterInternalConsumptionInput,
} from "./types";

function assertNonNegative(value: number, field: string) {
  if (value < 0) {
    throw new Error(`${field} nao pode ser negativo.`);
  }
}

export function decideMaterialNeed(
  input: MaterialNeedDecisionInput,
): MaterialNeedDecision {
  assertNonNegative(input.saldoLivre, "Saldo livre");
  assertNonNegative(input.quantidadeNecessaria, "Quantidade necessaria");

  if (input.saldoLivre <= 0) {
    return {
      result: "requisicao_compra",
      quantidadeConsumoInterno: 0,
      quantidadeCompraExterna: input.quantidadeNecessaria,
    };
  }

  if (input.saldoLivre >= input.quantidadeNecessaria) {
    return {
      result: "consumo_interno",
      quantidadeConsumoInterno: input.quantidadeNecessaria,
      quantidadeCompraExterna: 0,
    };
  }

  return {
    result: "consumo_interno_parcial_requisicao_compra",
    quantidadeConsumoInterno: input.saldoLivre,
    quantidadeCompraExterna: input.quantidadeNecessaria - input.saldoLivre,
  };
}

export function createInternalConsumptionDraft(
  input: InternalConsumptionInput,
): InternalConsumptionDraft | null {
  if (input.necessidade.quantidadeConsumirInterno <= 0) {
    return null;
  }

  const custoUnitarioMaterial = input.custoUnitarioMaterial ?? 0;

  assertNonNegative(custoUnitarioMaterial, "Custo unitario material");

  return {
    projetoId: input.projetoId,
    ofNumero: input.ofNumero,
    materiaPrimaId: input.necessidade.materiaPrimaId,
    materialDescricao: input.necessidade.materiaPrimaDescricao,
    quantidade: input.necessidade.quantidadeConsumirInterno,
    unidade: input.necessidade.unidade,
    saldoConsumido: input.necessidade.quantidadeConsumirInterno,
    custoUnitarioMaterial,
    custoTotalMaterial:
      input.necessidade.quantidadeConsumirInterno * custoUnitarioMaterial,
    dataMovimentacao: input.dataMovimentacao,
  };
}

export function createRegisterInternalConsumptionPayload(
  input: RegisterInternalConsumptionInput,
) {
  const custoUnitarioMaterial = input.custoUnitarioMaterial ?? 0;

  assertNonNegative(input.quantidade, "Quantidade");
  assertNonNegative(custoUnitarioMaterial, "Custo unitario material");

  if (input.quantidade === 0) {
    throw new Error("Quantidade do consumo interno deve ser maior que zero.");
  }

  return {
    p_projeto_id: input.projetoId,
    p_of_numero: input.ofNumero,
    p_materia_prima_id: input.materiaPrimaId,
    p_quantidade: input.quantidade,
    p_unidade: input.unidade,
    p_custo_unitario_material: custoUnitarioMaterial,
    p_local_estoque: input.localEstoque ?? "principal",
    p_data_movimentacao: input.dataMovimentacao ?? new Date(),
    p_observacoes: input.observacoes ?? null,
  };
}

export function createProcessMaterialNeedPayload(
  input: MaterialNeedProcessingInput,
): MaterialNeedProcessingPayload {
  const custoUnitarioMaterial = input.custoUnitarioMaterial ?? 0;

  assertNonNegative(input.quantidadeNecessaria, "Quantidade necessaria");
  assertNonNegative(custoUnitarioMaterial, "Custo unitario material");

  if (input.quantidadeNecessaria === 0) {
    throw new Error("Quantidade necessaria deve ser maior que zero.");
  }

  return {
    p_projeto_id: input.projetoId,
    p_of_numero: input.ofNumero,
    p_materia_prima_id: input.materiaPrimaId,
    p_quantidade_necessaria: input.quantidadeNecessaria,
    p_unidade: input.unidade,
    p_custo_unitario_material: custoUnitarioMaterial,
    p_local_estoque: input.localEstoque ?? "principal",
    p_data_necessidade_material: input.dataNecessidadeMaterial ?? new Date(),
    p_observacoes: input.observacoes ?? null,
  };
}
