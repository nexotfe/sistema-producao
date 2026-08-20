// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial + resumo
// financeiro) - formato do snapshot congelado por
// aprovar_cenario_comercial (migration 202608180002). Fonte exclusiva:
// a Previsão comercial por capacidade (avaliarPrevisaoComercialFlexivel/
// montarPrevisaoComercialProjeto) - nunca o motor antigo.
//
// `aprovadoPor`/`aprovadoEm` aqui são SEMPRE placeholders - a RPC
// SOBRESCREVE os dois campos dentro do JSON armazenado com
// auth.uid()/now() reais (ver CHECK cenarios_comerciais_aprovados_snapshot_forma_chk
// e o corpo da RPC), nunca confia no que o cliente/Server Action montou.
// `construirSnapshotCenarioComercial` só existe para dar forma ao
// payload ANTES da chamada de rede - o valor final gravado nunca é
// exatamente este objeto.
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";
import type { Contratacao } from "./contratacao";
import type { SaidaPrevisaoComercial } from "./montarPrevisaoComercialProjeto";

export type TipoCenarioAprovado = "atual" | "ajustado";

export interface PremissasComerciaisSnapshot {
  readonly dataNecessidade: string;
  readonly margemSegurancaDias: number;
  readonly dataPrevistaAprovacaoPedido: string;
}

export interface DisponibilidadeMaterialSnapshot {
  readonly original: string;
  /** null = nenhuma negociação de material configurada neste cenário. */
  readonly negociada: string | null;
}

export interface DecisoesCapacidadeSnapshot {
  readonly capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  readonly temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
  readonly contratacoes: readonly Contratacao[];
  readonly contratacaoNegociacaoMaterial: Contratacao | null;
}

export interface CustoAdicionalPorCategoriaSnapshot {
  readonly negociacaoMaterial: number;
  readonly horaAdicional: number;
  readonly recursoTemporario: number;
  /** Sempre 0 hoje - avaliarPrevisaoComercialFlexivel.ts não cobre terceirização ainda. */
  readonly terceirizacao: number;
}

export interface CenarioComercialAprovadoSnapshot {
  readonly versaoFormato: 1;
  readonly empresaId: string;
  readonly projetoId: string;
  readonly tipoCenario: TipoCenarioAprovado;
  readonly premissas: PremissasComerciaisSnapshot;
  readonly disponibilidadeMaterial: DisponibilidadeMaterialSnapshot;
  readonly decisoesCapacidade: DecisoesCapacidadeSnapshot;
  /** SaidaPrevisaoComercial completo do cenário aprovado - permite reproduzir a decisão sem recalcular. */
  readonly saidaPrevisaoComercial: SaidaPrevisaoComercial;
  /** "Valor atual do orçamento" = custo TÉCNICO (custoTotal), sem margem/imposto/desconto. */
  readonly custoTecnicoAtual: number;
  readonly custoAdicionalPorCategoria: CustoAdicionalPorCategoriaSnapshot;
  readonly custoAdicionalTotal: number;
  readonly novoCustoTecnico: number;
  /** Só informativo (valorComercial atual, já com margem/imposto/desconto) - nunca usado na soma acima. */
  readonly valorComercialAtualReferencia: number | null;
  /** Placeholder - a RPC sempre sobrescreve com auth.uid() real, nunca confia neste valor. */
  readonly aprovadoPor: string;
  /** Placeholder - a RPC sempre sobrescreve com now() real, nunca confia neste valor. */
  readonly aprovadoEm: string;
}

export interface ParametrosSnapshotCenarioComercial {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly tipoCenario: TipoCenarioAprovado;
  readonly premissas: PremissasComerciaisSnapshot;
  readonly disponibilidadeMaterial: DisponibilidadeMaterialSnapshot;
  readonly decisoesCapacidade: DecisoesCapacidadeSnapshot;
  readonly saidaPrevisaoComercial: SaidaPrevisaoComercial;
  readonly custoTecnicoAtual: number;
  readonly custoAdicionalPorCategoria: CustoAdicionalPorCategoriaSnapshot;
  readonly valorComercialAtualReferencia: number | null;
}

/**
 * Monta o snapshot ANTES da chamada de rede - custoAdicionalTotal/
 * novoCustoTecnico são somados aqui só para o objeto ficar completo
 * (ex.: exibição na confirmação), mas quem decide os valores realmente
 * gravados é sempre a RPC (recalculados lá, nunca confiados a este
 * payload - ver aprovar_cenario_comercial). aprovadoPor/aprovadoEm
 * entram como placeholder explícito - nunca o valor final.
 */
export function construirSnapshotCenarioComercial(
  params: ParametrosSnapshotCenarioComercial,
): CenarioComercialAprovadoSnapshot {
  const custoAdicionalTotal =
    params.custoAdicionalPorCategoria.negociacaoMaterial +
    params.custoAdicionalPorCategoria.horaAdicional +
    params.custoAdicionalPorCategoria.recursoTemporario +
    params.custoAdicionalPorCategoria.terceirizacao;

  return {
    versaoFormato: 1,
    empresaId: params.empresaId,
    projetoId: params.projetoId,
    tipoCenario: params.tipoCenario,
    premissas: params.premissas,
    disponibilidadeMaterial: params.disponibilidadeMaterial,
    decisoesCapacidade: params.decisoesCapacidade,
    saidaPrevisaoComercial: params.saidaPrevisaoComercial,
    custoTecnicoAtual: params.custoTecnicoAtual,
    custoAdicionalPorCategoria: params.custoAdicionalPorCategoria,
    custoAdicionalTotal,
    novoCustoTecnico: params.custoTecnicoAtual + custoAdicionalTotal,
    valorComercialAtualReferencia: params.valorComercialAtualReferencia,
    aprovadoPor: "PLACEHOLDER_SOBRESCRITO_PELA_RPC",
    aprovadoEm: "PLACEHOLDER_SOBRESCRITO_PELA_RPC",
  };
}
