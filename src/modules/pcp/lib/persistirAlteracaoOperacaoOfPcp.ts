// Etapa 65A — chamada de rede à RPC real alterar_y_operacao (já em
// produção, auditada nas Etapas 65/65A). Mesmo princípio de isolamento
// e distinção de falha de persistirCriacaoOperacaoOfPcp.ts.
//
// alterar_y_operacao é concedida SÓ a service_role, pelo mesmo motivo
// documentado em persistirCriacaoOperacaoOfPcp.ts - canal oficial desta
// família de RPCs, nunca "contorno de RLS".
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultadoPersistenciaAlteracaoOperacaoOfPcp {
  readonly erro: string | null;
  readonly gravacaoIncerta?: boolean;
}

export async function persistirAlteracaoOperacaoOfPcp(
  serviceClient: SupabaseClient,
  opId: string,
  alteradoPor: string,
  recursoVigenteId: string | null,
  tempoVigenteMinutos: number | null,
  sequenciaVigente: number | null,
  motivo: string | null,
): Promise<ResultadoPersistenciaAlteracaoOperacaoOfPcp> {
  let resposta: { data: unknown; error: { message: string; code?: string } | null };
  try {
    resposta = await serviceClient.rpc("alterar_y_operacao", {
      p_op_id: opId,
      p_alterado_por: alteradoPor,
      p_recurso_vigente_id: recursoVigenteId,
      p_tempo_vigente_minutos: tempoVigenteMinutos,
      p_sequencia_vigente: sequenciaVigente,
      p_motivo: motivo,
    });
  } catch (erroDeRede) {
    return { erro: erroDeRede instanceof Error ? erroDeRede.message : String(erroDeRede), gravacaoIncerta: true };
  }

  const { error } = resposta;
  if (error) {
    return { erro: error.message };
  }

  return { erro: null };
}

export type MotivoRejeicaoAlteracaoOperacaoOfPcp =
  | "op_nao_encontrada"
  | "of_estado_final"
  | "apontamento_bloqueado"
  | "erro_desconhecido";

/**
 * Classifica a mensagem TÉCNICA bruta da RPC (texto real, confirmado
 * contra produção - Etapa 65A) num motivo estável para a interface.
 */
export function classificarErroAlteracaoOperacaoOfPcp(mensagem: string): MotivoRejeicaoAlteracaoOperacaoOfPcp {
  if (mensagem.includes("ja tem execucao registrada")) return "apontamento_bloqueado";
  if (mensagem.includes("esta em estado final")) return "of_estado_final";
  if (mensagem.includes("nao encontrada")) return "op_nao_encontrada";
  return "erro_desconhecido";
}
