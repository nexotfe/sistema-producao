"use server";
// Controle de OFs (PCP) — checa só a permissão candidata para editar a
// OBS (pcp.editar_observacao_of, migration 20261110090000). Mesmo
// padrão já aprovado em consultarPermissoesOperacoesOfPcpAction.ts: o
// client de serviço existe só para esta checagem (usuario_tem_permissao
// é EXECUTE-revogada de authenticated) — nunca para ler dado
// operacional. A interface usa isto só para decidir se mostra o campo
// de edição; a RPC atualizar_observacao_pcp_of continua sendo a
// proteção definitiva, reconfirmando a mesma permissão no servidor.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";

const PERMISSAO_EDITAR_OBSERVACAO = "pcp.editar_observacao_of";

export type ResultadoPermissaoObservacaoPcpOf =
  | { ok: true; podeEditarObservacao: boolean }
  | { ok: false; motivo: "nao_autenticado" | "erro_desconhecido" };

export async function consultarPermissaoObservacaoPcpOfAction(): Promise<ResultadoPermissaoObservacaoPcpOf> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_EDITAR_OBSERVACAO,
  });

  if (error) {
    console.error("consultarPermissaoObservacaoPcpOfAction: falha tecnica ao checar permissao", error);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  return { ok: true, podeEditarObservacao: data === true };
}
