// Camada fina sobre o UPDATE de bom_itens (linha de matéria-prima) -
// sem I/O além da própria chamada, sem estado. Só atualiza quantidade,
// unidade, dimensões e observações - materia_prima_id nunca entra no
// payload (trocar o insumo vinculado é escopo futuro de "Substituir
// matéria-prima"). Verifica se alguma linha voltou no .select() antes
// de reportar sucesso: RLS bloqueando (usuário não é created_by nem
// admin) não gera erro do Postgres, só devolve 0 linhas - sem essa
// checagem o chamador reportaria sucesso mesmo sem nada ter mudado.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NovoBomItemInput, ResultadoOperacaoRoteiro } from "../types";

export async function editarMaterial(
  client: SupabaseClient,
  bomItemId: string,
  input: NovoBomItemInput,
): Promise<ResultadoOperacaoRoteiro> {
  const { data, error } = await client
    .from("bom_itens")
    .update({
      quantidade: input.quantidade,
      unidade: input.unidade,
      dimensoes: input.dimensoes.trim() || null,
      observacoes: input.observacoes.trim() || null,
    })
    .eq("id", bomItemId)
    .select("id");

  if (error) {
    return {
      status: "erro",
      mensagem: error.message || "Não foi possível atualizar o material.",
    };
  }

  if (!data || data.length === 0) {
    return {
      status: "erro",
      mensagem:
        "Não foi possível atualizar - você não tem permissão para editar este registro.",
    };
  }

  return { status: "ok" };
}
