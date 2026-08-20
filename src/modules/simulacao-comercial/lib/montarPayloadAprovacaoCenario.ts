// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial) - mapeamento
// puro dos parâmetros nomeados (p_*) da RPC aprovar_cenario_comercial
// (migration 202608180002). Mesmo padrão de montarPayloadV5.ts -
// extraído para ser testável sem nenhum client Supabase.
import type {
  CenarioComercialAprovadoSnapshot,
  CustoAdicionalPorCategoriaSnapshot,
  TipoCenarioAprovado,
} from "./cenarios/cenarioComercialAprovadoSnapshot";

export interface ParametrosPayloadAprovacaoCenario {
  readonly projetoId: string;
  readonly tipoCenario: TipoCenarioAprovado;
  readonly dataSolicitadaCliente: string;
  readonly prazoProposto: string;
  readonly custoTecnicoAtual: number;
  readonly custoAdicionalPorCategoria: CustoAdicionalPorCategoriaSnapshot;
  readonly valorComercialAtualReferencia: number | null;
  readonly snapshot: CenarioComercialAprovadoSnapshot;
  /** Obrigatório (não vazio) quando já existe um cenário vigente para o projeto - a RPC valida de novo, esta camada não decide isso sozinha. */
  readonly motivoSubstituicao: string | null;
}

export interface PayloadRpcAprovacaoCenario {
  p_projeto_id: string;
  p_tipo_cenario: string;
  p_data_solicitada_cliente: string;
  p_prazo_proposto: string;
  p_custo_tecnico_atual: number;
  p_custo_negociacao_material: number;
  p_custo_hora_adicional: number;
  p_custo_recurso_temporario: number;
  p_custo_terceirizacao: number;
  p_valor_comercial_atual_referencia: number | null;
  p_snapshot: CenarioComercialAprovadoSnapshot;
  p_motivo_substituicao: string | null;
}

export function montarPayloadAprovacaoCenario(params: ParametrosPayloadAprovacaoCenario): PayloadRpcAprovacaoCenario {
  return {
    p_projeto_id: params.projetoId,
    p_tipo_cenario: params.tipoCenario,
    p_data_solicitada_cliente: params.dataSolicitadaCliente,
    p_prazo_proposto: params.prazoProposto,
    p_custo_tecnico_atual: params.custoTecnicoAtual,
    p_custo_negociacao_material: params.custoAdicionalPorCategoria.negociacaoMaterial,
    p_custo_hora_adicional: params.custoAdicionalPorCategoria.horaAdicional,
    p_custo_recurso_temporario: params.custoAdicionalPorCategoria.recursoTemporario,
    p_custo_terceirizacao: params.custoAdicionalPorCategoria.terceirizacao,
    p_valor_comercial_atual_referencia: params.valorComercialAtualReferencia,
    p_snapshot: params.snapshot,
    p_motivo_substituicao: params.motivoSubstituicao,
  };
}
