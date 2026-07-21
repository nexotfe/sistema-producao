"use client";

import { supabase } from "@/lib/supabaseClient";

type BomAtivoRow = { id: string; status: string; created_at: string };

/**
 * Resolve o BOM a usar para um produto: prefere status='ativo'; sem
 * nenhum ativo, cai para o mais recente (created_at desc). Mesma regra
 * de calcular_custo_bom (SQL) - ver pendência de reconciliação futura
 * documentada em coletarEstruturaBom.ts.
 */
export async function resolverBomAtivo(produtoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("boms")
    .select("id,status,created_at")
    .eq("produto_id", produtoId)
    .is("deleted_at", null)
    .order("status", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Erro ao consultar boms para produto_id=${produtoId}: ${error.message}`,
    );
  }

  const boms = (data ?? []) as BomAtivoRow[];
  if (boms.length === 0) return null;

  const ativo = boms.find((b) => b.status === "ativo");
  return (ativo ?? boms[0]).id;
}
