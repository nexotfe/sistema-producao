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
          disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao,
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
          disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao,
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
          disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao,
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
        disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao,
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
        disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao,
        cenarioAjustado: null,
      }),
    );

    await waitFor(() => expect(result.current.saidaAtual?.recursosQueDeterminamTermino.length).toBeGreaterThan(0));
    await waitFor(() => expect(Object.keys(result.current.nomesRecursos).length).toBeGreaterThan(0));
    expect(result.current.nomesRecursos["recurso-A"]).toBe("REC-A - Recurso A");
  });

  // CORREÇÃO (projeto de Industrialização, orçamento 260007, DEC-007):
  // disponibilidadeMaterialOrcamentoNovo é resolvida pelo CHAMADOR
  // (GeradorComparadorCenarios.tsx) - para Industrialização, o chamador
  // passa a Data Prevista de Aprovação do Pedido em vez de
  // janelaComercial.dataDisponibilidadeProducao. Este hook não sabe (nem
  // precisa saber) o que é "Industrialização" - só precisa usar o valor
  // recebido, tanto no "Cenário atual" quanto no fallback do "Cenário
  // ajustado" quando nenhuma negociação está configurada.
  it("usa disponibilidadeMaterialOrcamentoNovo (não janelaComercial.dataDisponibilidadeProducao) no cenário atual e no fallback do ajustado - calendário 100% produtivo, então antecipar a disponibilidade antecipa a entrega na mesma medida", async () => {
    instalarMockCompleto();
    // JANELA_VALIDA.dataDisponibilidadeProducao = "2026-09-01" - simula o
    // que o chamador resolveria para Industrialização (Data Prevista de
    // Aprovação do Pedido), 12 dias antes.
    const dataIndustrializacao = "2026-08-20";

    const { result, rerender } = renderHook(
      (props: { disponibilidadeMaterialOrcamentoNovo: string }) =>
        usePrevisaoComercialCapacidade({
          projetoId: PROJETO_NOVO_ID,
          janelaComercial: JANELA_VALIDA,
          dataSolicitadaCliente: "2026-09-10",
          janelaInicioGrade: JANELA_INICIO_GRADE,
          disponibilidadeMaterialOrcamentoNovo: props.disponibilidadeMaterialOrcamentoNovo,
          cenarioAjustado: { ...CENARIO_VAZIO },
        }),
      { initialProps: { disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao } },
    );

    await waitFor(() => expect(result.current.saidaAtual).not.toBeNull());
    await waitFor(() => expect(result.current.saidaAjustada).not.toBeNull());
    const primeiraEntregaComDisponibilidadeGenerica = result.current.saidaAtual!.primeiraEntregaPossivel;
    // CENARIO_VAZIO.disponibilidadeMaterialNegociada = null - o "ajustado"
    // cai no mesmo fallback do "atual" nesta rodada.
    expect(result.current.saidaAjustada!.primeiraEntregaPossivel).toBe(primeiraEntregaComDisponibilidadeGenerica);

    act(() => {
      rerender({ disponibilidadeMaterialOrcamentoNovo: dataIndustrializacao });
    });
    await waitFor(() =>
      expect(result.current.saidaAtual!.primeiraEntregaPossivel).not.toBe(primeiraEntregaComDisponibilidadeGenerica),
    );

    // Calendário do fixture é 100% produtivo (todos os dias da semana
    // true) - antecipar a disponibilidade em 12 dias corridos antecipa a
    // entrega na mesma medida, tanto no atual quanto no fallback do
    // ajustado (prova que o valor realmente entrou no cálculo, não só
    // que mudou "alguma coisa").
    expect(result.current.saidaAtual!.primeiraEntregaPossivel).toBe("2026-08-20");
    expect(result.current.saidaAjustada!.primeiraEntregaPossivel).toBe("2026-08-20");
  });

  it("uma negociação configurada ainda vence disponibilidadeMaterialOrcamentoNovo no cenário ajustado (comportamento inalterado para naturezas negociáveis)", async () => {
    instalarMockCompleto();
    // Precisa estar dentro da grade (>= JANELA_INICIO_GRADE = "2026-08-15") -
    // uma data anterior a isso seria clampada pela própria grade, o que
    // testaria o limite da grade, não o fallback que este teste cobre.
    const dataNegociada = "2026-08-17";

    const { result } = renderHook(() =>
      usePrevisaoComercialCapacidade({
        projetoId: PROJETO_NOVO_ID,
        janelaComercial: JANELA_VALIDA,
        dataSolicitadaCliente: "2026-09-10",
        janelaInicioGrade: JANELA_INICIO_GRADE,
        disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao,
        cenarioAjustado: { ...CENARIO_VAZIO, disponibilidadeMaterialNegociada: dataNegociada },
      }),
    );

    await waitFor(() => expect(result.current.saidaAjustada).not.toBeNull());
    expect(result.current.saidaAjustada!.primeiraEntregaPossivel).toBe(dataNegociada);
  });

  // CORREÇÃO (travamento real, orçamento 260007): reproduz o bug achado
  // em teste visual - "Calcular cenário atual" ficava desabilitado para
  // sempre. Causa raiz: o efeito de carregar a base chama
  // setCarregandoBase(true) de forma SÍNCRONA (antes do primeiro await),
  // mas retorna cedo (`if (!janelaComercial?.valida) return;`) sem NUNCA
  // desligar esse estado quando a janela fica inválida enquanto a
  // consulta anterior ainda está em voo - a consulta antiga, quando
  // resolver, também não desliga (protegida por `cancelado`, de
  // propósito, para nunca sobrescrever um resultado mais novo). Sem a
  // derivação (`carregandoBase = janelaComercial?.valida ? ... : false`),
  // o estado bruto ficava travado em `true` para sempre.
  it("não trava carregandoBase=true quando a janela fica inválida enquanto a consulta anterior ainda está em voo", async () => {
    instalarMockCompleto();
    const JANELA_INVALIDA = {
      valida: false,
      motivo: "disponibilidade_apos_prazo_interno",
      dataChegadaPrevista: "2026-08-25",
      dataDisponibilidadeProducao: "2026-09-01",
      prazoInterno: "2026-09-10",
    } as unknown as ResultadoJanelaComercial;

    const { result, rerender } = renderHook(
      (props: { janelaComercial: ResultadoJanelaComercial }) =>
        usePrevisaoComercialCapacidade({
          projetoId: PROJETO_NOVO_ID,
          janelaComercial: props.janelaComercial,
          dataSolicitadaCliente: "2026-09-10",
          janelaInicioGrade: JANELA_INICIO_GRADE,
          disponibilidadeMaterialOrcamentoNovo: JANELA_VALIDA.dataDisponibilidadeProducao,
          cenarioAjustado: null,
        }),
      { initialProps: { janelaComercial: JANELA_VALIDA as ResultadoJanelaComercial } },
    );

    // O efeito já chamou setCarregandoBase(true) de forma síncrona no
    // corpo de carregar(), antes do primeiro await - nenhum waitFor
    // necessário para observar isto, é o estado logo após o mount.
    expect(result.current.carregandoBase).toBe(true);

    // Premissa "editada" antes da consulta em voo terminar - a janela
    // recalculada fica inválida (mesmo efeito de uma sequência rápida de
    // edições na Data Prevista de Aprovação do Pedido).
    act(() => {
      rerender({ janelaComercial: JANELA_INVALIDA });
    });

    // Correção: carregandoBase precisa refletir a janela ATUAL
    // imediatamente, nunca ficar preso ao estado bruto da consulta
    // obsoleta ainda em voo.
    expect(result.current.carregandoBase).toBe(false);

    // Mesmo depois da consulta antiga (obsoleta) eventualmente resolver
    // em segundo plano, carregandoBase precisa continuar false - nunca
    // "ressuscitar" true por causa de uma resposta velha.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.carregandoBase).toBe(false);
    expect(result.current.erroBase).toBeNull();
  });
});
