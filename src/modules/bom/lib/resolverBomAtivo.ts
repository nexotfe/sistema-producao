// Sem "use client": função de dados pura, reutilizável tanto pelo
// preview no navegador (client Supabase da sessão do browser) quanto
// pela revalidação autoritativa no servidor (client com sessão do
// usuário, ou client privilegiado) - o chamador decide qual client
// passar, este módulo não importa nenhum fixo.
import type { SupabaseClient } from "@supabase/supabase-js";

type BomAtivoRow = { id: string; status: string; created_at: string };

/**
 * Resolve o BOM a usar para um produto: prefere status='ativo'; sem
 * nenhum ativo, cai para o mais recente. Mesma regra de
 * resolver_bom_ativo_produto (SQL): ordena TODOS os candidatos por
 * (status='ativo') desc, created_at desc, id desc - não usa .find(),
 * que dependeria da ordem arbitrária de retorno do banco e poderia
 * escolher um status='ativo' diferente do SQL quando há mais de um.
 */
export async function resolverBomAtivo(
  client: SupabaseClient,
  produtoId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("boms")
    .select("id,status,created_at")
    .eq("produto_id", produtoId)
    .eq("ativo", true)
    .is("deleted_at", null);

  if (error) {
    throw new Error(
      `Erro ao consultar boms para produto_id=${produtoId}: ${error.message}`,
    );
  }

  const boms = (data ?? []) as BomAtivoRow[];
  if (boms.length === 0) return null;

  const [resolvido] = [...boms].sort((a, b) => {
    const aAtivo = a.status === "ativo" ? 1 : 0;
    const bAtivo = b.status === "ativo" ? 1 : 0;
    if (aAtivo !== bAtivo) return bAtivo - aAtivo;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return resolvido.id;
}
