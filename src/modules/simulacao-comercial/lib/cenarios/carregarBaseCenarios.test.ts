import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarBaseCenarios } from "./carregarBaseCenarios";
import { chaveOcorrenciaParaString } from "./chaveOcorrencia";
import { ProjetoSemItensError } from "../errors";
import { OperacaoSemRecursoError } from "@/modules/bom/lib/errors";

// Data fixa de disponibilidadeOriginalMaterial usada nos testes que não
// investigam especificamente essa restrição - qualquer data ISO válida serve.
const DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO = "2026-01-15";

type NoFixture = {
  produto_id: string;
  caminho: string[];
  caminho_bom_item_ids: string[];
  profundidade: number;
  quantidade_acumulada: number;
  bom_resolvido_id: string | null;
  tem_bom: boolean;
  ciclo: boolean;
  produto_ausente: boolean;
  produto_excluido: boolean;
  produto_inativo: boolean;
  tipo_item: string | null;
};

function noRaiz(produtoId: string, bomId: string, quantidade: number): NoFixture {
  return {
    produto_id: produtoId,
    caminho: [produtoId],
    caminho_bom_item_ids: [],
    profundidade: 0,
    quantidade_acumulada: quantidade,
    bom_resolvido_id: bomId,
    tem_bom: true,
    ciclo: false,
    produto_ausente: false,
    produto_excluido: false,
    produto_inativo: false,
    tipo_item: "acabado",
  };
}

function noSubconjunto(bomItemId: string, bomId: string, quantidade: number): NoFixture {
  return {
    produto_id: "produto-sub",
    caminho: ["produto-raiz", "produto-sub"],
    caminho_bom_item_ids: [bomItemId],
    profundidade: 1,
    quantidade_acumulada: quantidade,
    bom_resolvido_id: bomId,
    tem_bom: true,
    ciclo: false,
    produto_ausente: false,
    produto_excluido: false,
    produto_inativo: false,
    tipo_item: "subconjunto",
  };
}

type OpFixture = { id: string; bom_id: string; ordem: number; ativo: boolean; deleted_at: string | null };

function op(id: string, bomId: string, ordem: number): OpFixture {
  return { id, bom_id: bomId, ordem, ativo: true, deleted_at: null };
}

type DetalheFixture = { id: string; tempo_estimado_minutos: number; recurso_produtivo_id: string | null };

// Cenário base: 1 projeto item (produto-raiz, bom-raiz) com OP10/20/22/30
// + 1 subconjunto (bi-sub, bom-sub) com OP-sub-10, vínculo mestre para OP30
// - mesma topologia validada contra o roteiro real 6158-02.
function cenarioBase() {
  return {
    projetoItens: [{ id: "item-1", produto_id: "produto-raiz", quantidade: 2 }],
    nosPorProdutoRaiz: {
      "produto-raiz": [noRaiz("produto-raiz", "bom-raiz", 2), noSubconjunto("bi-sub", "bom-sub", 2)],
    },
    opsGrafo: [op("op-10", "bom-raiz", 10), op("op-20", "bom-raiz", 20), op("op-22", "bom-raiz", 22), op("op-30", "bom-raiz", 30), op("op-sub-10", "bom-sub", 10)],
    detalhes: [
      { id: "op-10", tempo_estimado_minutos: 60, recurso_produtivo_id: "recurso-A" },
      { id: "op-20", tempo_estimado_minutos: 30, recurso_produtivo_id: "recurso-A" },
      { id: "op-22", tempo_estimado_minutos: 15, recurso_produtivo_id: "recurso-B" },
      { id: "op-30", tempo_estimado_minutos: 120, recurso_produtivo_id: "recurso-B" },
      { id: "op-sub-10", tempo_estimado_minutos: 90, recurso_produtivo_id: "recurso-A" },
    ] as DetalheFixture[],
    vinculos: [{ bom_item_id: "bi-sub", bom_operacao_id: "op-30", deleted_at: null, ativo: true }],
  };
}

function criarClienteFalso(config: {
  projetoItens: { id: string; produto_id: string; quantidade: number }[];
  nosPorProdutoRaiz: Record<string, NoFixture[]>;
  opsGrafo: OpFixture[];
  detalhes: DetalheFixture[];
  vinculos: { bom_item_id: string; bom_operacao_id: string; deleted_at: string | null; ativo: boolean }[];
  capacidadePorRecurso?: Record<string, number>;
  produtividadePorRecurso?: Record<string, number>;
  comprometidoPorRecurso?: Record<string, number>;
  compatibilidades?: { recurso_origem_id: string; recurso_destino_id: string; prioridade: number }[];
}) {
  const chamadas: { rpcs: { nome: string; params: unknown }[] } = { rpcs: [] };

  const client = {
    rpc: (nome: string, params: Record<string, unknown>) => {
      chamadas.rpcs.push({ nome, params });
      if (nome === "gerar_lista_tecnica_projeto") {
        return Promise.resolve({ data: { estado: "calculado", itens_analisados: [], materiais: [] }, error: null });
      }
      if (nome === "lista_tecnica_nos_alcancaveis") {
        const produtoRaizId = params.p_produto_raiz_id as string;
        return Promise.resolve({ data: config.nosPorProdutoRaiz[produtoRaizId] ?? [], error: null });
      }
      if (nome === "calcular_produtividade_efetiva") {
        const recursoId = params.p_recurso_id as string;
        return Promise.resolve({ data: config.produtividadePorRecurso?.[recursoId] ?? 1, error: null });
      }
      if (nome === "calcular_comprometido_v2") {
        const recursoId = params.p_recurso_produtivo_id as string;
        return Promise.resolve({ data: config.comprometidoPorRecurso?.[recursoId] ?? 0, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `RPC não mockada nesta fake: ${nome}` } });
    },
    // Builder "sempre autoencadeável, sempre thenable": toda chamada de
    // filtro devolve o próprio builder (independente da ordem/quantidade
    // de chamadas encadeadas na implementação real), e o `then` resolve
    // com o dado certo no fim - evita depender de qual método é o
    // "último" da cadeia real (frágil a refatoração da implementação).
    from: (tabela: string) => {
      if (tabela === "projeto_itens") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          order: () => builder,
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: config.projetoItens, error: null })),
        };
        return builder;
      }
      if (tabela === "bom_operacoes") {
        let colunas = "";
        const builder = {
          select: (cols: string) => {
            colunas = cols;
            return builder;
          },
          eq: () => builder,
          in: () => builder,
          is: () => builder,
          then: (resolve: (v: unknown) => unknown) => {
            const ehDetalhe = colunas.includes("tempo_estimado_minutos");
            return Promise.resolve(resolve({ data: ehDetalhe ? config.detalhes : config.opsGrafo, error: null }));
          },
        };
        return builder;
      }
      if (tabela === "bom_operacao_dependencias_subconjunto") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          is: () => builder,
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: config.vinculos, error: null })),
        };
        return builder;
      }
      if (tabela === "recurso_produtivo_compatibilidades") {
        const builder = {
          select: () => builder,
          in: () => builder,
          eq: () => builder,
          is: () => builder,
          order: () => builder,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve({ data: config.compatibilidades ?? [], error: null })),
        };
        return builder;
      }
      if (tabela === "recursos_produtivos") {
        const builder = {
          select: () => builder,
          in: () => builder,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              resolve({
                data: Object.entries(config.capacidadePorRecurso ?? {}).map(([id, capacidade_horas_dia]) => ({
                  id,
                  capacidade_horas_dia,
                })),
                error: null,
              }),
            ),
        };
        return builder;
      }
      throw new Error(`Tabela inesperada nesta fake: ${tabela}`);
    },
  } as unknown as SupabaseClient;

  return { client, chamadas };
}

describe("carregarBaseCenarios - caso feliz (topologia real conhecida)", () => {
  it("monta ocorrências com necessarioHorasPadrao correto (tempoEstimadoMinutos/60 × quantidadeAcumulada)", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({
      ...cfg,
      capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 },
    });

    const base = await carregarBaseCenarios(client, "empresa-1", "projeto-1", DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO);

    const op30 = base.ocorrencias.find((o) => o.ocorrencia.bomOperacaoId === "op-30")!;
    expect(op30.necessarioHorasPadrao).toBeCloseTo((120 / 60) * 2); // 4h
    expect(op30.recursoOriginalId).toBe("recurso-B");

    const opSub = base.ocorrencias.find((o) => o.ocorrencia.bomOperacaoId === "op-sub-10")!;
    expect(opSub.necessarioHorasPadrao).toBeCloseTo((90 / 60) * 2); // 3h

    expect(base.ocorrencias).toHaveLength(5);
  });

  it("deriva chavesRaizOrcamentoNovo e chavesFinaisOrcamentoNovo corretamente do grafo de dependências", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({ ...cfg, capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 } });

    const base = await carregarBaseCenarios(client, "empresa-1", "projeto-1", DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO);

    // Raiz: OP10 (sem predecessora) e a operação do subconjunto (sem predecessora dentro do próprio caminho).
    const raizIds = base.chavesRaizOrcamentoNovo.map((c) => c.bomOperacaoId).sort();
    expect(raizIds).toEqual(["op-10", "op-sub-10"]);

    // Final: só OP30 (nada depende dele - é o fim da cadeia da raiz e recebe o vínculo do subconjunto).
    const finaisIds = base.chavesFinaisOrcamentoNovo.map((c) => c.bomOperacaoId);
    expect(finaisIds).toEqual(["op-30"]);
  });

  it("resolve recursoIds, capacidade e produtividade por recurso", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({
      ...cfg,
      capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 6 },
      produtividadePorRecurso: { "recurso-A": 1.1 },
      comprometidoPorRecurso: { "recurso-B": 12 },
    });

    const base = await carregarBaseCenarios(client, "empresa-1", "projeto-1", DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO);

    expect(base.recursoIds.sort()).toEqual(["recurso-A", "recurso-B"]);
    expect(base.capacidadeDiariaPorRecurso["recurso-B"]).toBe(6);
    expect(base.produtividadePorRecurso["recurso-A"]).toBeCloseTo(1.1);
    expect(base.comprometidoInicialPorRecurso["recurso-B"]).toBe(12);
    // Recurso sem comprometido configurado explicitamente = 0 (default do mock RPC).
    expect(base.comprometidoInicialPorRecurso["recurso-A"]).toBe(0);
  });
});

describe("carregarBaseCenarios - múltiplos projeto_itens combinados", () => {
  it("cada item usa sua própria quantidadeAcumulada, mesmo reaproveitando o mesmo bomId/subconjunto", async () => {
    const cfg = cenarioBase();
    const item2 = { id: "item-2", produto_id: "produto-raiz", quantidade: 5 };

    const { client } = criarClienteFalso({
      ...cfg,
      projetoItens: [...cfg.projetoItens, item2],
      nosPorProdutoRaiz: {
        // A RPC é chamada por produtoRaizId - mesma resposta topológica (o
        // fake não varia por quantidade, exatamente como a RPC real:
        // quantidade_acumulada devolvida reflete p_quantidade_raiz).
        "produto-raiz": [noRaiz("produto-raiz", "bom-raiz", 2), noSubconjunto("bi-sub", "bom-sub", 2)],
      },
      capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 },
    });

    // A fake precisa responder quantidade_acumulada proporcional a cada
    // chamada - sobrescreve o rpc para refletir p_quantidade_raiz de verdade,
    // já que os dois itens usam o MESMO produtoRaizId.
    const clienteComQuantidadeReal = {
      ...client,
      rpc: (nome: string, params: Record<string, unknown>) => {
        if (nome === "lista_tecnica_nos_alcancaveis") {
          const quantidade = params.p_quantidade_raiz as number;
          return Promise.resolve({
            data: [noRaiz("produto-raiz", "bom-raiz", quantidade), noSubconjunto("bi-sub", "bom-sub", quantidade)],
            error: null,
          });
        }
        return (client as unknown as { rpc: (n: string, p: unknown) => unknown }).rpc(nome, params);
      },
    } as unknown as SupabaseClient;

    const base = await carregarBaseCenarios(clienteComQuantidadeReal, "empresa-1", "projeto-1", DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO);

    // 5 ocorrências do item-1 (quantidade=2) + 5 do item-2 (quantidade=5) = 10, chaves distintas por projetoItemId.
    expect(base.ocorrencias).toHaveLength(10);

    const op30Item1 = base.ocorrencias.find(
      (o) => o.ocorrencia.bomOperacaoId === "op-30" && o.ocorrencia.chave.projetoItemId === "item-1",
    )!;
    const op30Item2 = base.ocorrencias.find(
      (o) => o.ocorrencia.bomOperacaoId === "op-30" && o.ocorrencia.chave.projetoItemId === "item-2",
    )!;

    expect(op30Item1.necessarioHorasPadrao).toBeCloseTo((120 / 60) * 2); // 4h (quantidade=2)
    expect(op30Item2.necessarioHorasPadrao).toBeCloseTo((120 / 60) * 5); // 10h (quantidade=5)
    expect(chaveOcorrenciaParaString(op30Item1.ocorrencia.chave)).not.toBe(
      chaveOcorrenciaParaString(op30Item2.ocorrencia.chave),
    );

    // operacoesPorBomId não duplica a mesma operação (mesmo bomId reaproveitado pelos 2 itens).
    expect(base.dependencias.length).toBeGreaterThan(0);
  });

  it("múltiplos itens/subconjuntos recebem as restrições de material corretas, sem duplicidade", async () => {
    const cfg = cenarioBase();
    const item2 = { id: "item-2", produto_id: "produto-raiz", quantidade: 5 };
    const { client } = criarClienteFalso({
      ...cfg,
      projetoItens: [...cfg.projetoItens, item2],
      capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 },
    });

    const base = await carregarBaseCenarios(client, "empresa-1", "projeto-1", "2026-02-01");

    // 2 raízes por item (OP10 + OP-sub-10) × 2 itens = 4 entradas, nenhuma a mais nem a menos.
    expect(base.chavesRaizOrcamentoNovo).toHaveLength(4);
    expect(Object.keys(base.restricaoMaterialPorChave)).toHaveLength(4);

    for (const chaveRaiz of base.chavesRaizOrcamentoNovo) {
      const chaveStr = chaveOcorrenciaParaString(chaveRaiz);
      expect(base.restricaoMaterialPorChave[chaveStr]).toBe("2026-02-01");
    }

    // Ocorrências NÃO-raiz (ex.: OP20/22/30, dependentes de predecessora) nunca ganham entrada direta -
    // o piso delas continua vindo inteiramente da predecessora, nunca de material.
    const chavesRaizStr = new Set(base.chavesRaizOrcamentoNovo.map(chaveOcorrenciaParaString));
    for (const { ocorrencia } of base.ocorrencias) {
      const chaveStr = chaveOcorrenciaParaString(ocorrencia.chave);
      if (!chavesRaizStr.has(chaveStr)) {
        expect(base.restricaoMaterialPorChave[chaveStr]).toBeUndefined();
      }
    }
  });
});

describe("carregarBaseCenarios - piso de material (restricaoMaterialPorChave)", () => {
  it("carregamento realista produz restrições para todas as raízes do projeto", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({ ...cfg, capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 } });

    const base = await carregarBaseCenarios(client, "empresa-1", "projeto-1", "2026-03-10");

    // Mesmas 2 raízes do teste de topologia (OP10 + OP-sub-10) - as 2 recebem a mesma disponibilidadeOriginalMaterial.
    expect(base.chavesRaizOrcamentoNovo).toHaveLength(2);
    for (const chaveRaiz of base.chavesRaizOrcamentoNovo) {
      expect(base.restricaoMaterialPorChave[chaveOcorrenciaParaString(chaveRaiz)]).toBe("2026-03-10");
    }
  });

  it("alteração externa não modifica a base congelada - restricaoMaterialPorChave é genuinamente imutável em runtime", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({ ...cfg, capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 } });

    const base = await carregarBaseCenarios(client, "empresa-1", "projeto-1", DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO);

    expect(Object.isFrozen(base.restricaoMaterialPorChave)).toBe(true);
    const [algumaChaveStr] = Object.keys(base.restricaoMaterialPorChave);
    expect(() => {
      // @ts-expect-error - mutação proposital para provar que é impedida em runtime, não é o contrato normal de uso.
      base.restricaoMaterialPorChave[algumaChaveStr] = "2099-01-01";
    }).toThrow(TypeError);
    expect(base.restricaoMaterialPorChave[algumaChaveStr]).toBe(DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO);
  });

  it("chamador não consegue esquecer de aplicar o piso - disponibilidadeOriginalMaterial é obrigatório em compilação E em execução", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({ ...cfg, capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 } });

    await expect(
      // @ts-expect-error - disponibilidadeOriginalMaterial omitido de propósito para provar que é obrigatório, não é o contrato normal de uso.
      carregarBaseCenarios(client, "empresa-1", "projeto-1"),
    ).rejects.toThrow(RangeError);
  });
});

describe("carregarBaseCenarios - erros explícitos", () => {
  it("projeto sem itens ativos", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({ ...cfg, projetoItens: [] });

    await expect(carregarBaseCenarios(client, "empresa-1", "projeto-1", DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO)).rejects.toThrow(ProjetoSemItensError);
  });

  it("operação sem recurso produtivo vinculado", async () => {
    const cfg = cenarioBase();
    const detalhesSemRecurso = cfg.detalhes.map((d) => (d.id === "op-30" ? { ...d, recurso_produtivo_id: null } : d));

    const { client } = criarClienteFalso({
      ...cfg,
      detalhes: detalhesSemRecurso,
      capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 },
    });

    await expect(carregarBaseCenarios(client, "empresa-1", "projeto-1", DISPONIBILIDADE_ORIGINAL_MATERIAL_PADRAO)).rejects.toThrow(OperacaoSemRecursoError);
  });

  it("base sem disponibilidade original (string vazia/inválida) é rejeitada - nunca vira {} silenciosamente", async () => {
    const cfg = cenarioBase();
    const { client } = criarClienteFalso({ ...cfg, capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 8 } });

    await expect(carregarBaseCenarios(client, "empresa-1", "projeto-1", "")).rejects.toThrow(RangeError);
    await expect(carregarBaseCenarios(client, "empresa-1", "projeto-1", "não-é-uma-data")).rejects.toThrow(RangeError);
  });
});
