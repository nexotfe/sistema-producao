import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  caminhoBomItemIdsParaChave,
  coletarGrafoOcorrenciasBom,
  montarGrafoOcorrenciasBom,
  type BomOperacaoRowBruta,
  type NoAlcancavelBruto,
} from "./coletarGrafoOcorrenciasBom";
import type { LinhaBrutaDependenciaSubconjunto } from "./mapearVinculosSubconjunto";
import { construirGrafoOcorrencias } from "./grafoPrecedencia";
import { chaveOcorrenciaParaString } from "./chaveOcorrencia";

// Fixture espelhando o caso real conhecido (roteiro 6158-02): raiz com
// OP10/OP20/OP22/OP30, 1 subconjunto (02-6158-03-01) com 1 operação
// própria, vínculo mestre ligando o subconjunto a OP30 especificamente.
function noRaiz(overrides: Partial<NoAlcancavelBruto> = {}): NoAlcancavelBruto {
  return {
    produto_id: "produto-raiz",
    caminho: ["produto-raiz"],
    caminho_bom_item_ids: [],
    profundidade: 0,
    quantidade_acumulada: 1,
    bom_resolvido_id: "bom-raiz",
    tem_bom: true,
    ciclo: false,
    produto_ausente: false,
    produto_excluido: false,
    produto_inativo: false,
    tipo_item: "acabado",
    ...overrides,
  };
}

function noSubconjunto(overrides: Partial<NoAlcancavelBruto> = {}): NoAlcancavelBruto {
  return {
    produto_id: "produto-sub",
    caminho: ["produto-raiz", "produto-sub"],
    caminho_bom_item_ids: ["bi-sub"],
    profundidade: 1,
    quantidade_acumulada: 3,
    bom_resolvido_id: "bom-sub",
    tem_bom: true,
    ciclo: false,
    produto_ausente: false,
    produto_excluido: false,
    produto_inativo: false,
    tipo_item: "subconjunto",
    ...overrides,
  };
}

function op(id: string, bomId: string, ordem: number, overrides: Partial<BomOperacaoRowBruta> = {}): BomOperacaoRowBruta {
  return { id, bom_id: bomId, ordem, ativo: true, deleted_at: null, ...overrides };
}

function opsRaizPadrao(): BomOperacaoRowBruta[] {
  return [
    op("op-10", "bom-raiz", 10),
    op("op-20", "bom-raiz", 20),
    op("op-22", "bom-raiz", 22),
    op("op-30", "bom-raiz", 30),
  ];
}

function opsSubPadrao(): BomOperacaoRowBruta[] {
  return [op("op-sub-10", "bom-sub", 10)];
}

function vinculoOp30(overrides: Partial<LinhaBrutaDependenciaSubconjunto> = {}): LinhaBrutaDependenciaSubconjunto {
  return { bom_item_id: "bi-sub", bom_operacao_id: "op-30", deleted_at: null, ativo: true, ...overrides };
}

describe("montarGrafoOcorrenciasBom - caso real conhecido (roteiro 6158-02)", () => {
  it("monta ocorrencias/operacoesPorBomId/subconjuntosUsados/vinculosMestres corretamente", () => {
    const resultado = montarGrafoOcorrenciasBom({
      projetoItemId: "item-1",
      produtoRaizId: "produto-raiz",
      nos: [noRaiz(), noSubconjunto()],
      operacoesBrutas: [...opsRaizPadrao(), ...opsSubPadrao()],
      vinculosBrutos: [vinculoOp30()],
    });

    expect(resultado.ocorrencias).toHaveLength(5); // 4 na raiz + 1 no subconjunto
    expect(resultado.subconjuntosUsados).toEqual([
      { bomItemId: "bi-sub", bomIdPai: "bom-raiz", bomIdSubconjunto: "bom-sub" },
    ]);
    expect(resultado.vinculosMestres).toEqual([
      { bomItemIdSubconjunto: "bi-sub", bomOperacaoIdConsumidora: "op-30" },
    ]);
    expect(Object.keys(resultado.operacoesPorBomId).sort()).toEqual(["bom-raiz", "bom-sub"]);
    expect(resultado.operacoesPorBomId["bom-raiz"]).toHaveLength(4);
    expect(resultado.quantidadeAcumuladaPorCaminho[caminhoBomItemIdsParaChave([])]).toBe(1);
    expect(resultado.quantidadeAcumuladaPorCaminho[caminhoBomItemIdsParaChave(["bi-sub"])]).toBe(3);
  });

  it("OP30 só é liberada após a conclusão do subconjunto; OP10/20/22 continuam independentes (via construirGrafoOcorrencias)", () => {
    const grafo = montarGrafoOcorrenciasBom({
      projetoItemId: "item-1",
      produtoRaizId: "produto-raiz",
      nos: [noRaiz(), noSubconjunto()],
      operacoesBrutas: [...opsRaizPadrao(), ...opsSubPadrao()],
      vinculosBrutos: [vinculoOp30()],
    });

    const { dependencias } = construirGrafoOcorrencias(grafo);

    const porTipoESucessora = (bomOperacaoId: string, tipo: string) =>
      dependencias.filter((d) => d.sucessora.bomOperacaoId === bomOperacaoId && d.tipo === tipo);

    // OP30 depende da última operação do subconjunto (consumo_subconjunto) E de OP22 (sequência do roteiro).
    expect(porTipoESucessora("op-30", "consumo_subconjunto")).toHaveLength(1);
    expect(porTipoESucessora("op-30", "consumo_subconjunto")[0].predecessora.bomOperacaoId).toBe("op-sub-10");
    expect(porTipoESucessora("op-30", "sequencia_roteiro")).toHaveLength(1);
    expect(porTipoESucessora("op-30", "sequencia_roteiro")[0].predecessora.bomOperacaoId).toBe("op-22");

    // OP10/OP20/OP22 nunca aparecem como sucessora de uma dependência consumo_subconjunto - independentes do vínculo.
    for (const bomOperacaoId of ["op-10", "op-20", "op-22"]) {
      expect(porTipoESucessora(bomOperacaoId, "consumo_subconjunto")).toHaveLength(0);
    }
  });

  it("sem vínculo mestre, cai no fallback conservador: TODAS as ocorrências da raiz dependem da última operação do subconjunto", () => {
    const grafo = montarGrafoOcorrenciasBom({
      projetoItemId: "item-1",
      produtoRaizId: "produto-raiz",
      nos: [noRaiz(), noSubconjunto()],
      operacoesBrutas: [...opsRaizPadrao(), ...opsSubPadrao()],
      vinculosBrutos: [], // nenhum vínculo mestre cadastrado
    });

    const { dependencias } = construirGrafoOcorrencias(grafo);
    const consumoSubconjunto = dependencias.filter((d) => d.tipo === "consumo_subconjunto");

    expect(consumoSubconjunto).toHaveLength(4); // as 4 operações da raiz, não só OP30
    expect(new Set(consumoSubconjunto.map((d) => d.sucessora.bomOperacaoId))).toEqual(
      new Set(["op-10", "op-20", "op-22", "op-30"]),
    );
  });

  it("a chave completa de cada ocorrência do subconjunto inclui o bomItemId no caminho (nunca colide com a raiz)", () => {
    const grafo = montarGrafoOcorrenciasBom({
      projetoItemId: "item-1",
      produtoRaizId: "produto-raiz",
      nos: [noRaiz(), noSubconjunto()],
      operacoesBrutas: [...opsRaizPadrao(), ...opsSubPadrao()],
      vinculosBrutos: [vinculoOp30()],
    });

    const ocorrenciaSub = grafo.ocorrencias.find((o) => o.bomOperacaoId === "op-sub-10")!;
    expect(ocorrenciaSub.chave.caminhoBomItemIds).toEqual(["bi-sub"]);
    expect(chaveOcorrenciaParaString(ocorrenciaSub.chave)).toBe("item-1::produto-raiz::bi-sub::op-sub-10");
  });
});

describe("montarGrafoOcorrenciasBom - erros explícitos, nunca ignorados silenciosamente", () => {
  it("nenhum nó devolvido pela RPC", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({ projetoItemId: "item-1", produtoRaizId: "produto-raiz", nos: [], operacoesBrutas: [], vinculosBrutos: [] }),
    ).toThrow(/não devolveu nenhum nó/);
  });

  it("ciclo detectado", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noSubconjunto({ ciclo: true })],
        operacoesBrutas: opsRaizPadrao(),
        vinculosBrutos: [],
      }),
    ).toThrow(/Ciclo detectado/);
  });

  it("produto ausente", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noSubconjunto({ produto_ausente: true })],
        operacoesBrutas: opsRaizPadrao(),
        vinculosBrutos: [],
      }),
    ).toThrow(/Produto ausente/);
  });

  it("produto excluído", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noSubconjunto({ produto_excluido: true })],
        operacoesBrutas: opsRaizPadrao(),
        vinculosBrutos: [],
      }),
    ).toThrow(/Produto excluído/);
  });

  it("roteiro ausente na raiz (sem BOM ativo resolvível)", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz({ tem_bom: false, bom_resolvido_id: null })],
        operacoesBrutas: [],
        vinculosBrutos: [],
      }),
    ).toThrow(/Roteiro ausente/);
  });

  it("subconjunto sem roteiro resolvível", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noSubconjunto({ tem_bom: false, bom_resolvido_id: null })],
        operacoesBrutas: opsRaizPadrao(),
        vinculosBrutos: [],
      }),
    ).toThrow(/Subconjunto sem roteiro resolvível/);
  });

  it("IDs repetidos: dois nós com o mesmo caminhoBomItemIds", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noRaiz()],
        operacoesBrutas: opsRaizPadrao(),
        vinculosBrutos: [],
      }),
    ).toThrow(/IDs inconsistentes.*caminhoBomItemIds/);
  });

  it("IDs repetidos: operação duplicada dentro do mesmo bom_id", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz()],
        operacoesBrutas: [op("op-10", "bom-raiz", 10), op("op-10", "bom-raiz", 10)],
        vinculosBrutos: [],
      }),
    ).toThrow(/IDs inconsistentes.*bom_operacoes\.id/);
  });

  it("operação ausente: roteiro raiz sem nenhuma operação ativa", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz()],
        operacoesBrutas: [],
        vinculosBrutos: [],
      }),
    ).toThrow(/Operação ausente/);
  });

  it("vínculo apontando para bomItemIdSubconjunto que não é um subconjunto usado (vínculo solto)", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noSubconjunto()],
        operacoesBrutas: [...opsRaizPadrao(), ...opsSubPadrao()],
        vinculosBrutos: [vinculoOp30({ bom_item_id: "bi-inexistente" })],
      }),
    ).toThrow(/não corresponde a nenhum subconjunto usado/);
  });

  it("vínculo apontando para operação de outro bom_id (não o bom_id pai correto)", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noSubconjunto()],
        operacoesBrutas: [...opsRaizPadrao(), ...opsSubPadrao()],
        vinculosBrutos: [vinculoOp30({ bom_operacao_id: "op-sub-10" })], // op-sub-10 é do bom-sub, não do bom-raiz (pai)
      }),
    ).toThrow(/não corresponde a nenhuma operação de bomId/);
  });

  it("vínculo apontando para operação inativa", () => {
    expect(() =>
      montarGrafoOcorrenciasBom({
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        nos: [noRaiz(), noSubconjunto()],
        operacoesBrutas: [...opsRaizPadrao().map((o) => (o.id === "op-30" ? { ...o, ativo: false } : o)), ...opsSubPadrao()],
        vinculosBrutos: [vinculoOp30()],
      }),
    ).toThrow(/não está ativa/);
  });
});

describe("coletarGrafoOcorrenciasBom - leitura (I/O, cliente injetado)", () => {
  function criarClienteFalso() {
    const chamadas: {
      rpc?: { nome: string; params: unknown };
      bomOperacoesEmpresaId?: string;
      bomOperacoesBomIds?: string[];
      vinculosEmpresaId?: string;
      vinculosBomItemIds?: string[];
    } = {};

    const client = {
      rpc: (nome: string, params: unknown) => {
        chamadas.rpc = { nome, params };
        return Promise.resolve({
          data: [noRaiz(), noSubconjunto()],
          error: null,
        });
      },
      from: (tabela: string) => {
        if (tabela === "bom_operacoes") {
          const builder = {
            select: () => builder,
            eq: (coluna: string, valor: string) => {
              if (coluna === "empresa_id") chamadas.bomOperacoesEmpresaId = valor;
              return builder;
            },
            in: (_coluna: string, valores: string[]) => {
              chamadas.bomOperacoesBomIds = valores;
              return builder;
            },
            is: () => Promise.resolve({ data: [...opsRaizPadrao(), ...opsSubPadrao()], error: null }),
          };
          return builder;
        }
        if (tabela === "bom_operacao_dependencias_subconjunto") {
          const builder = {
            select: () => builder,
            eq: (coluna: string, valor: string) => {
              if (coluna === "empresa_id") chamadas.vinculosEmpresaId = valor;
              return builder;
            },
            in: (_coluna: string, valores: string[]) => {
              chamadas.vinculosBomItemIds = valores;
              return builder;
            },
            is: () => Promise.resolve({ data: [vinculoOp30()], error: null }),
          };
          return builder;
        }
        throw new Error(`Tabela inesperada nesta fake: ${tabela}`);
      },
    } as unknown as SupabaseClient;

    return { client, chamadas };
  }

  it("chama a RPC lista_tecnica_nos_alcancaveis com os parâmetros corretos", async () => {
    const { client, chamadas } = criarClienteFalso();

    await coletarGrafoOcorrenciasBom(client, {
      empresaId: "empresa-1",
      projetoItemId: "item-1",
      produtoRaizId: "produto-raiz",
      quantidadeRaiz: 3,
    });

    expect(chamadas.rpc).toEqual({
      nome: "lista_tecnica_nos_alcancaveis",
      params: { p_produto_raiz_id: "produto-raiz", p_quantidade_raiz: 3 },
    });
  });

  it("filtra bom_operacoes e vínculos por empresa_id e pelos bomIds/bomItemIds resolvidos - nunca confia só em RLS", async () => {
    const { client, chamadas } = criarClienteFalso();

    await coletarGrafoOcorrenciasBom(client, {
      empresaId: "empresa-1",
      projetoItemId: "item-1",
      produtoRaizId: "produto-raiz",
      quantidadeRaiz: 1,
    });

    expect(chamadas.bomOperacoesEmpresaId).toBe("empresa-1");
    expect(chamadas.bomOperacoesBomIds?.sort()).toEqual(["bom-raiz", "bom-sub"]);
    expect(chamadas.vinculosEmpresaId).toBe("empresa-1");
    expect(chamadas.vinculosBomItemIds).toEqual(["bi-sub"]);
  });

  it("devolve o grafo montado corretamente de ponta a ponta", async () => {
    const { client } = criarClienteFalso();

    const resultado = await coletarGrafoOcorrenciasBom(client, {
      empresaId: "empresa-1",
      projetoItemId: "item-1",
      produtoRaizId: "produto-raiz",
      quantidadeRaiz: 1,
    });

    expect(resultado.ocorrencias).toHaveLength(5);
    expect(resultado.vinculosMestres).toEqual([
      { bomItemIdSubconjunto: "bi-sub", bomOperacaoIdConsumidora: "op-30" },
    ]);
  });

  it("propaga erro explícito quando a RPC falha", async () => {
    const client = {
      rpc: () => Promise.resolve({ data: null, error: { message: "falha simulada" } }),
    } as unknown as SupabaseClient;

    await expect(
      coletarGrafoOcorrenciasBom(client, {
        empresaId: "empresa-1",
        projetoItemId: "item-1",
        produtoRaizId: "produto-raiz",
        quantidadeRaiz: 1,
      }),
    ).rejects.toThrow(/falha simulada/);
  });
});
