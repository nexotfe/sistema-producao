// Chamada de rede à RPC real aprovar_e_liberar_of (candidata, NÃO
// aplicada no banco vinculado ainda — definição verificada por leitura
// direta do banco descartável local antes desta implementação).
// Isolada atrás de um client injetável, mesmo princípio de
// persistirLiberacaoOfPcp.ts/persistirAprovacaoOfPcp.ts.
//
// aprovar_e_liberar_of é concedida só a `authenticated` (mesma família
// de aprovar_of) — o client é sempre o de SESSÃO, nunca o de serviço.
// Ela mesma orquestra aprovar_of/liberar_of NA MESMA transação,
// checando as permissões pcp.aprovar_of (só quando a OF ainda depende
// de aprovação) e pcp.liberar_of (sempre) — esta Action nunca reimplementa
// essas checagens.
//
// Distinção de falha (mesmo contrato de persistirLiberacaoOfPcp.ts):
// - erro LIMPO (client.rpc resolve com `{ error }`) - ciclo
//   requisição/resposta completo; a RPC é uma única transação - sabemos
//   com certeza que nada foi gravado (inclusive uma aprovação parcial,
//   que é revertida junto com a falha da liberação).
// - erro AMBÍGUO (a chamada de rede em si lança) - não sabemos se a RPC
//   chegou a gravar antes da conexão cair. Nunca decide sozinho aqui -
//   devolve `gravacaoIncerta: true` para o chamador reconsultar o
//   estado oficial antes de agir.
//
// `resultado` espelha o vocabulário de liberar_of ("liberada"/
// "ja_liberada" - é sempre o desfecho final da ação combinada,
// independente de ter passado ou não pela aprovação).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultadoPersistenciaAprovacaoELiberacaoOfPcp {
  readonly resultado: "liberada" | "ja_liberada" | null;
  readonly numeroOf: string | null;
  readonly aprovacaoRealizada: boolean;
  /** Mensagem TÉCNICA bruta da RPC - nunca repassada ao usuário, só para log no chamador. */
  readonly erro: string | null;
  readonly gravacaoIncerta?: boolean;
}

export async function persistirAprovacaoELiberacaoOfPcp(
  sessionClient: SupabaseClient,
  ofId: string,
  observacaoAprovacao: string | null,
  motivoLiberacao: string | null,
): Promise<ResultadoPersistenciaAprovacaoELiberacaoOfPcp> {
  let resposta: { data: unknown; error: { message: string; code?: string } | null };
  try {
    resposta = await sessionClient.rpc("aprovar_e_liberar_of", {
      p_of_id: ofId,
      p_observacao_aprovacao: observacaoAprovacao,
      p_motivo_liberacao: motivoLiberacao,
    });
  } catch (erroDeRede) {
    return {
      resultado: null,
      numeroOf: null,
      aprovacaoRealizada: false,
      erro: erroDeRede instanceof Error ? erroDeRede.message : String(erroDeRede),
      gravacaoIncerta: true,
    };
  }

  const { data, error } = resposta;
  if (error) {
    return { resultado: null, numeroOf: null, aprovacaoRealizada: false, erro: error.message };
  }

  const payload = data as { resultado?: string; numero_of?: string; aprovacao_realizada?: boolean } | null;
  const resultadoReconhecido = payload?.resultado === "liberada" || payload?.resultado === "ja_liberada" ? payload.resultado : null;

  return {
    resultado: resultadoReconhecido,
    numeroOf: payload?.numero_of ?? null,
    aprovacaoRealizada: payload?.aprovacao_realizada === true,
    erro: null,
  };
}

export type MotivoRejeicaoAprovacaoELiberacaoOfPcp =
  | "nao_autenticado"
  | "empresa_nao_encontrada"
  | "of_nao_encontrada"
  | "nao_autorizado_aprovar"
  | "nao_autorizado_liberar"
  | "liberado_por_invalido"
  | "estado_incompativel"
  | "momento_y_pendente"
  | "conflito_concorrencia"
  | "erro_desconhecido";

/**
 * Classifica a mensagem TÉCNICA bruta de aprovar_e_liberar_of (e das
 * mensagens de aprovar_of/liberar_of que ela propaga sem reescrever) -
 * texto real, confirmado contra o ambiente descartável local. Nunca
 * reimplementa nenhuma checagem de estado/permissão - só nomeia o que a
 * RPC já decidiu.
 */
export function classificarErroAprovacaoELiberacaoOfPcp(mensagem: string): MotivoRejeicaoAprovacaoELiberacaoOfPcp {
  if (mensagem.includes("sessao invalida")) return "nao_autenticado";
  if (mensagem.includes("empresa atual nao encontrada")) return "empresa_nao_encontrada";
  if (mensagem.includes("usuario sem permissao para aprovar OF")) return "nao_autorizado_aprovar";
  if (mensagem.includes("usuario sem permissao para liberar OF")) return "nao_autorizado_liberar";
  if (mensagem.includes("OF") && mensagem.includes("nao encontrada")) return "of_nao_encontrada";
  if (mensagem.includes("nao e um usuario valido")) return "liberado_por_invalido";
  if (mensagem.includes("Momento Y pendente")) return "momento_y_pendente";
  if (mensagem.includes("precisa estar aprovada+planejada")) return "estado_incompativel";
  if (mensagem.includes("transicao invalida")) return "estado_incompativel";
  if (mensagem.includes("estado mudou durante a operacao")) return "conflito_concorrencia";
  return "erro_desconhecido";
}
