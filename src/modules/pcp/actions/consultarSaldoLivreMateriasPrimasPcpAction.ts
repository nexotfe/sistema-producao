"use server";
// Etapa 61 — Server Action fina de LEITURA de saldo livre em lote.
// Client de sessão apenas - nenhum service_role.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { buscarSaldoLivreMateriasPrimasPcp } from "../lib/buscarSaldoLivreMateriasPrimasPcp";

export type ResultadoConsultaSaldoLivreMateriasPrimasPcp =
  | { ok: true; saldoLivrePorMaterial: Record<string, number> }
  | { ok: false; motivo: "nao_autenticado" | "erro_desconhecido" };

export async function consultarSaldoLivreMateriasPrimasPcpAction(
  materiaPrimaIds: readonly string[],
): Promise<ResultadoConsultaSaldoLivreMateriasPrimasPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const resposta = await buscarSaldoLivreMateriasPrimasPcp(serverClient, materiaPrimaIds);
  if (!resposta.ok) {
    return resposta;
  }

  return { ok: true, saldoLivrePorMaterial: Object.fromEntries(resposta.saldoLivrePorMaterial) };
}
