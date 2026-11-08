"use server";
// Etapa 59A — Server Action fina de LEITURA das dependências entre OPs.
// Client de sessão apenas - nenhum service_role.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import {
  buscarDependenciasOperacoesOfPcp,
  type DependenciaRelacionadaOfPcp,
} from "../lib/buscarDependenciasOperacoesOfPcp";

export type ResultadoConsultaDependenciasOperacoesOfPcp =
  | { ok: true; dependenciasPorOpId: Record<string, readonly DependenciaRelacionadaOfPcp[]> }
  | { ok: false; motivo: "nao_autenticado" | "erro_desconhecido" };

export async function consultarDependenciasOperacoesOfPcpAction(
  opIds: readonly string[],
): Promise<ResultadoConsultaDependenciasOperacoesOfPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const resposta = await buscarDependenciasOperacoesOfPcp(serverClient, opIds);
  if (!resposta.ok) {
    return resposta;
  }

  return { ok: true, dependenciasPorOpId: Object.fromEntries(resposta.dependenciasPorOpId) };
}
