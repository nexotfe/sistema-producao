import type {
  MaterialRequirementInput,
  MaterialRequirementResult,
  PurchaseRequisitionDraft,
  PurchaseRequisitionInput,
} from "./types";

function assertNonNegative(value: number, field: string) {
  if (value < 0) {
    throw new Error(`${field} nao pode ser negativo.`);
  }
}

export function calculateRequiredQuantity(
  consumoUnitario: number,
  quantidadeFabricar: number,
) {
  assertNonNegative(consumoUnitario, "Consumo unitario");
  assertNonNegative(quantidadeFabricar, "Quantidade fabricar");

  return consumoUnitario * quantidadeFabricar;
}

export function calculateFreeBalance(
  saldoDisponivel: number,
  saldoReservado: number,
) {
  assertNonNegative(saldoDisponivel, "Saldo disponivel");
  assertNonNegative(saldoReservado, "Saldo reservado");

  return saldoDisponivel - saldoReservado;
}

export function evaluateMaterialRequirement(
  input: MaterialRequirementInput,
): MaterialRequirementResult {
  const quantidadeNecessaria = calculateRequiredQuantity(
    input.consumoUnitario,
    input.quantidadeFabricar,
  );
  const saldoLivre = calculateFreeBalance(
    input.saldoDisponivel,
    input.saldoReservado,
  );
  const quantidadeConsumirInterno = Math.max(
    Math.min(saldoLivre, quantidadeNecessaria),
    0,
  );
  const quantidadeComprar = Math.max(quantidadeNecessaria - saldoLivre, 0);
  const materiaPrimaDisponivel = quantidadeComprar === 0;

  return {
    materiaPrimaId: input.materiaPrimaId,
    materiaPrimaDescricao: input.materiaPrimaDescricao,
    unidade: input.unidade,
    quantidadeNecessaria,
    saldoDisponivel: input.saldoDisponivel,
    saldoReservado: input.saldoReservado,
    saldoLivre,
    quantidadeConsumirInterno,
    quantidadeComprar,
    materiaPrimaDisponivel,
    status: materiaPrimaDisponivel ? "disponivel" : "compra_necessaria",
  };
}

export function createPurchaseRequisitionDraft(
  input: PurchaseRequisitionInput,
): PurchaseRequisitionDraft | null {
  if (input.necessidade.materiaPrimaDisponivel) {
    return null;
  }

  return {
    materiaPrimaId: input.necessidade.materiaPrimaId,
    materiaPrimaDescricao: input.necessidade.materiaPrimaDescricao,
    quantidadeNecessaria: input.necessidade.quantidadeComprar,
    unidade: input.necessidade.unidade,
    projetoNumero: input.projetoNumero,
    ofNumero: input.ofNumero,
    dataNecessidadeMaterial: input.dataNecessidadeMaterial,
  };
}
