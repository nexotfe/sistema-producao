// Etapa 65A — chamada de rede à RPC real marcar_op_nao_aplicavel (já em
// produção, auditada nas Etapas 65/65A). Mesmo princípio de isolamento
// e distinção de falha de persistirCriacaoOperacaoOfPcp.ts. "Remover"
// nunca é exclusão física - a RPC só marca nao_aplicavel=true.
//
// marcar_op_nao_aplicavel é concedida SÓ a service_role, pelo mesmo
// motivo documentado em persistirCriacaoOperacaoOfPcp.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultadoPersistenciaRemocaoOperacaoOfPcp {
  readonly erro: string | null;
  readonly gravacaoIncerta?: boolean;
}

export async function persistirRemocaoOperacaoOfPcp(
  serviceClient: SupabaseClient,
  opId: string,
  marcadoPor: string,
  motivo: string,
): Promise<ResultadoPersistenciaRemocaoOperacaoOfPcp> {
  let resposta: { data: unknown; error: { message: string; code?: string } | null };
  try {
    resposta = await serviceClient.rpc("marcar_op_nao_aplicavel", {
      p_op_id: opId,
      p_marcado_por: marcadoPor,
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

export type MotivoRejeicaoRemocaoOperacaoOfPcp =
  | "op_nao_encontrada"
  | "of_estado_final"
  | "apontamento_bloqueado"
  | "dependencias_pendentes"
  | "motivo_obrigatorio"
  | "erro_desconhecido";

/**
 * Classifica a mensagem TÉCNICA bruta da RPC (texto real, confirmado
 * contra produção - Etapa 65A) num motivo estável para a interface.
 * A ordem importa: "dependencias relacionadas" é checada ANTES de
 * "execucao registrada" na própria RPC (mesma ordem aqui).
 */
export function classificarErroRemocaoOperacaoOfPcp(mensagem: string): MotivoRejeicaoRemocaoOperacaoOfPcp {
  if (mensagem.includes("motivo e obrigatorio")) return "motivo_obrigatorio";
  if (mensagem.includes("tem dependencias relacionadas")) return "dependencias_pendentes";
  if (mensagem.includes("ja tem execucao registrada")) return "apontamento_bloqueado";
  if (mensagem.includes("esta em estado final")) return "of_estado_final";
  if (mensagem.includes("nao encontrada")) return "op_nao_encontrada";
  return "erro_desconhecido";
}
