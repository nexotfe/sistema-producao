/* @vitest-environment jsdom */
// Cobre exatamente os requisitos do incremento de integração (DEC-007):
// base carregada apenas uma vez, mudar alternativas não gera nova
// consulta, cenário atual/ajustado usam a mesma base, e zero escrita.
// Mesmo padrão de mock de useOrcamento.test.ts (jsdom + renderHook +
// vi.mock("@/lib/supabaseClient")) e da tabela filtrável de
// carregarBasePrevisaoComercial.test.ts, combinados.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() }, rpc: vi.fn() },
}));

import { supabase } from "@/lib/supabaseClient";
import { usePrevisaoComercialCapacidade } from "./usePrevisaoComercialCapacidade";
import type { ResultadoJanelaComercial } from "@/modules/simulacao-comercial/lib/prepararJanelaComercial";

const supabaseMock = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
};

/** Mesmo mock genérico de tabela filtrável dos testes de lib - respeita eq/neq/in/is/order/maybeSingle/single de verdade; insert/update/delete/upsert sempre lançam. */
function tabelaFiltravel(linhas: readonly Record<string, unknown>[]) {
  const filtros: ((linha: Record<string, unknown>) => boolean)[] = [];
  let single = false;
  const builder = {
    select: () => builder,
    eq: (coluna: string, valor: unknown) => {
      filtros.push((linha) => linha[coluna] === valor);
      return builder;
    },
    neq: (coluna: string, valor: unknown) => {
      filtros.push((linha) => linha[coluna] !== valor);
      return builder;
    },
    in: (coluna: string, valores: readonly unknown[]) => {
      filtros.push((linha) => valores.includes(linha[coluna]));
      return builder;
    },
    is: (coluna: string, valor: null) => {
      filtros.push((linha) => linha[coluna] === valor);
      return builder;
    },
    order: () => builder,
    maybeSingle: () => {
      single = true;
      return builder;
    },
    single: () => {
      single = true;
      return builder;
    },
    insert: () => {
      throw new Error("Mock não implementa insert - usePrevisaoComercialCapacidade é só leitura.");
    },
    update: () => {
      throw new Error("Mock não implementa update - usePrevisaoComercialCapacidade é só leitura.");
    },
    upsert: () => {
      throw new Error("Mock não implementa upsert - usePrevisaoComercialCapacidade é só leitura.");
    },
    delete: () => {
      throw new Error("Mock não implementa delete - usePrevisaoComercialCapacidade é só leitura.");
    },
    then: (resolve: (v: unknown) => unknown) => {
      const resultado = linhas.filter((linha) => filtros.every((f) => f(linha)));
      return Promise.resolve(resolve({ data: single ? (resultado[0] ?? null) : resultado, error: null }));
    },
  };
  return builder;
}

const EMPRESA_ID = "empresa-1";
const PROJETO_NOVO_ID = "projeto-novo";

/**
 * Orçamento novo: correção deste incremento - calculado a partir do
 * roteiro atual (projeto_itens -> BOM -> operação), NUNCA de
 * simulacoes_comerciais/simulacao_comercial_itens (essa fonte é
 * exclusiva de projetos CONFIRMADOS, "proj-confirmado" abaixo). 1
 * operação simples (sem subconjunto), tempo_estimado_minutos=360 (6h)
 * para bater com o "necessario: 6" usado antes desta correção.
 */
function instalarMockCompleto() {
  const contagemPorTabela = new Map<string, number>();
  const contagemPorRpc = new Map<string, number>();

  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

  const tabelas: Record<string, Record<string, unknown>[]> = {
    usuarios: [{ id: "user-1", empresa_id: EMPRESA_ID }],
    projetos: [{ id: "proj-confirmado", empresa_id: EMPRESA_ID, situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
    historico_situacao_comercial: [{ empresa_id: EMPRESA_ID, projeto_id: "proj-confirmado", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
    simulacoes_comerciais: [{ id: "sim-confirmado", empresa_id: EMPRESA_ID, projeto_id: "proj-confirmado", vigente: true }],
    simulacao_comercial_itens: [{ id: "item-confirmado", empresa_id: EMPRESA_ID, simulacao_comercial_id: "sim-confirmado", necessario: 4, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-A" }],
    simulacao_comercial_item_distribuicoes: [],
    recurso_produtivo_compatibilidades: [],
    projeto_itens: [{ id: "item-novo", empresa_id: EMPRESA_ID, projeto_id: PROJETO_NOVO_ID, produto_id: "produto-novo", quantidade: 1, ativo: true, deleted_at: null }],
    bom_operacao_dependencias_subconjunto: [],
    // codigo/nome (carregarNomesDiagnostico) e capacidade_horas_dia (carregarCapacidadesNormaisPrevisao) no mesmo fixture - o mock não projeta select().
    recursos_produtivos: [{ id: "recurso-A", capacidade_horas_dia: 8, codigo: "REC-A", nome: "Recurso A" }],
    // Calendário (Etapa A): todos os dias produtivos e pais_codigo null
    // (calendario_oficial_feriados nunca é consultada nesse caso) - este
    // hook não é sobre calendário, então o fixture não deve interferir
    // nas datas calculadas pelos outros testes já existentes aqui.
    calendario_operacional_empresa: [{ empresa_id: EMPRESA_ID, segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: true, domingo: true }],
    empresas: [{ id: EMPRESA_ID, pais_codigo: null, uf_codigo: null, municipio_codigo: null }],
  };

  supabaseMock.from.mockImplementation((tabela: string) => {
    contagemPorTabela.set(tabela, (contagemPorTabela.get(tabela) ?? 0) + 1);

    if (tabela === "bom_operacoes") {
      // Mesma simplificação de carregarBaseCenarios.test.ts: dispatch pelo
      // nome das colunas pedidas, sem filtrar eq/in de verdade.
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
          const dados = ehDetalhe
            ? [{ id: "op-novo", tempo_estimado_minutos: 360, recurso_produtivo_id: "recurso-A" }]
            : [{ id: "op-novo", bom_id: "bom-novo", ordem: 10, ativo: true, deleted_at: null }];
          return Promise.resolve(resolve({ data: dados, error: null }));
        },
      };
      return builder;
    }

    if (tabela === "calendario_empresa_eventos") {
      // Sempre 0 linhas - suporta a cadeia gte/lte/order/range que
      // carregarContextoCalendario usa (tabelaFiltravel não implementa
      // esses métodos, exclusivos das tabelas de calendário).
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        range: () => builder,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
      };
      return builder;
    }

    const linhas = tabelas[tabela];
    if (!linhas) {
      throw new Error(`Tabela inesperada neste mock: ${tabela}`);
    }
    return tabelaFiltravel(linhas);
  });

  supabaseMock.rpc.mockImplementation((nome: string, params: Record<string, unknown>) => {
    contagemPorRpc.set(nome, (contagemPorRpc.get(nome) ?? 0) + 1);
    if (nome === "calcular_produtividade_efetiva") {
      return Promise.resolve({ data: params.p_recurso_id === "recurso-A" ? 1 : null, error: null });
    }
    if (nome === "gerar_lista_tecnica_projeto") {
      return Promise.resolve({ data: { estado: "calculado", itens_analisados: [], materiais: [] }, error: null });
    }
    if (nome === "lista_tecnica_nos_alcancaveis") {
      return Promise.resolve({
        data: [
          {
            produto_id: "produto-novo",
            caminho: ["produto-novo"],
            caminho_bom_item_ids: [],
            profundidade: 0,
            quantidade_acumulada: 1,
            bom_resolvido_id: "bom-novo",
            tem_bom: true,
            ciclo: false,
            produto_ausente: false,
            produto_excluido: false,
            produto_inativo: false,
            tipo_item: "acabado",
          },
        ],
        error: null,
      });
    }
    throw new Error(`Mock não implementa a RPC "${nome}" - nunca deveria ser chamada (ex.: calcular_comprometido_v2 contaria capacidade 2 vezes).`);
  });

  return {
    contagemPorTabela,
    totalChamadas: () =>
      [...contagemPorTabela.values()].reduce((s, n) => s + n, 0) + [...contagemPorRpc.values()].reduce((s, n) => s + n, 0),
  };
}

const JANELA_VALIDA: ResultadoJanelaComercial = {
  valida: true,
  dataChegadaPrevista: "2026-08-25",
  dataDisponibilidadeProducao: "2026-09-01",
  prazoInterno: "2026-09-10",
  janelaInicio: "2026-09-01",
  janelaFim: "2026-09-10",
};
// Aprovação prevista - anterior à disponibilidade original (2026-09-01),
// para a grade cobrir uma eventual negociação de material antecipada.
const JANELA_INICIO_GRADE = "2026-08-15";

type CenarioAjustadoTeste = {
  capacidadeExtraAutorizada: never[];
  temporariosPorPrioridade: never[];
  disponibilidadeMaterialNegociada: string | null;
  contratacoes: never[];
  contratacaoNegociacaoMaterial: null;
};
const CENARIO_VAZIO: CenarioAjustadoTeste = {
  capacidadeExtraAutorizada: [],
  temporariosPorPrioridade: [],
  disponibilidadeMaterialNegociada: null,
  contratacoes: [],
  contratacaoNegociacaoMaterial: null,
};

describe("usePrevisaoComercialCapacidade", () => {
  it("carrega a base apenas uma vez - não refaz consulta quando só cenarioAjustado muda", async () => {
    const mock = instalarMockCompleto();

    const { result, rerender } = renderHook(
      (props: { cenarioAjustado: CenarioAjustadoTeste | null }) =>
        usePrevisaoComercialCapacidade({
          projetoId: PROJETO_NOVO_ID,
          janelaComercial: JANELA_VALIDA,
          dataSolicitadaCliente: "2026-09-10",
          janelaInicioGrade: JANELA_INICIO_GRADE,
          cenarioAjustado: props.cenarioAjustado,
        }),
      { initialProps: { cenarioAjustado: null as CenarioAjustadoTeste | null } },
    );

    await waitFor(() => expect(result.current.saidaAtual).not.toBeNull());
    const baseAposCarregar = result.current.base;
    expect(baseAposCarregar).not.toBeNull();
    const totalChamadasAposCarregar = mock.totalChamadas();
    expect(totalChamadasAposCarregar).toBeGreaterThan(0);

    act(() => {
      rerender({ cenarioAjustado: { ...CENARIO_VAZIO } });
    });

    await waitFor(() => expect(result.current.saidaAjustada).not.toBeNull());

    expect(mock.totalChamadas()).toBe(totalChamadasAposCarregar);
  });

  it("mudar alternativas recalcula saidaAjustada em memória, sem gerar nenhuma nova consulta ao Supabase", async () => {
    const mock = instalarMockCompleto();

    const { result, rerender } = renderHook(
      (props: { cenarioAjustado: CenarioAjustadoTeste | null }) =>
        usePrevisaoComercialCapacidade({
          projetoId: PROJETO_NOVO_ID,
          janelaComercial: JANELA_VALIDA,
          dataSolicitadaCliente: "2026-09-10",
          janelaInicioGrade: JANELA_INICIO_GRADE,
          cenarioAjustado: props.cenarioAjustado,
        }),
      { initialProps: { cenarioAjustado: null as CenarioAjustadoTeste | null } },
    );

    await waitFor(() => expect(result.current.saidaAtual).not.toBeNull());
    expect(result.current.saidaAjustada).toBeNull(); // nenhuma alternativa configurada ainda

    const totalAntes = mock.totalChamadas();

    act(() => {
      rerender({ cenarioAjustado: { ...CENARIO_VAZIO } });
    });
    await waitFor(() => expect(result.current.saidaAjustada).not.toBeNull());

    act(() => {
      rerender({ cenarioAjustado: null });
    });
    await waitFor(() => expect(result.current.saidaAjustada).toBeNull());

    expect(mock.totalChamadas()).toBe(totalAntes);
  });

  it("cenário atual e cenário ajustado são sempre derivados da MESMA referência de base", async () => {
    const mock = instalarMockCompleto();
    void mock;

    const { result, rerender } = renderHook(
      (props: { cenarioAjustado: CenarioAjustadoTeste | null }) =>
        usePrevisaoComercialCapacidade({
          projetoId: PROJETO_NOVO_ID,
          janelaComercial: JANELA_VALIDA,
          dataSolicitadaCliente: "2026-09-10",
          janelaInicioGrade: JANELA_INICIO_GRADE,
          cenarioAjustado: props.cenarioAjustado,
        }),
      { initialProps: { cenarioAjustado: null as CenarioAjustadoTeste | null } },
    );

    await waitFor(() => expect(result.current.saidaAtual).not.toBeNull());
    const baseAntes = result.current.base;

    act(() => {
      rerender({ cenarioAjustado: { ...CENARIO_VAZIO } });
    });
    await waitFor(() => expect(result.current.saidaAjustada).not.toBeNull());

    expect(result.current.base).toBe(baseAntes); // mesma referência de objeto - nunca uma segunda base
    expect(result.current.saidaAtual?.dataSolicitadaCliente).toBe(result.current.saidaAjustada?.dataSolicitadaCliente);
  });

  it("zero chamadas de escrita: todo o ciclo (base + nomes de recursos) usa só leitura", async () => {
    instalarMockCompleto();

    const { result } = renderHook(() =>
      usePrevisaoComercialCapacidade({
        projetoId: PROJETO_NOVO_ID,
        janelaComercial: JANELA_VALIDA,
        dataSolicitadaCliente: "2026-09-10",
        janelaInicioGrade: JANELA_INICIO_GRADE,
        cenarioAjustado: null,
      }),
    );

    // O próprio mock lança se insert/update/upsert/delete for chamado - a
    // asserção real é o hook terminar de carregar sem exceção.
    await waitFor(() => expect(result.current.saidaAtual).not.toBeNull());
    expect(result.current.erroBase).toBeNull();
  });

  it("resolve nomes dos recursos determinantes (código - nome) - fallback para o ID é responsabilidade de quem exibe, não deste hook", async () => {
    instalarMockCompleto();

    const { result } = renderHook(() =>
      usePrevisaoComercialCapacidade({
        projetoId: PROJETO_NOVO_ID,
        janelaComercial: JANELA_VALIDA,
        dataSolicitadaCliente: "2026-09-10",
        janelaInicioGrade: JANELA_INICIO_GRADE,
        cenarioAjustado: null,
      }),
    );

    await waitFor(() => expect(result.current.saidaAtual?.recursosQueDeterminamTermino.length).toBeGreaterThan(0));
    await waitFor(() => expect(Object.keys(result.current.nomesRecursos).length).toBeGreaterThan(0));
    expect(result.current.nomesRecursos["recurso-A"]).toBe("REC-A - Recurso A");
  });
});
