// Etapa 65C — leitura dos recursos produtivos ATIVOS da empresa atual,
// para o seletor de "Recurso" dos modais Adicionar/Editar OP (substitui
// o campo de texto livre mockado da Etapa 59A). Client de SESSÃO -
// RLS ("recursos produtivos select mesma empresa") já isola por
// empresa_atual_id() e já filtra deleted_at - nenhuma filtragem extra
// necessária aqui além de ordenar para exibição.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RecursoProdutivoOpcaoPcp {
  readonly id: string;
  readonly label: string;
}

export type RespostaRecursosProdutivosPcp =
  | { readonly ok: true; readonly recursos: readonly RecursoProdutivoOpcaoPcp[] }
  | { readonly ok: false; readonly motivo: "erro_desconhecido" };

function logErroTecnicoRecursosProdutivosPcp(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarRecursosProdutivosPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarRecursosProdutivosPcp(client: SupabaseClient): Promise<RespostaRecursosProdutivosPcp> {
  const { data, error } = await client
    .from("recursos_produtivos")
    .select("id, codigo, nome")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    logErroTecnicoRecursosProdutivosPcp("recursos_produtivos", error);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const recursos = (data ?? []).map((linha) => ({
    id: linha.id as string,
    label: [linha.codigo as string | null, linha.nome as string].filter(Boolean).join(" — "),
  }));

  return { ok: true, recursos };
}
