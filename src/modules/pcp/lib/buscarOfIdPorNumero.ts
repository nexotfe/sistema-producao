// NEXOTFE — Etapa 44: resolução de numero_of (identificação legível) para
// o UUID real da OF, via client de SESSÃO (nunca service_role). Não existe
// hoje nenhum componente de busca dedicado a OF por número - esta é a
// primeira peça desse mecanismo.
//
// Isolamento entre empresas: NÃO é feito por filtro explícito aqui - é
// garantido pela própria RLS de ordens_fabricacao
// (ordens_fabricacao_select_tenant: empresa_id = empresa_atual_id() AND
// ativo = true). Uma OF de outra empresa simplesmente não aparece na
// consulta, o mesmo comportamento de "não encontrada" de uma OF
// inexistente - nunca revela se o número pertence a outra empresa.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResultadoBuscaOfIdPorNumero =
  | { ok: true; ofId: string; numeroOf: string }
  | { ok: false; motivo: "of_nao_encontrada" }
  | { ok: false; motivo: "erro_desconhecido" };

export async function buscarOfIdPorNumero(
  client: SupabaseClient,
  numeroOfDigitado: string,
): Promise<ResultadoBuscaOfIdPorNumero> {
  const numeroOf = numeroOfDigitado.trim();
  if (numeroOf === "") {
    return { ok: false, motivo: "of_nao_encontrada" };
  }

  const { data, error } = await client.from("ordens_fabricacao").select("id, numero_of").eq("numero_of", numeroOf).maybeSingle();

  if (error) {
    console.error("buscarOfIdPorNumero: falha tecnica ao consultar ordens_fabricacao", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, motivo: "erro_desconhecido" };
  }

  if (!data) {
    return { ok: false, motivo: "of_nao_encontrada" };
  }

  return { ok: true, ofId: data.id as string, numeroOf: data.numero_of as string };
}
