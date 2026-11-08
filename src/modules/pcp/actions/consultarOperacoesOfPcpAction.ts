"use server";
// NEXOTFE — Operações de Produção (Fase 1, leitura): Server Action fina
// de LEITURA das OPs reais de uma OF. Client de sessão apenas - nenhum
// service_role.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { buscarOperacoesOfPcp, type RespostaOperacoesOfPcp } from "../lib/buscarOperacoesOfPcp";

export type ResultadoConsultaOperacoesOfPcp = RespostaOperacoesOfPcp | { ok: false; motivo: "nao_autenticado" };

export async function consultarOperacoesOfPcpAction(ofId: string): Promise<ResultadoConsultaOperacoesOfPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  return buscarOperacoesOfPcp(serverClient, ofId);
}
