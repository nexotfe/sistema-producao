// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial) - mapeamento
// puro dos parâmetros nomeados (p_*) da RPC aprovar_cenario_comercial_v2
// (migration 20260822165408, Fase 1 da transição em duas fases - a RPC
// antiga, aprovar_cenario_comercial de 202608180002, continua existindo
// no banco, mas nada neste módulo a chama). Mesmo padrão de
// montarPayloadV5.ts - extraído para ser testável sem nenhum client
// Supabase.
//
// Migração 20260822195805 (idempotência - correção do usuário após o
// achado de travamento em "Aprovando..."): chaveIdempotencia/
// hashSolicitacao passaram a ser obrigatórios - mesmo padrão já
// comprovado em aprovar_projeto_com_simulacao_v5 (montarPayloadV5.ts).
import type {
  CenarioComercialAprovadoSnapshot,
  CustoAdicionalPorCategoriaSnapshot,
  TipoCenarioAprovado,
} from "./cenarios/cenarioComercialAprovadoSnapshot";

export interface ParametrosPayloadAprovacaoCenario {
  /** public.profiles.empresa_id do aprovador - resolvido e validado pela Server Action (autorizarAprovador) ANTES de qualquer chamada à RPC, nunca de sessão implícita (a RPC roda sob service_role, sem JWT). */
  readonly empresaId: string;
  /** auth.uid() do aprovador, capturado por auth.getUser() no servidor - nunca de parâmetro do navegador. */
  readonly aprovadoPor: string;
  readonly projetoId: string;
  readonly tipoCenario: TipoCenarioAprovado;
  readonly dataSolicitadaCliente: string;
  readonly prazoProposto: string;
  readonly custoTecnicoAtual: number;
  readonly custoAdicionalPorCategoria: CustoAdicionalPorCategoriaSnapshot;
  readonly valorComercialAtualReferencia: number | null;
  readonly snapshot: CenarioComercialAprovadoSnapshot;
  /** Hash SHA-256 hex (64 chars) da base técnica (construirDocumentoAssinaturaTecnica.ts) calculado sobre a MESMA carga de dados que produziu custoTecnicoAtual/snapshot - nunca em SQL, nunca opcional numa aprovação nova. */
  readonly assinaturaTecnica: string;
  /** UUID gerado no cliente quando o modal de confirmação abre, reaproveitado em toda nova tentativa da MESMA confirmação - garante que um retry após falha ambígua nunca duplica a aprovação (aprovar_cenario_comercial_v2 devolve o cenário já gravado em vez de inserir de novo). */
  readonly chaveIdempotencia: string;
  /** SHA-256 hex de tudo que será persistido (calcularHashSolicitacaoAprovacaoCenario.ts) - junto com chaveIdempotencia, distingue uma repetição legítima de reuso indevido da chave. */
  readonly hashSolicitacao: string;
  /** Obrigatório (não vazio) quando já existe um cenário vigente para o projeto - a RPC valida de novo, esta camada não decide isso sozinha. */
  readonly motivoSubstituicao: string | null;
}

export interface PayloadRpcAprovacaoCenario {
  p_empresa_id: string;
  p_aprovado_por: string;
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
  p_assinatura_tecnica: string;
  p_chave_idempotencia: string;
  p_hash_solicitacao: string;
  p_motivo_substituicao: string | null;
}

export function montarPayloadAprovacaoCenario(params: ParametrosPayloadAprovacaoCenario): PayloadRpcAprovacaoCenario {
  return {
    p_empresa_id: params.empresaId,
    p_aprovado_por: params.aprovadoPor,
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
    p_assinatura_tecnica: params.assinaturaTecnica,
    p_chave_idempotencia: params.chaveIdempotencia,
    p_hash_solicitacao: params.hashSolicitacao,
    p_motivo_substituicao: params.motivoSubstituicao,
  };
}
