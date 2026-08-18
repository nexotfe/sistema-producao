import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarNecessidadesOrcamentoNovo } from "./carregarNecessidadesOrcamentoNovo";
import { chaveOcorrenciaParaString } from "./chaveOcorrencia";
import { OperacaoSemRecursoError } from "@/modules/bom/lib/errors";

// Mesma topologia de fixture de carregarBaseCenarios.test.ts (validada
// contra o roteiro real 6158-02): 1 projeto_item (produto-raiz, bom-raiz)
// com OP10/20/22/30 + 1 subconjunto (bi-sub, bom-sub) com OP-sub-10.
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
  compatibilidades?: { recurso_origem_id: string; recurso_destino_id: string; prioridade: number; ativo?: boolean; deleted_at?: string | null }[];
}) {
  const client = {
    rpc: (nome: string, params: Record<string, unknown>) => {
      if (nome === "gerar_lista_tecnica_projeto") {
        return Promise.resolve({ data: { estado: "calculado", itens_analisados: [], materiais: [] }, error: null });
      }
      if (nome === "lista_tecnica_nos_alcancaveis") {
        const produtoRaizId = params.p_produto_raiz_id as string;
        return Promise.resolve({ data: config.nosPorProdutoRaiz[produtoRaizId] ?? [], error: null });
      }
      throw new Error(`RPC não mockada nesta fake (esta função nunca deveria chamar nenhuma outra): ${nome}`);
    },
    from: (tabela: string) => {
      if (tabela === "simulacoes_comerciais" || tabela === "simulacao_comercial_itens") {
        throw new Error(
          `Tabela "${tabela}" nunca deveria ser consultada por carregarNecessidadesOrcamentoNovo - essa é a fonte ERRADA (snapshot aprovado), exclusiva de projetos confirmados. Achado real (projeto 260011): exigir isso aqui bloqueava todo orçamento ainda não aprovado.`,
        );
      }
      if (tabela === "projeto_itens") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          order: () => builder,
          insert: () => {
            throw new Error("Mock não implementa insert - o carregador nunca deveria escrever.");
          },
          update: () => {
            throw new Error("Mock não implementa update - o carregador nunca deveria escrever.");
          },
          delete: () => {
            throw new Error("Mock não implementa delete - o carregador nunca deveria escrever.");
          },
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
        const filtros: ((linha: NonNullable<typeof config.compatibilidades>[number]) => boolean)[] = [];
        const ordens: { coluna: string; ascending: boolean }[] = [];
        const builder = {
          select: () => builder,
          eq: (coluna: string, valor: unknown) => {
            filtros.push((linha) => (linha as unknown as Record<string, unknown>)[coluna] === valor);
            return builder;
          },
          in: (coluna: string, valores: readonly unknown[]) => {
            filtros.push((linha) => valores.includes((linha as unknown as Record<string, unknown>)[coluna]));
            return builder;
          },
          is: (coluna: string, valor: null) => {
            filtros.push((linha) => (linha as unknown as Record<string, unknown>)[coluna] === valor);
            return builder;
          },
          order: (coluna: string, opcoes?: { ascending?: boolean }) => {
            ordens.push({ coluna, ascending: opcoes?.ascending ?? true });
            return builder;
          },
          then: (resolve: (v: unknown) => unknown) => {
            let resultado = (config.compatibilidades ?? []).filter((linha) => filtros.every((f) => f(linha)));
            for (const { coluna, ascending } of ordens) {
              resultado = [...resultado].sort((a, b) => {
                const av = (a as unknown as Record<string, unknown>)[coluna] as number;
                const bv = (b as unknown as Record<string, unknown>)[coluna] as number;
                return ascending ? av - bv : bv - av;
              });
            }
            return Promise.resolve(resolve({ data: resultado, error: null }));
          },
        };
        return builder;
      }
      throw new Error(`Tabela inesperada nesta fake: ${tabela}`);
    },
  } as unknown as SupabaseClient;

  return client;
}

const DISPONIVEL_A_PARTIR_DE = "2026-09-01";

describe("carregarNecessidadesOrcamentoNovo - correção: nunca exige simulação comercial vigente", () => {
  it("calcula necessidades direto do roteiro atual, mesmo SEM nenhuma simulacoes_comerciais/simulacao_comercial_itens existir - orçamento pré-aprovação é o caso normal", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    // Se este loader tocasse simulacoes_comerciais/simulacao_comercial_itens,
    // o mock lançaria (ver criarClienteFalso) - a promise resolver é a prova.
    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    expect(resultado.diagnosticos).toEqual([]);
    expect(resultado.necessidades).toHaveLength(4); // OP10/20/22/30 do produto principal - subconjunto considerado pronto, ver describe dedicado abaixo
  });

  it("horasNecessariasPadrao = tempoEstimadoMinutos/60 × quantidadeAcumulada - mesma fórmula do motor antigo", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    const op30 = resultado.necessidades.find((n) => n.chaveTrabalho.includes("op-30"))!;
    expect(op30.horasNecessariasPadrao).toBeCloseTo((120 / 60) * 2); // 4h
    expect(op30.recursoOriginalId).toBe("recurso-B");
  });

  it("disponivelAPartirDe é aplicado uniformemente a todas as necessidades", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    expect(resultado.necessidades.every((n) => n.disponivelAPartirDe === DISPONIVEL_A_PARTIR_DE)).toBe(true);
  });

  it("chaveTrabalho é estável e única (chaveOcorrenciaParaString) - cada operação/caminho é uma necessidade independente", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    const chaves = resultado.necessidades.map((n) => n.chaveTrabalho);
    expect(new Set(chaves).size).toBe(chaves.length); // sem duplicata

    const op30 = resultado.necessidades.find((n) => n.chaveTrabalho.includes("op-30"))!;
    expect(op30.chaveTrabalho).toBe(chaveOcorrenciaParaString({ projetoItemId: "item-1", produtoRaizId: "produto-raiz", caminhoBomItemIds: [], bomOperacaoId: "op-30" }));
  });

  it("projetoItemId reflete o projeto_itens real (nunca um proxy de simulação) - metadado/auditoria", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    expect(resultado.necessidades.every((n) => n.projetoItemId === "item-1")).toBe(true);
  });

  it("recursosCompativeisPorPrioridade vem do cadastro FRESCO (recurso_produtivo_compatibilidades), ordenado por prioridade", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso({
      ...cfg,
      compatibilidades: [
        { recurso_origem_id: "recurso-A", recurso_destino_id: "recurso-C", prioridade: 2, ativo: true, deleted_at: null },
        { recurso_origem_id: "recurso-A", recurso_destino_id: "recurso-B", prioridade: 1, ativo: true, deleted_at: null },
        { recurso_origem_id: "recurso-A", recurso_destino_id: "recurso-inativo", prioridade: 3, ativo: false, deleted_at: null },
      ],
    });

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    const op10 = resultado.necessidades.find((n) => n.chaveTrabalho.includes("op-10"))!;
    expect(op10.recursoOriginalId).toBe("recurso-A");
    expect(op10.recursosCompativeisPorPrioridade).toEqual(["recurso-B", "recurso-C"]);
  });

  it("orçamento sem itens vira diagnóstico gracioso (necessidades=[]), nunca lança - nunca bloqueia a previsão comercial inteira", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso({ ...cfg, projetoItens: [] });

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    expect(resultado.necessidades).toEqual([]);
    expect(resultado.diagnosticos).toHaveLength(1);
    expect(resultado.diagnosticos[0].motivo).toMatch(/sem itens/);
  });

  it("operação sem recurso produtivo vinculado ainda lança OperacaoSemRecursoError - rigor de dado preservado, só a exigência de simulação foi removida", async () => {
    const cfg = cenarioBase();
    const detalhesSemRecurso = cfg.detalhes.map((d) => (d.id === "op-30" ? { ...d, recurso_produtivo_id: null } : d));
    const client = criarClienteFalso({ ...cfg, detalhes: detalhesSemRecurso });

    await expect(carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE)).rejects.toThrow(OperacaoSemRecursoError);
  });

  it("múltiplos projeto_itens combinados: cada item usa sua própria quantidadeAcumulada, chaves distintas", async () => {
    const cfg = cenarioBase();
    const item2 = { id: "item-2", produto_id: "produto-raiz", quantidade: 5 };
    const client = criarClienteFalso({
      ...cfg,
      projetoItens: [...cfg.projetoItens, item2],
      nosPorProdutoRaiz: {
        "produto-raiz": [noRaiz("produto-raiz", "bom-raiz", 2), noSubconjunto("bi-sub", "bom-sub", 2)],
      },
    });

    // A fake precisa refletir quantidade_acumulada proporcional a p_quantidade_raiz de verdade
    // (os 2 itens usam o MESMO produtoRaizId) - sobrescreve só o rpc.
    const clienteComQuantidadeReal = {
      ...client,
      rpc: (nome: string, params: Record<string, unknown>) => {
        if (nome === "lista_tecnica_nos_alcancaveis") {
          const quantidade = params.p_quantidade_raiz as number;
          return Promise.resolve({ data: [noRaiz("produto-raiz", "bom-raiz", quantidade), noSubconjunto("bi-sub", "bom-sub", quantidade)], error: null });
        }
        if (nome === "gerar_lista_tecnica_projeto") {
          return Promise.resolve({ data: { estado: "calculado", itens_analisados: [], materiais: [] }, error: null });
        }
        throw new Error(`RPC não mockada nesta fake: ${nome}`);
      },
    } as unknown as SupabaseClient;

    const resultado = await carregarNecessidadesOrcamentoNovo(clienteComQuantidadeReal, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    expect(resultado.necessidades).toHaveLength(8); // 4 por item (produto principal, subconjunto de fora) × 2 itens
    const op30Item1 = resultado.necessidades.find((n) => n.projetoItemId === "item-1" && n.chaveTrabalho.includes("op-30"))!;
    const op30Item2 = resultado.necessidades.find((n) => n.projetoItemId === "item-2" && n.chaveTrabalho.includes("op-30"))!;
    expect(op30Item1.horasNecessariasPadrao).toBeCloseTo((120 / 60) * 2); // 4h (quantidade=2)
    expect(op30Item2.horasNecessariasPadrao).toBeCloseTo((120 / 60) * 5); // 10h (quantidade=5)
    expect(op30Item1.chaveTrabalho).not.toBe(op30Item2.chaveTrabalho);
  });

  it("zero chamadas de escrita", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    // O próprio mock lança se insert/update/delete for chamado em
    // projeto_itens (ver criarClienteFalso) - a asserção real é a
    // promise resolver sem exceção.
    await expect(carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE)).resolves.toBeDefined();
  });
});

describe("carregarNecessidadesOrcamentoNovo - subconjunto considerado pronto por padrão", () => {
  it("nunca inclui operação de subconjunto (op-sub-10) nas necessidades do produto principal, mesmo com vínculo mestre cadastrado", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    expect(resultado.necessidades.some((n) => n.chaveTrabalho.includes("op-sub-10"))).toBe(false);
    expect(resultado.necessidades.map((n) => n.chaveTrabalho.split("::").pop())).toEqual(
      expect.arrayContaining(["op-10", "op-20", "op-22", "op-30"]),
    );
  });

  it("só mantém ocorrências com caminhoBomItemIds vazio (o próprio produtoRaizId da chamada) - nunca soma capacidade de um nível mais fundo", async () => {
    const cfg = cenarioBase();
    const client = criarClienteFalso(cfg);

    const resultado = await carregarNecessidadesOrcamentoNovo(client, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    const horasTotais = resultado.necessidades.reduce((soma, n) => soma + n.horasNecessariasPadrao, 0);
    // Só OP10(1h)+OP20(0.5h)+OP22(0.25h)+OP30(4h) × quantidade=2 - nunca as 3h de op-sub-10.
    expect(horasTotais).toBeCloseTo((60 / 60 + 30 / 60 + 15 / 60 + 120 / 60) * 2);
  });

  it("\"simulação própria\": chamar de novo com o produtoId do SUBCONJUNTO como produtoRaizId devolve só as OPs dele - nunca misturadas com as do pai, mesma chamada nunca traz as duas coisas juntas", async () => {
    const cfg = cenarioBase();
    // Roteiro do subconjunto tratado como raiz de uma chamada separada -
    // mesmo padrão de fixture, agora com produto-sub como raiz e
    // bom-sub como o bom resolvido do próprio nó raiz (profundidade=0).
    const clienteSimulacaoPropria = criarClienteFalso({
      ...cfg,
      projetoItens: [{ id: "item-1", produto_id: "produto-sub", quantidade: 2 }],
      nosPorProdutoRaiz: {
        "produto-sub": [noRaiz("produto-sub", "bom-sub", 2)],
      },
    });

    const resultado = await carregarNecessidadesOrcamentoNovo(clienteSimulacaoPropria, "empresa-1", "projeto-1", DISPONIVEL_A_PARTIR_DE);

    expect(resultado.necessidades).toHaveLength(1);
    expect(resultado.necessidades[0].chaveTrabalho).toContain("op-sub-10");
    expect(resultado.necessidades[0].horasNecessariasPadrao).toBeCloseTo((90 / 60) * 2); // 3h
    expect(resultado.necessidades[0].recursoOriginalId).toBe("recurso-A");
  });
});
