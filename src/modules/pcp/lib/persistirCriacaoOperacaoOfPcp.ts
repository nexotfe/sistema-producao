// Etapa 65A — chamada de rede à RPC real criar_op_no_y (já em produção,
// auditada nas Etapas 65/65A). Isolada atrás de um client injetável -
// mesmo princípio de persistirConfirmacaoMomentoYPcp.ts/
// persistirViaRpcAprovacaoCenario.ts (testável sem sessão real).
//
// criar_op_no_y é concedida SÓ a service_role (migration 20261015170000
// - "hardening emergencial de ACL": nenhuma destas RPCs valida
// internamente que o CHAMADOR pertence à empresa dos registros, foram
// desenhadas assumindo acesso exclusivo via service_role, com a
// autorização real feita pelo Server Action antes de chamar). Por isso
// este client É o de serviço - não é "contornar RLS", é o canal
// oficial desta família de RPCs (confirmado por leitura direta do
// GRANT em produção, Etapa 65A).
//
// Distinção de falha (mesmo contrato de persistirConfirmacaoMomentoYPcp.ts):
// - erro LIMPO (client.rpc resolve com `{ error }`) - ciclo
//   requisição/resposta completo; a função é uma única transação -
//   sabemos com certeza que nada foi gravado.
// - erro AMBÍGUO (a chamada de rede em si lança) - não sabemos se a RPC
//   chegou a gravar antes da conexão cair. Nunca decide sozinho aqui -
//   devolve `gravacaoIncerta: true` para o chamador reconsultar o
//   estado oficial antes de agir.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultadoPersistenciaCriacaoOperacaoOfPcp {
  readonly novoOpId: string | null;
  /** Mensagem TÉCNICA bruta da RPC - nunca repassada ao usuário, só para log no chamador. */
  readonly erro: string | null;
  readonly gravacaoIncerta?: boolean;
}

export async function persistirCriacaoOperacaoOfPcp(
  serviceClient: SupabaseClient,
  ofId: string,
  criadoPor: string,
  codigoOperacional: string,
  descricao: string,
  sequenciaVigente: number,
  recursoVigenteId: string | null,
  tempoVigenteMinutos: number | null,
  motivo: string,
): Promise<ResultadoPersistenciaCriacaoOperacaoOfPcp> {
  let resposta: { data: unknown; error: { message: string; code?: string } | null };
  try {
    resposta = await serviceClient.rpc("criar_op_no_y", {
      p_of_id: ofId,
      p_criado_por: criadoPor,
      p_codigo_operacional: codigoOperacional,
      p_descricao: descricao,
      p_sequencia_vigente: sequenciaVigente,
      p_recurso_vigente_id: recursoVigenteId,
      p_tempo_vigente_minutos: tempoVigenteMinutos,
      p_motivo: motivo,
    });
  } catch (erroDeRede) {
    return { novoOpId: null, erro: erroDeRede instanceof Error ? erroDeRede.message : String(erroDeRede), gravacaoIncerta: true };
  }

  const { data, error } = resposta;
  if (error) {
    return { novoOpId: null, erro: error.message };
  }

  return { novoOpId: data as string, erro: null };
}

export type MotivoRejeicaoCriacaoOperacaoOfPcp =
  | "of_nao_encontrada"
  | "of_estado_final"
  | "motivo_obrigatorio"
  | "erro_desconhecido";

/**
 * Classifica a mensagem TÉCNICA bruta da RPC (texto real, confirmado
 * contra produção - Etapa 65A) num motivo estável para a interface.
 */
export function classificarErroCriacaoOperacaoOfPcp(mensagem: string): MotivoRejeicaoCriacaoOperacaoOfPcp {
  if (mensagem.includes("motivo/justificativa e obrigatorio")) return "motivo_obrigatorio";
  if (mensagem.includes("esta em estado final")) return "of_estado_final";
  if (mensagem.includes("nao encontrada")) return "of_nao_encontrada";
  return "erro_desconhecido";
}
