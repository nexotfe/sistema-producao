"use client";

import { supabase } from "@/lib/supabaseClient";

export type ResultadoExclusao =
  | { status: "excluido" }
  | { status: "vinculado" }
  | { status: "sem_permissao" }
  | { status: "erro"; mensagem: string };

const CODIGO_FK_VIOLATION = "23503";

/**
 * DELETE fisico com .select() encadeado (Supabase faz DELETE ... RETURNING
 * por baixo). Isso permite distinguir dois bloqueios que a RLS resolve sem
 * lancar erro nenhum:
 * - FK RESTRICT (ha vinculo real, ex: recurso ligado ao grupo) -> Postgres
 *   lanca erro 23503, capturado abaixo.
 * - Policy de DELETE nao satisfeita (usuario nao e admin da empresa) -> o
 *   DELETE roda sem erro, mas casa 0 linhas (nao ha "acesso negado"
 *   explicito em RLS) - por isso o array retornado vem vazio nesse caso.
 */
export async function excluirRegistro(
  tabela: string,
  id: string,
): Promise<ResultadoExclusao> {
  const { data, error } = await supabase
    .from(tabela)
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === CODIGO_FK_VIOLATION) {
      return { status: "vinculado" };
    }

    return {
      status: "erro",
      mensagem: error.message || "Nao foi possivel excluir o registro.",
    };
  }

  if (!data || data.length === 0) {
    return { status: "sem_permissao" };
  }

  return { status: "excluido" };
}
