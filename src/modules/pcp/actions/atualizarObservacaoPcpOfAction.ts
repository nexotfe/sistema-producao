"use server";
// Controle de OFs (PCP) — grava o lembrete observacao_pcp. Única via de
// escrita: a RPC atualizar_observacao_pcp_of (migration 20261110090000,
// já aplicada e validada em sandbox) - nunca um UPDATE direto na tabela
// (ordens_fabricacao tem REVOKE ALL de authenticated/service_role desde
// 20260830134415; a RPC escreve como dona, postgres). Client de SESSAO
// só para auth.getUser() - client de SERVICO só para a RPC (mesmo
// padrão de liberar_of: p_usuario_id vem de um chamador já privilegiado,
// nunca aceito do corpo da requisicao). A RPC reconfirma empresa,
// permissao pcp.editar_observacao_of e situacao da OF no servidor -
// esta Action nunca decide nenhuma dessas 3 coisas, só repassa.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";

const LIMITE_OBSERVACAO_PCP = 120;

export type MotivoRejeicaoObservacaoPcpOf =
  | "sem_permissao"
  | "situacao_nao_permitida"
  | "of_nao_encontrada"
  | "empresa_invalida"
  | "erro_desconhecido";

export type ResultadoAtualizarObservacaoPcpOf =
  | { ok: true }
  | { ok: false; motivo: "nao_autenticado" | "texto_muito_longo" | MotivoRejeicaoObservacaoPcpOf }
  /** A chamada de rede falhou sem completar um ciclo requisição/resposta - não se sabe se gravou. Nunca tratar como "falhou" nem "funcionou": o chamador precisa reconsultar a lista antes de decidir. */
  | { ok: false; motivo: "gravacao_incerta" };

function classificarErroObservacaoPcpOf(mensagem: string): MotivoRejeicaoObservacaoPcpOf {
  if (mensagem.includes("sem permissao")) return "sem_permissao";
  if (mensagem.includes("nao esta aguardando liberacao")) return "situacao_nao_permitida";
  if (mensagem.includes("nao pertence a empresa")) return "empresa_invalida";
  if (mensagem.includes("nao encontrada")) return "of_nao_encontrada";
  return "erro_desconhecido";
}

function logErroTecnicoObservacaoPcpOf(origem: string, erro: { message: string; code?: string }): void {
  console.error(`atualizarObservacaoPcpOfAction: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function atualizarObservacaoPcpOfAction(ofId: string, observacao: string): Promise<ResultadoAtualizarObservacaoPcpOf> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();
  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  // Validação de tamanho também aqui (feedback imediato, sem round-trip
  // até a RPC) - a RPC repete a mesma checagem no servidor, nunca confia
  // só nesta.
  if (observacao.length > LIMITE_OBSERVACAO_PCP) {
    return { ok: false, motivo: "texto_muito_longo" };
  }

  const serviceClient = createSupabaseServiceClient();

  let resposta: { data: unknown; error: { message: string; code?: string } | null };
  try {
    resposta = await serviceClient.rpc("atualizar_observacao_pcp_of", {
      p_of_id: ofId,
      p_usuario_id: user.id,
      p_observacao: observacao,
    });
  } catch (erroDeRede) {
    logErroTecnicoObservacaoPcpOf("atualizar_observacao_pcp_of (rede)", {
      message: erroDeRede instanceof Error ? erroDeRede.message : String(erroDeRede),
    });
    return { ok: false, motivo: "gravacao_incerta" };
  }

  if (resposta.error) {
    logErroTecnicoObservacaoPcpOf("atualizar_observacao_pcp_of", resposta.error);
    return { ok: false, motivo: classificarErroObservacaoPcpOf(resposta.error.message) };
  }

  return { ok: true };
}
