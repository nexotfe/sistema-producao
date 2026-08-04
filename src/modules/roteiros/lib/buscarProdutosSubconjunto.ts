// Função de busca paginada de produtos candidatos a subconjunto, para
// o autocomplete de "Montar Subconjunto" do Roteiro
// (ProdutoSubconjuntoSearchInput.tsx) - mesmo contrato BuscarPagina<T>
// de useBuscaPaginada.ts, mesmo padrão de buscarMateriasPrimas.ts.
//
// Cadastro de itens_industriais só tem Código (coluna pn é legada,
// sempre nula na base real - nunca consultada nem exibida aqui).
//
// temBom reflete EXATAMENTE a mesma definição de "BOM resolvível" da
// função SQL resolver_bom_ativo_produto / resolverBomAtivo.ts: BOM com
// ativo=true e deleted_at is null. Uma consulta ingênua via embed
// (boms(id)) poderia contar um BOM excluído/inativo e habilitar
// incorretamente um produto sem estrutura utilizável - por isso a
// checagem é uma segunda consulta em lote, explícita.
import { supabase } from "@/lib/supabaseClient";
import { construirFiltroOrIlike } from "@/modules/shared/lib/filtroBuscaTexto";
import type { BuscarPagina } from "@/modules/shared/hooks/useBuscaPaginada";

export type ProdutoSubconjuntoResumo = {
  id: string;
  codigo: string;
  descricao: string;
  temBom: boolean;
};

type ItemIndustrialRow = {
  id: string;
  codigo: string | null;
  descricao: string | null;
};

const COLUNAS_BUSCA = ["codigo", "descricao"];

export function criarBuscarPaginaProdutosSubconjunto(
  produtoAtualId: string,
): BuscarPagina<ProdutoSubconjuntoResumo> {
  return async ({ termo, offset, limite }) => {
    let consulta = supabase
      .from("itens_industriais")
      .select("id,codigo,descricao")
      .eq("ativo", true)
      .is("deleted_at", null)
      .neq("id", produtoAtualId)
      .order("descricao", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1);

    const termoBusca = termo.trim();
    if (termoBusca) {
      consulta = consulta.or(construirFiltroOrIlike(COLUNAS_BUSCA, termoBusca));
    }

    const { data, error } = await consulta;

    if (error) {
      throw new Error(`Erro ao buscar produtos: ${error.message}`);
    }

    const produtos = ((data ?? []) as ItemIndustrialRow[]).map((linha) => ({
      id: linha.id,
      codigo: linha.codigo ?? "",
      descricao: linha.descricao ?? "",
    }));

    if (produtos.length === 0) return [];

    const ids = produtos.map((p) => p.id);
    const { data: bomsData, error: erroBoms } = await supabase
      .from("boms")
      .select("produto_id")
      .in("produto_id", ids)
      .eq("ativo", true)
      .is("deleted_at", null);

    if (erroBoms) {
      throw new Error(`Erro ao verificar BOMs dos produtos: ${erroBoms.message}`);
    }

    const produtosComBom = new Set(
      ((bomsData ?? []) as { produto_id: string }[]).map((linha) => linha.produto_id),
    );

    return produtos.map((produto) => ({
      ...produto,
      temBom: produtosComBom.has(produto.id),
    }));
  };
}
