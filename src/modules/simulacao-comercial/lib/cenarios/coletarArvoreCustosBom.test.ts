import { describe, expect, it } from "vitest";
import { CicloBomDetectadoError, coletarArvoreCustosBom } from "./coletarArvoreCustosBom";

// Mock genérico que aplica filtros de verdade sobre tabelas em memória
// (não respostas canned por nome de tabela) - necessário porque o
// coletor faz a MESMA consulta a "boms"/"bom_itens" repetidamente, com
// parâmetros diferentes a cada nível de recursão.
type Filtro = { coluna: string; valor: unknown; tipo: "eq" | "in" | "is" };

function criarQueryFiltravel(linhas: Record<string, unknown>[], colunasSelecionadas?: string) {
  const filtros: Filtro[] = [];
  let ordenacao: { coluna: string; ascending: boolean } | null = null;

  const builder = {
    select: (_colunas: string) => builder,
    eq: (coluna: string, valor: unknown) => {
      filtros.push({ coluna, valor, tipo: "eq" });
      return builder;
    },
    in: (coluna: string, valores: unknown[]) => {
      filtros.push({ coluna, valor: valores, tipo: "in" });
      return builder;
    },
    is: (coluna: string, valor: unknown) => {
      filtros.push({ coluna, valor, tipo: "is" });
      return builder;
    },
    order: (coluna: string, opts: { ascending: boolean }) => {
      ordenacao = { coluna, ascending: opts.ascending };
      return resultado();
    },
    then: (onResolve: (r: { data: unknown; error: null }) => void) => resultado().then(onResolve),
  };

  function aplicarFiltros(): Record<string, unknown>[] {
    return linhas.filter((linha) =>
      filtros.every((f) => {
        if (f.tipo === "eq") return linha[f.coluna] === f.valor;
        if (f.tipo === "is") return linha[f.coluna] === f.valor;
        if (f.tipo === "in") return (f.valor as unknown[]).includes(linha[f.coluna]);
        return true;
      }),
    );
  }

  function resultado(): Promise<{ data: unknown; error: null }> {
    let dados = aplicarFiltros();
    if (ordenacao) {
      const { coluna, ascending } = ordenacao;
      dados = [...dados].sort((a, b) => {
        const va = a[coluna] as string;
        const vb = b[coluna] as string;
        return ascending ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    void colunasSelecionadas;
    return Promise.resolve({ data: dados, error: null });
  }

  return builder;
}

function criarClienteFake(tabelas: Record<string, Record<string, unknown>[]>) {
  return {
    from: (nome: string) => criarQueryFiltravel(tabelas[nome] ?? []),
  } as never;
}

describe("coletarArvoreCustosBom", () => {
  it("BOM simples: coleta matéria-prima, terceiros e transportes com identidade preservada", async () => {
    const client = criarClienteFake({
      boms: [{ id: "bom-1", empresa_id: "empresa-1", produto_id: "produto-1", versao: "A", status: "ativo", created_at: "2026-01-01", deleted_at: null }],
      bom_itens: [
        { id: "item-mp-1", empresa_id: "empresa-1", bom_id: "bom-1", componente_tipo: "materia_prima", materia_prima_id: "mp-1", componente_produto_id: null, quantidade: 2, unidade: "kg", ativo: true, deleted_at: null },
      ],
      materias_primas: [{ id: "mp-1", custo_referencia: 10.5 }],
      bom_servicos_terceiros: [{ id: "terceiro-1", empresa_id: "empresa-1", bom_id: "bom-1", ordem: 1, custo_estimado: 100, ativo: true, deleted_at: null }],
      bom_transportes: [{ id: "transporte-1", empresa_id: "empresa-1", bom_id: "bom-1", ordem: 1, custo_estimado: 50, ativo: true, deleted_at: null }],
    });

    const arvore = await coletarArvoreCustosBom(client, "empresa-1", "produto-1");

    expect(arvore).not.toBeNull();
    expect(arvore!.bomId).toBe("bom-1");
    expect(arvore!.bomVersao).toBe("A");
    expect(arvore!.materiais).toEqual([{ bomItemId: "item-mp-1", materiaPrimaId: "mp-1", quantidade: "2", unidade: "kg", custoReferencia: "10.5" }]);
    expect(arvore!.terceiros).toEqual([{ id: "terceiro-1", ordem: 1, custoEstimado: "100" }]);
    expect(arvore!.transportes).toEqual([{ id: "transporte-1", ordem: 1, custoEstimado: "50" }]);
  });

  it("recursivo: subconjunto entra com sua própria árvore, identidade dos dois níveis preservada", async () => {
    const client = criarClienteFake({
      boms: [
        { id: "bom-pai", empresa_id: "empresa-1", produto_id: "produto-pai", versao: "A", status: "ativo", created_at: "2026-01-01", deleted_at: null },
        { id: "bom-filho", empresa_id: "empresa-1", produto_id: "produto-filho", versao: "B", status: "ativo", created_at: "2026-01-01", deleted_at: null },
      ],
      bom_itens: [
        { id: "item-sub-1", empresa_id: "empresa-1", bom_id: "bom-pai", componente_tipo: "subconjunto", materia_prima_id: null, componente_produto_id: "produto-filho", quantidade: 3, unidade: "unidade", ativo: true, deleted_at: null },
        { id: "item-mp-filho", empresa_id: "empresa-1", bom_id: "bom-filho", componente_tipo: "materia_prima", materia_prima_id: "mp-2", componente_produto_id: null, quantidade: 1, unidade: "kg", ativo: true, deleted_at: null },
      ],
      materias_primas: [{ id: "mp-2", custo_referencia: 5 }],
      bom_servicos_terceiros: [],
      bom_transportes: [],
    });

    const arvore = await coletarArvoreCustosBom(client, "empresa-1", "produto-pai");

    expect(arvore!.subconjuntos).toHaveLength(1);
    expect(arvore!.subconjuntos[0].bomItemId).toBe("item-sub-1");
    expect(arvore!.subconjuntos[0].quantidade).toBe("3");
    expect(arvore!.subconjuntos[0].no.bomId).toBe("bom-filho");
    expect(arvore!.subconjuntos[0].no.materiais).toEqual([{ bomItemId: "item-mp-filho", materiaPrimaId: "mp-2", quantidade: "1", unidade: "kg", custoReferencia: "5" }]);
  });

  it("ciclo de BOM (A usa B como subconjunto, B usa A): lança CicloBomDetectadoError explícito, nunca para silenciosamente", async () => {
    const client = criarClienteFake({
      boms: [
        { id: "bom-a", empresa_id: "empresa-1", produto_id: "produto-a", versao: "A", status: "ativo", created_at: "2026-01-01", deleted_at: null },
        { id: "bom-b", empresa_id: "empresa-1", produto_id: "produto-b", versao: "A", status: "ativo", created_at: "2026-01-01", deleted_at: null },
      ],
      bom_itens: [
        { id: "item-a-usa-b", empresa_id: "empresa-1", bom_id: "bom-a", componente_tipo: "subconjunto", materia_prima_id: null, componente_produto_id: "produto-b", quantidade: 1, unidade: "unidade", ativo: true, deleted_at: null },
        { id: "item-b-usa-a", empresa_id: "empresa-1", bom_id: "bom-b", componente_tipo: "subconjunto", materia_prima_id: null, componente_produto_id: "produto-a", quantidade: 1, unidade: "unidade", ativo: true, deleted_at: null },
      ],
      materias_primas: [],
      bom_servicos_terceiros: [],
      bom_transportes: [],
    });

    await expect(coletarArvoreCustosBom(client, "empresa-1", "produto-a")).rejects.toThrow(CicloBomDetectadoError);
  });

  it('resolução de BOM: prefere "ativo"; sem nenhum ativo, cai para o mais recente - mesma regra do resto do projeto', async () => {
    const client = criarClienteFake({
      boms: [
        { id: "bom-antigo-ativo", empresa_id: "empresa-1", produto_id: "produto-1", versao: "A", status: "ativo", created_at: "2025-01-01", deleted_at: null },
        { id: "bom-novo-rascunho", empresa_id: "empresa-1", produto_id: "produto-1", versao: "B", status: "rascunho", created_at: "2026-01-01", deleted_at: null },
      ],
      bom_itens: [],
      materias_primas: [],
      bom_servicos_terceiros: [],
      bom_transportes: [],
    });

    const arvore = await coletarArvoreCustosBom(client, "empresa-1", "produto-1");
    expect(arvore!.bomId).toBe("bom-antigo-ativo");
  });

  it("produto sem nenhum BOM: retorna null, nunca lança erro (mesmo critério de custo 0 usado no resto do projeto)", async () => {
    const client = criarClienteFake({ boms: [], bom_itens: [], materias_primas: [], bom_servicos_terceiros: [], bom_transportes: [] });
    const arvore = await coletarArvoreCustosBom(client, "empresa-1", "produto-inexistente");
    expect(arvore).toBeNull();
  });
});
