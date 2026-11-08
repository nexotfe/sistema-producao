"use server";
// NEXOTFE — Etapa 58B: Server Action fina de LEITURA das necessidades
// já confirmadas via Momento Y (origem_logica='momento_y') de uma OF.
// Client de sessão apenas - nenhum service_role.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import {
  buscarNecessidadesConfirmadasOfPcp,
  type RespostaNecessidadesConfirmadasOfPcp,
} from "../lib/buscarNecessidadesConfirmadasOfPcp";

export type ResultadoConsultaNecessidadesConfirmadasOfPcp =
  | RespostaNecessidadesConfirmadasOfPcp
  | { ok: false; motivo: "nao_autenticado" };

export async function consultarNecessidadesConfirmadasOfPcpAction(
  ofId: string,
): Promise<ResultadoConsultaNecessidadesConfirmadasOfPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  return buscarNecessidadesConfirmadasOfPcp(serverClient, ofId);
}
