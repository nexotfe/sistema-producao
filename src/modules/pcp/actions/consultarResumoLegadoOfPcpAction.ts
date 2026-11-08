"use server";
// NEXOTFE — Etapa 58B: Server Action fina de LEITURA do resumo CI/CE
// legado de uma OF. Client de sessão apenas - nenhum service_role.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { buscarResumoLegadoOfPcp, type RespostaResumoLegadoOfPcp } from "../lib/buscarResumoLegadoOfPcp";

export type ResultadoConsultaResumoLegadoOfPcp =
  | RespostaResumoLegadoOfPcp
  | { ok: false; motivo: "nao_autenticado" };

export async function consultarResumoLegadoOfPcpAction(ofId: string): Promise<ResultadoConsultaResumoLegadoOfPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  return buscarResumoLegadoOfPcp(serverClient, ofId);
}
