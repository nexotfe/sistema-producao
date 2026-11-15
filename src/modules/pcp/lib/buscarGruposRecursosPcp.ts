// NEXOTFE — Planejamento Diário (PCP): leitura dos Grupos de Recursos
// reais da empresa (grupos_recursos) + o vínculo recurso→grupo
// (recursos_produtivos.grupo_id - confirmado contra o banco real; a
// coluna NÃO se chama grupo_recurso_id, divergência do baseline
// encontrada e corrigida em 2026-11-10), só para o filtro da tela.
// Nenhuma tabela nova, nenhum grupo inventado. Client de SESSÃO (RLS
// normal) - nunca service_role.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GrupoRecursoPcp {
  readonly id: string;
  readonly nome: string;
}

export interface RespostaGruposRecursosPcp {
  readonly ok: true;
  readonly grupos: readonly GrupoRecursoPcp[];
  /** recursoId -> grupoRecursoId, só dos recursos ativos. */
  readonly grupoIdPorRecursoId: Readonly<Record<string, string>>;
}

export type RespostaBuscarGruposRecursosPcp = RespostaGruposRecursosPcp | { readonly ok: false; readonly motivo: "erro_desconhecido" };

function logErroTecnico(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarGruposRecursosPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarGruposRecursosPcp(client: SupabaseClient): Promise<RespostaBuscarGruposRecursosPcp> {
  const [gruposResult, recursosResult] = await Promise.all([
    client.from("grupos_recursos").select("id, nome").eq("ativo", true).order("nome", { ascending: true }),
    client.from("recursos_produtivos").select("id, grupo_id").eq("ativo", true),
  ]);

  if (gruposResult.error) {
    logErroTecnico("grupos_recursos", gruposResult.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (recursosResult.error) {
    logErroTecnico("recursos_produtivos", recursosResult.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const grupos = (gruposResult.data ?? []).map((linha) => ({ id: linha.id as string, nome: linha.nome as string }));
  const grupoIdPorRecursoId: Record<string, string> = {};
  for (const linha of recursosResult.data ?? []) {
    grupoIdPorRecursoId[linha.id as string] = linha.grupo_id as string;
  }

  return { ok: true, grupos, grupoIdPorRecursoId };
}
