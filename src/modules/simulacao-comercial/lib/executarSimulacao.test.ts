// executarSimulacao.ts nunca teve teste automatizado - achado da
// auditoria da correção de N+1 (Fase isolada de performance): a
// extração de montarItensSimulacao e o novo simularCapacidadeProjetoComBaseFixa
// (Entrega 3, Fase 3) só tinham sido validados por E2E real (bit-idêntico
// contra o projeto 260009), nunca por teste de regressão. Cobre:
// composição com base fixa (incluindo reaproveitamento de contexto de
// calendário), a transformação pura de itens, a equivalência entre o
// wrapper antigo (simularCapacidadeProjeto) e o caminho novo compartilhado
// (prepararBaseFixaMotor + simularCapacidadeProjetoComBaseFixa), e
// distribuição parcial/déficit total.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  criarClienteCalendarioFalso,
  criarClienteCalendarioFalsoComContagem,
  type FixtureCalendario,
} from "@/modules/calendario/lib/testHelpers/criarClienteCalendarioFalso";
import { carregarContextoCalendario } from "@/modules/calendario/lib/contextoCalendario";
import {
  montarItensSimulacao,
  simularCapacidadeProjeto,
  simularCapacidadeProjetoComBaseFixa,
} from "./executarSimulacao";
import { prepararBaseFixaMotor, type BaseFixaMotor, type CapacidadeRecurso } from "./prepararEntradasMotor";
import type { ItemResultadoMotor } from "./motorAvaliacaoSequencial";

const PADRAO_SEGUNDA_A_SEXTA = {
  segunda: true,
  terca: true,
  quarta: true,
  quinta: true,
  sexta: true,
  sabado: false,
  domingo: false,
};

function fixturePadrao(overrides: Partial<FixtureCalendario> = {}): FixtureCalendario {
  return {
    empresaId: "empresa-1",
    padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    empresa: { pais_codigo: "BR", uf_codigo: null, municipio_codigo: null },
    ...overrides,
  };
}

// 2026-11-02 (segunda) a 2026-11-06 (sexta) = 5 dias produtivos, sem
// feriados na fixture padrão - mesma janela já usada em
// prepararEntradasMotor.test.ts.
const JANELA_INICIO = "2026-11-02";
const JANELA_FIM = "2026-11-06";

function baseFixaSimples(overrides: Partial<BaseFixaMotor> = {}): BaseFixaMotor {
  return {
    operacoesOrdenadas: [
      { bomOperacaoId: "op-1", recursoOriginalId: "recurso-1", tempoEstimadoMinutos: 60, quantidade: 5 },
    ],
    recursoIds: ["recurso-1"],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: { "recurso-1": 8 },
    produtividadePorRecurso: { "recurso-1": 1 },
    comprometidoInicialPorRecurso: { "recurso-1": 0 },
    ...overrides,
  };
}

describe("simularCapacidadeProjetoComBaseFixa - composição com base fixa", () => {
  it("conta dias produtivos da janela, aplica calcularCapacidadeParaJanela e roda o Motor - resultado bate com o cálculo manual", async () => {
    const client = criarClienteCalendarioFalso(fixturePadrao());

    const resultado = await simularCapacidadeProjetoComBaseFixa(
      client,
      "empresa-1",
      baseFixaSimples(),
      JANELA_INICIO,
      JANELA_FIM,
    );

    // 5 dias produtivos × 8h = 40h de capacidade, 5h necessárias -> sem déficit.
    expect(resultado.itensPorOperacao).toHaveLength(1);
    const [item] = resultado.itensPorOperacao;
    expect(item.necessario).toBe(5);
    expect(item.deficit).toBe(0);
    expect(item.distribuicoes).toHaveLength(1);
    expect(item.distribuicoes[0]).toMatchObject({
      recursoId: "recurso-1",
      origem: "ORIGINAL",
      capacidadeBrutaPeriodo: 40,
      capacidadeEfetiva: 40,
      capacidadeDisponivelInicial: 40,
      horasPadraoAlocadas: 5,
    });
  });

  it("reaproveita um contexto de calendário já carregado (opcoes.contexto) - zero consultas novas de calendário", async () => {
    const { client, contador } = criarClienteCalendarioFalsoComContagem(fixturePadrao());

    // Contexto carregado uma vez, cobrindo a janela - mesma ideia do
    // calculador reverso reaproveitando o contexto para o preview normal.
    const contexto = await carregarContextoCalendario(client, "empresa-1", JANELA_INICIO, JANELA_FIM);
    const totalAposContexto = contador.total();
    expect(totalAposContexto).toBeGreaterThan(0);

    await simularCapacidadeProjetoComBaseFixa(client, "empresa-1", baseFixaSimples(), JANELA_INICIO, JANELA_FIM, {
      contexto,
    });

    expect(contador.total()).toBe(totalAposContexto);
  });

  it("sem opcoes.contexto, carrega o calendário sozinho (consultas novas disparadas)", async () => {
    const { client, contador } = criarClienteCalendarioFalsoComContagem(fixturePadrao());

    await simularCapacidadeProjetoComBaseFixa(client, "empresa-1", baseFixaSimples(), JANELA_INICIO, JANELA_FIM);

    expect(contador.total()).toBeGreaterThan(0);
  });

  it("distribuição parcial entre original e compatível - enriquecimento completo por recurso", async () => {
    const client = criarClienteCalendarioFalso(fixturePadrao());

    const base = baseFixaSimples({
      operacoesOrdenadas: [
        { bomOperacaoId: "op-1", recursoOriginalId: "original", tempoEstimadoMinutos: 60, quantidade: 40 },
      ],
      recursoIds: ["original", "compativel"],
      capacidadeDiariaPorRecurso: { original: 5, compativel: 3 },
      produtividadePorRecurso: { original: 1, compativel: 1 },
      comprometidoInicialPorRecurso: { original: 0, compativel: 0 },
      compatibilidades: { original: [{ recursoId: "compativel", prioridade: 1 }] },
    });

    const resultado = await simularCapacidadeProjetoComBaseFixa(client, "empresa-1", base, JANELA_INICIO, JANELA_FIM);

    // 5 dias produtivos: original 5×5=25h, compatível 5×3=15h = 40h exatos.
    const [item] = resultado.itensPorOperacao;
    expect(item.deficit).toBe(0);
    expect(item.distribuicoes).toHaveLength(2);

    expect(item.distribuicoes[0]).toMatchObject({
      recursoId: "original",
      origem: "ORIGINAL",
      capacidadeBrutaPeriodo: 25,
      capacidadeEfetiva: 25,
      capacidadeDisponivelInicial: 25,
      capacidadeDisponivelAntes: 25,
      horasPadraoAlocadas: 25,
      horasMaquinaEstimadas: 25,
      capacidadeDisponivelDepois: 0,
    });
    expect(item.distribuicoes[1]).toMatchObject({
      recursoId: "compativel",
      origem: "COMPATIBILIDADE",
      capacidadeBrutaPeriodo: 15,
      capacidadeEfetiva: 15,
      capacidadeDisponivelInicial: 15,
      capacidadeDisponivelAntes: 15,
      horasPadraoAlocadas: 15,
      horasMaquinaEstimadas: 15,
      capacidadeDisponivelDepois: 0,
    });
  });

  it("déficit total quando nenhum recurso comporta a operação - distribuicoes vazio, déficit = necessário inteiro", async () => {
    const client = criarClienteCalendarioFalso(fixturePadrao());

    const base = baseFixaSimples({
      operacoesOrdenadas: [
        { bomOperacaoId: "op-1", recursoOriginalId: "recurso-1", tempoEstimadoMinutos: 60, quantidade: 10 },
      ],
      capacidadeDiariaPorRecurso: { "recurso-1": 0 },
    });

    const resultado = await simularCapacidadeProjetoComBaseFixa(client, "empresa-1", base, JANELA_INICIO, JANELA_FIM);

    const [item] = resultado.itensPorOperacao;
    expect(item.distribuicoes).toEqual([]);
    expect(item.deficit).toBe(10);
    expect(item.necessario).toBe(10);
  });
});

describe("montarItensSimulacao - transformação pura dos itens (sem I/O)", () => {
  function capacidade(overrides: Partial<CapacidadeRecurso> = {}): CapacidadeRecurso {
    return {
      capacidadeBruta: 40,
      produtividade: 0.8,
      capacidadeEfetiva: 32,
      comprometidoInicial: 2,
      capacidadeDisponivelInicial: 30,
      ...overrides,
    };
  }

  it("enriquece uma distribuição única com a base de capacidade do recurso, incluindo horas de máquina derivadas", () => {
    const resultadosOperacoes: ItemResultadoMotor[] = [
      {
        bomOperacaoId: "op-1",
        recursoOriginalId: "recurso-1",
        tempoNecessarioHoras: 20,
        deficit: 0,
        distribuicoes: [
          {
            recursoId: "recurso-1",
            origem: "ORIGINAL",
            ordemConsideracao: 0,
            horasPadraoAlocadas: 20,
            capacidadeDisponivelAntes: 30,
            capacidadeDisponivelDepois: 10,
          },
        ],
      },
    ];

    const itens = montarItensSimulacao(resultadosOperacoes, { "recurso-1": capacidade() });

    expect(itens).toHaveLength(1);
    expect(itens[0]).toEqual({
      bomOperacaoId: "op-1",
      recursoOriginalId: "recurso-1",
      necessario: 20,
      deficit: 0,
      distribuicoes: [
        {
          recursoId: "recurso-1",
          origem: "ORIGINAL",
          ordemConsideracao: 0,
          capacidadeBrutaPeriodo: 40,
          produtividadeConsiderada: 0.8,
          capacidadeEfetiva: 32,
          comprometidoInicial: 2,
          capacidadeDisponivelInicial: 30,
          capacidadeDisponivelAntes: 30,
          horasPadraoAlocadas: 20,
          horasMaquinaEstimadas: 25, // 20 / 0.8
          capacidadeDisponivelDepois: 10,
        },
      ],
    });
  });

  it("déficit total (distribuicoes vazio) passa direto, sem tentar enriquecer nada", () => {
    const resultadosOperacoes: ItemResultadoMotor[] = [
      { bomOperacaoId: "op-1", recursoOriginalId: "recurso-1", tempoNecessarioHoras: 15, deficit: 15, distribuicoes: [] },
    ];

    const itens = montarItensSimulacao(resultadosOperacoes, {});

    expect(itens[0].distribuicoes).toEqual([]);
    expect(itens[0].deficit).toBe(15);
  });

  it("lança erro interno quando a capacidade do recurso da distribuição não foi preparada (inconsistência entre preparação e resultado do Motor)", () => {
    const resultadosOperacoes: ItemResultadoMotor[] = [
      {
        bomOperacaoId: "op-1",
        recursoOriginalId: "recurso-1",
        tempoNecessarioHoras: 10,
        deficit: 0,
        distribuicoes: [
          {
            recursoId: "recurso-desconhecido",
            origem: "ORIGINAL",
            ordemConsideracao: 0,
            horasPadraoAlocadas: 10,
            capacidadeDisponivelAntes: 10,
            capacidadeDisponivelDepois: 0,
          },
        ],
      },
    ];

    expect(() => montarItensSimulacao(resultadosOperacoes, {})).toThrow(/não preparada/);
  });
});

describe("simularCapacidadeProjeto (wrapper antigo) - equivalência com o caminho novo compartilhado", () => {
  type RecursoRow = { id: string; capacidade_horas_dia: number | null };
  type ProjetoItemRow = { id: string; projeto_id: string; produto_id: string; quantidade: number; ativo: boolean; deleted_at: string | null; created_at: string };
  type BomRow = { id: string; produto_id: string; status: string; created_at: string; ativo: boolean; deleted_at: string | null };
  type OperacaoRow = { id: string; bom_id: string; ordem: number; tempo_estimado_minutos: number; recurso_produtivo_id: string | null; ativo: boolean; deleted_at: string | null };

  function tabelaGenerica(linhas: Record<string, unknown>[]) {
    return function builder() {
      const filtrosEq: Record<string, unknown> = {};
      let filtroIn: { coluna: string; valores: unknown[] } | null = null;
      const ordenacao: { coluna: string; ascending: boolean }[] = [];

      const b = {
        select() {
          return b;
        },
        eq(coluna: string, valor: unknown) {
          filtrosEq[coluna] = valor;
          return b;
        },
        is(coluna: string, valor: unknown) {
          filtrosEq[coluna] = valor;
          return b;
        },
        in(coluna: string, valores: unknown[]) {
          filtroIn = { coluna, valores };
          return b;
        },
        order(coluna: string, opcoes?: { ascending?: boolean }) {
          ordenacao.push({ coluna, ascending: opcoes?.ascending ?? true });
          return b;
        },
        then(resolve: (valor: { data: unknown[]; error: null }) => void) {
          let filtradas = linhas.filter((linha) => {
            for (const [coluna, valor] of Object.entries(filtrosEq)) {
              if (linha[coluna] !== valor) return false;
            }
            if (filtroIn && !filtroIn.valores.includes(linha[filtroIn.coluna])) return false;
            return true;
          });
          if (ordenacao.length > 0) {
            filtradas = [...filtradas].sort((a, c) => {
              for (const { coluna, ascending } of ordenacao) {
                const valorA = String(a[coluna] ?? "");
                const valorC = String(c[coluna] ?? "");
                if (valorA !== valorC) return ascending ? (valorA < valorC ? -1 : 1) : valorA < valorC ? 1 : -1;
              }
              return 0;
            });
          }
          resolve({ data: filtradas, error: null });
        },
      };

      return b;
    };
  }

  function criarClienteRoteiroECalendario(fixtureCal: FixtureCalendario): SupabaseClient {
    const projetoItens: ProjetoItemRow[] = [
      { id: "item-1", projeto_id: "projeto-1", produto_id: "produto-1", quantidade: 3, ativo: true, deleted_at: null, created_at: "2026-01-01" },
    ];
    const boms: BomRow[] = [{ id: "bom-1", produto_id: "produto-1", status: "ativo", created_at: "2026-01-01", ativo: true, deleted_at: null }];
    const operacoes: OperacaoRow[] = [
      { id: "op-1", bom_id: "bom-1", ordem: 10, tempo_estimado_minutos: 60, recurso_produtivo_id: "recurso-1", ativo: true, deleted_at: null },
    ];
    const recursos: RecursoRow[] = [{ id: "recurso-1", capacidade_horas_dia: 8 }];

    return {
      from(tabela: string) {
        switch (tabela) {
          case "projeto_itens":
            return tabelaGenerica(projetoItens as unknown as Record<string, unknown>[])();
          case "boms":
            return tabelaGenerica(boms as unknown as Record<string, unknown>[])();
          case "bom_operacoes":
            return tabelaGenerica(operacoes as unknown as Record<string, unknown>[])();
          case "bom_itens":
            return tabelaGenerica([])();
          case "recursos_produtivos":
            return tabelaGenerica(recursos as unknown as Record<string, unknown>[])();
          case "recurso_produtivo_compatibilidades":
            return tabelaGenerica([])();
          case "calendario_operacional_empresa":
          case "empresas":
          case "calendario_oficial_feriados":
          case "calendario_empresa_eventos": {
            const calBuilder = (
              criarClienteCalendarioFalso(fixtureCal).from(tabela) as unknown as {
                select: () => unknown;
              }
            );
            return calBuilder;
          }
          default:
            throw new Error(`Tabela não suportada no cliente falso: ${tabela}`);
        }
      },
      rpc(nome: string, args: Record<string, unknown>) {
        if (nome === "gerar_lista_tecnica_projeto") {
          return Promise.resolve({
            data: { estado: "calculado", mensagem: null, itens_analisados: [], materiais: [] },
            error: null,
          });
        }
        if (nome === "calcular_produtividade_efetiva") {
          return Promise.resolve({ data: 0.9, error: null });
        }
        if (nome === "calcular_comprometido_v2") {
          return Promise.resolve({ data: 0, error: null });
        }
        throw new Error(`RPC não suportada no cliente falso: ${nome} (${JSON.stringify(args)})`);
      },
    } as unknown as SupabaseClient;
  }

  it("simularCapacidadeProjeto produz exatamente o mesmo resultado que prepararBaseFixaMotor + simularCapacidadeProjetoComBaseFixa", async () => {
    const clienteWrapperAntigo = criarClienteRoteiroECalendario(fixturePadrao());
    const clienteCaminhoNovo = criarClienteRoteiroECalendario(fixturePadrao());

    const resultadoWrapperAntigo = await simularCapacidadeProjeto(
      clienteWrapperAntigo,
      "empresa-1",
      "projeto-1",
      JANELA_INICIO,
      JANELA_FIM,
    );

    const baseFixa = await prepararBaseFixaMotor(clienteCaminhoNovo, "empresa-1", "projeto-1");
    const resultadoCaminhoNovo = await simularCapacidadeProjetoComBaseFixa(
      clienteCaminhoNovo,
      "empresa-1",
      baseFixa,
      JANELA_INICIO,
      JANELA_FIM,
    );

    expect(resultadoWrapperAntigo).toEqual(resultadoCaminhoNovo);
    // Confirma que o resultado não é trivialmente vazio - a equivalência
    // só é uma prova de verdade se os dois caminhos processaram algo.
    expect(resultadoWrapperAntigo.itensPorOperacao).toHaveLength(1);
    expect(resultadoWrapperAntigo.itensPorOperacao[0].necessario).toBe(3); // quantidade 3 × 60min = 3h
  });
});
