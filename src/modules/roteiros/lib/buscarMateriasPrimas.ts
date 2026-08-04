// Função de busca paginada de matérias-primas para o autocomplete do
// Roteiro (MateriaPrimaSearchInput.tsx) - compatível com o contrato
// BuscarPagina<T> de useBuscaPaginada.ts. Sem I/O de tela, sem estado -
// só monta e executa a consulta.
//
// Termo vazio = modo navegação (lista completa, paginada, ordenada por
// descricao/id) - sem termo, não filtra por coluna nenhuma, só aplica
// ativo/deleted_at (RLS já filtra empresa_id, mas ambos os filtros
// explícitos abaixo ficam, mesmo padrão do componente anterior - RLS é
// a fonte de verdade de tenant, os filtros aqui são defesa em
// profundidade/legibilidade, não substituem RLS).
import { supabase } from "@/lib/supabaseClient";
import { construirFiltroOrIlike } from "@/modules/shared/lib/filtroBuscaTexto";
import type { BuscarPagina } from "@/modules/shared/hooks/useBuscaPaginada";

export type MateriaPrimaResumo = {
  id: string;
  codigo: string | null;
  descricao: string;
  unidade: string;
};

type MateriaPrimaRow = {
  id: string;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
};

// Colunas textuais pesquisadas - código, descrição e a especificação
// (coluna real é material_especificacao, renomeada de "especificacao"
// na migration 202607050006_materias_primas_alinhamento_foundation).
const COLUNAS_BUSCA = ["codigo", "descricao", "material_especificacao"];

export const buscarPaginaMateriasPrimas: BuscarPagina<MateriaPrimaResumo> = async ({
  termo,
  offset,
  limite,
}) => {
  let consulta = supabase
    .from("materias_primas")
    .select("id,codigo,descricao,unidade")
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("descricao", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limite - 1);

  const termoBusca = termo.trim();
  if (termoBusca) {
    consulta = consulta.or(construirFiltroOrIlike(COLUNAS_BUSCA, termoBusca));
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error(`Erro ao buscar matérias-primas: ${error.message}`);
  }

  return ((data ?? []) as MateriaPrimaRow[]).map((linha) => ({
    id: linha.id,
    codigo: linha.codigo,
    descricao: linha.descricao ?? "",
    unidade: linha.unidade ?? "",
  }));
};
