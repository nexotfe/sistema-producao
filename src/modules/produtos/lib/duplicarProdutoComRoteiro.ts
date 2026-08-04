// Camada fina sobre a RPC duplicar_produto_com_roteiro (migration
// 202608040002) - sem I/O além da própria chamada, sem estado. Toda a
// lógica de negócio (o que é copiado, o que bloqueia, tudo-ou-nada)
// mora na function SQL; aqui só existe o contrato de chamada e o
// repasse fiel da mensagem de erro que a RPC já formula em português
// para o usuário final (produto sem roteiro, matéria-prima/subconjunto
// excluído, código já existente) - nenhuma tradução própria de
// mensagem é necessária ou desejável, faria a mensagem divergir da
// regra real que vive no banco.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Duplica um produto e o roteiro (BOM) resolvido da origem. Lança
 * Error com a mensagem exata devolvida pela RPC em caso de bloqueio
 * (produto sem roteiro, matéria-prima/subconjunto excluído, código já
 * existente, etc.) - o chamador não precisa reconhecer códigos de erro
 * específicos, só exibir `error.message`.
 */
export async function duplicarProdutoComRoteiro(
  client: SupabaseClient,
  produtoOrigemId: string,
  novoCodigo: string,
): Promise<string> {
  const { data, error } = await client.rpc("duplicar_produto_com_roteiro", {
    p_produto_origem_id: produtoOrigemId,
    p_novo_codigo: novoCodigo.trim(),
  });

  if (error) {
    throw new Error(error.message || "Não foi possível duplicar o produto.");
  }

  if (!data || typeof data !== "string") {
    throw new Error("A duplicação não retornou o id do produto novo.");
  }

  return data;
}
