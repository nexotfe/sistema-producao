// Fase 2 do rollout de DEC-006 (Calculador Reverso na persistência):
// monta o payload nativo de aprovar_projeto_com_simulacao_v5 - os 17
// parâmetros posicionais, na ordem e com os nomes exatos da assinatura
// em supabase/migrations/202608030001_aprovar_projeto_com_simulacao_v5_estimativa_inicio.sql.
// Função pura, sem I/O, extraída para lib/ (mesmo motivo de
// montarPayloadV4.ts/orquestrarAprovacaoAutoritativa.ts) - testável sem
// sessão real do Supabase.
//
// Reaproveita montarItensParaV4 para o campo p_itens: o formato nativo
// de itens/distribuições não mudou entre v4 e v5 (só os 4 campos de
// estimativa foram acrescentados) - não existe um segundo mapeamento a
// manter.
import type { ItemSimulacaoOperacao } from "./executarSimulacao";
import type { ResultadoEstimativaInicioNecessario } from "./estimarInicioNecessario";
import { montarItensParaV4, type ItemAprovacaoV4 } from "./montarPayloadV4";

/**
 * DEC-006 §2: a v5 só persiste os 3 estados comerciais do Calculador
 * Reverso (viavel, viavel_no_limite, janela_insuficiente) -
 * dados_insuficientes/horizonte_tecnico_excedido já são bloqueados
 * antes de chegar aqui (orquestrarAprovacaoAutoritativa.ts). Esta
 * restrição por tipo impede, em tempo de compilação, que um chamador
 * futuro monte um payload v5 com um desses dois estados técnicos.
 */
export type EstimativaPersistivelV5 = Extract<
  ResultadoEstimativaInicioNecessario,
  { estado: "viavel" | "viavel_no_limite" | "janela_insuficiente" }
>;

export interface ParametrosPayloadV5 {
  aprovadoPor: string;
  projetoId: string;
  cenarioDemanda: string;
  modoProducao: string;
  dataNecessidade: string;
  margemSegurancaDias: number;
  dataPrevistaAprovacaoPedido: string;
  dataChegadaPrevista: string;
  janelaInicio: string;
  janelaFim: string;
  /** Estimativa já recalculada de forma autoritativa no servidor - nunca um valor vindo do cliente/preview. */
  estimativa: EstimativaPersistivelV5;
  itens: ItemSimulacaoOperacao[];
  chaveIdempotencia: string;
  hashSolicitacao: string;
}

export interface PayloadRpcV5 {
  p_aprovado_por: string;
  p_projeto_id: string;
  p_cenario_demanda: string;
  p_modo_producao: string;
  p_data_necessidade: string;
  p_margem_seguranca_dias: number;
  p_data_prevista_aprovacao_pedido: string;
  p_data_chegada_prevista: string;
  p_janela_inicio: string;
  p_janela_fim: string;
  p_estimativa_inicio_necessario: string;
  p_estimativa_estado: EstimativaPersistivelV5["estado"];
  p_estimativa_metodo_versao: number;
  p_folga_dias_produtivos: number;
  p_itens: ItemAprovacaoV4[];
  p_chave_idempotencia: string;
  p_hash_solicitacao: string;
}

/**
 * Transporta somente a estimativa já recalculada em `params.estimativa`
 * (nunca um campo enviado pelo navegador) para os 4 parâmetros novos da
 * v5. As chaves do objeto retornado seguem a ordem posicional exata dos
 * parâmetros da RPC - divergência de nome quebra a chamada em runtime
 * (PostgREST casa por nome de parâmetro, não por posição do objeto JS).
 */
export function montarPayloadV5(params: ParametrosPayloadV5): PayloadRpcV5 {
  return {
    p_aprovado_por: params.aprovadoPor,
    p_projeto_id: params.projetoId,
    p_cenario_demanda: params.cenarioDemanda,
    p_modo_producao: params.modoProducao,
    p_data_necessidade: params.dataNecessidade,
    p_margem_seguranca_dias: params.margemSegurancaDias,
    p_data_prevista_aprovacao_pedido: params.dataPrevistaAprovacaoPedido,
    p_data_chegada_prevista: params.dataChegadaPrevista,
    p_janela_inicio: params.janelaInicio,
    p_janela_fim: params.janelaFim,
    p_estimativa_inicio_necessario: params.estimativa.dataEstimadaInicioNecessario,
    p_estimativa_estado: params.estimativa.estado,
    p_estimativa_metodo_versao: params.estimativa.metodoVersao,
    p_folga_dias_produtivos: params.estimativa.folgaDiasProdutivos,
    p_itens: montarItensParaV4(params.itens),
    p_chave_idempotencia: params.chaveIdempotencia,
    p_hash_solicitacao: params.hashSolicitacao,
  };
}
