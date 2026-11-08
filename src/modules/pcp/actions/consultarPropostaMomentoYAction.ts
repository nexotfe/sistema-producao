"use server";
// NEXOTFE — Etapa 41: Server Action de LEITURA do Momento Y (Revisão 4).
// Client de sessão apenas (createSupabaseServerClient) - a autorização por
// papel (pcp/admin) é verificada dentro das próprias RPCs SECURITY DEFINER,
// não aqui; nenhum client service_role é usado nesta action (diferente de
// consultarFilaPrioridadesPcpAction, que precisa dele para
// usuario_tem_permissao - aqui não há RPC equivalente a chamar).
//
// Não confirma, não reserva estoque, não gera requisição de compra, não
// altera necessidades de OF - só leitura.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { buscarPropostaMomentoY, type LeituraMomentoYOf } from "../lib/buscarPropostaMomentoY";

export type ResultadoConsultaPropostaMomentoY =
  | { ok: true; leitura: LeituraMomentoYOf }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "empresa_nao_encontrada" }
  | { ok: false; motivo: "of_nao_encontrada" }
  | { ok: false; motivo: "of_nao_aprovada" }
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "erro_desconhecido" };

export async function consultarPropostaMomentoYAction(ofId: string): Promise<ResultadoConsultaPropostaMomentoY> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  return buscarPropostaMomentoY(serverClient, ofId);
}
