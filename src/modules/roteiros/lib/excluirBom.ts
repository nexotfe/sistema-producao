// Camada fina sobre a RPC excluir_bom (migration 202608060002) - sem
// I/O além da própria chamada, sem estado. Toda a lógica de negócio
// (exclusão lógica, bloqueio por dependência de subconjunto/orçamento,
// locks de concorrência, permissão de admin) mora no banco; aqui só
// existe o contrato de chamada e o repasse fiel da mensagem de erro
// que a RPC já formula em português.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Exclui logicamente o roteiro (BOM) informado. Lança Error com a
 * mensagem exata devolvida pela RPC em caso de bloqueio (sem
 * permissão, já excluído, usado como subconjunto vivo, usado em
 * orçamento) - o chamador não precisa reconhecer códigos de erro
 * específicos, só exibir `error.message`. Sucesso retorna o
 * `produto_id` do roteiro excluído.
 */
export async function excluirBom(
  client: SupabaseClient,
  bomId: string,
): Promise<string> {
  const { data, error } = await client.rpc("excluir_bom", {
    p_bom_id: bomId,
  });

  if (error) {
    throw new Error(error.message || "Não foi possível excluir o roteiro.");
  }

  if (!data || typeof data !== "string") {
    throw new Error("A exclusão não retornou o id do produto.");
  }

  return data;
}
