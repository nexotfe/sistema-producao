"use server";
// NEXOTFE — Etapa 44: Server Action de LEITURA do Momento Y por número
// operacional da OF (entrada natural para a interface, que não trabalha
// com UUID). Compõe buscarOfIdPorNumero + buscarPropostaMomentoY, ambos
// client de sessão - nenhum service_role. Não confirma, não reserva
// estoque, não gera requisição, não altera necessidade nenhuma.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { buscarOfIdPorNumero } from "../lib/buscarOfIdPorNumero";
import { buscarPropostaMomentoY, type LeituraMomentoYOf } from "../lib/buscarPropostaMomentoY";

export interface LeituraMomentoYOfPorNumero extends LeituraMomentoYOf {
  readonly numeroOf: string;
}

export type ResultadoConsultaPropostaMomentoYPorNumero =
  | { ok: true; leitura: LeituraMomentoYOfPorNumero }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "of_nao_encontrada" }
  | { ok: false; motivo: "empresa_nao_encontrada" }
  | { ok: false; motivo: "of_nao_aprovada" }
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "erro_desconhecido" };

export async function consultarPropostaMomentoYPorNumeroAction(
  numeroOfDigitado: string,
): Promise<ResultadoConsultaPropostaMomentoYPorNumero> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const resultadoOf = await buscarOfIdPorNumero(serverClient, numeroOfDigitado);
  if (!resultadoOf.ok) {
    return resultadoOf;
  }

  const resultadoProposta = await buscarPropostaMomentoY(serverClient, resultadoOf.ofId);
  if (!resultadoProposta.ok) {
    return resultadoProposta;
  }

  return {
    ok: true,
    leitura: { ...resultadoProposta.leitura, numeroOf: resultadoOf.numeroOf },
  };
}
