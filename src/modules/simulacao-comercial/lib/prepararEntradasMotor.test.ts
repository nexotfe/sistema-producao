// Fase 0 da Entrega 3 (Calculador Reverso): prepararEntradasMotor.ts
// nunca teve teste automatizado - achado registrado no PAD-008 §19.4 na
// Entrega 2 e carregado como pendência até esta rodada. Cliente falso
// cobre todas as tabelas/RPCs que este módulo consulta (roteiro,
// recursos, compatibilidades, calendário) - combina o padrão já
// estabelecido em coletarEstruturaBom.test.ts com o de
// criarClienteCalendarioFalso.ts, mais suporte a `.single()` e `.rpc()`,
// que nenhum dos dois precisava até agora.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepararEntradasMotor } from "./prepararEntradasMotor";
import {
  ProjetoSemItensError,
  RoteiroNaoEncontradoError,
  RecursoSemCapacidadeCadastradaError,
} from "./errors";

type RecursoRow = { id: string; capacidade_horas_dia: number | null };
type CompatibilidadeRow = {
  recurso_origem_id: string;
  recurso_destino_id: string;
  prioridade: number;
  ativo: boolean;
  deleted_at: string | null;
};
type ProjetoItemRow = { id: string; projeto_id: string; produto_id: string; quantidade: number; ativo: boolean; deleted_at: string | null; created_at: string };
type BomRow = { id: string; produto_id: string; status: string; created_at: string; deleted_at: string | null };
type OperacaoRow = {
  id: string;
  bom_id: string;
  ordem: number;
  tempo_estimado_minutos: number;
  recurso_produtivo_id: string | null;
  ativo: boolean;
  deleted_at: string | null;
};

type Base = {
  empresaId: string;
  projetoItens: ProjetoItemRow[];
  boms: BomRow[];
  operacoes: OperacaoRow[];
  itens: { bom_id: string; quantidade: number; componente_produto_id: string; componente_tipo: string; ativo: boolean; deleted_at: string | null; ordem: number }[];
  recursos: RecursoRow[];
  compatibilidades: CompatibilidadeRow[];
  produtividadePorRecurso: Record<string, number | null>;
  comprometidoPorRecurso: Record<string, number>;
  diasProdutivosNaJanela: number;
  // Falha proposital de calendário, para testar propagação de erro sem
  // reimplementar toda a regra de precedência aqui (já testada à
  // exaustão em contextoCalendario.test.ts).
  calendarioIndisponivel?: boolean;
  // Correção de N+1: erro injetado em calcular_produtividade_efetiva
  // para um recurso específico, com atraso opcional - usado para provar
  // que, mesmo com as chamadas em paralelo, o erro relatado é sempre o
  // do PRIMEIRO recurso em `recursoIds` (ordem determinística), nunca o
  // que "chegou primeiro" da rede.
  errosProdutividade?: { recursoId: string; mensagem: string; atrasoMs?: number }[];
  // Correção de N+1: falha da CONSULTA em lote em si (erro de
  // infraestrutura - rede, permissão, etc.) - diferente de "recurso
  // realmente sem capacidade cadastrada" (linha ausente ou nula no
  // resultado). Usado para provar que os dois casos não são confundidos:
  // um vira Error genérico, o outro continua RecursoSemCapacidadeCadastradaError.
  erroConsultaRecursosEmLote?: string;
};

function tabelaGenerica(linhas: Record<string, unknown>[]) {
  return function builder() {
    const filtrosEq: Record<string, unknown> = {};
    const faixas: Record<string, { gte?: unknown; lte?: unknown }> = {};
    let filtroIn: { coluna: string; valores: unknown[] } | null = null;
    let paginacao: { inicio: number; fim: number } | null = null;
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
      gte(coluna: string, valor: unknown) {
        faixas[coluna] = { ...(faixas[coluna] ?? {}), gte: valor };
        return b;
      },
      lte(coluna: string, valor: unknown) {
        faixas[coluna] = { ...(faixas[coluna] ?? {}), lte: valor };
        return b;
      },
      range(inicio: number, fim: number) {
        paginacao = { inicio, fim };
        return b;
      },
      order(coluna: string, opcoes?: { ascending?: boolean }) {
        ordenacao.push({ coluna, ascending: opcoes?.ascending ?? true });
        return b;
      },
      async single() {
        const filtradas = aplicarFiltros();
        if (filtradas.length !== 1) {
          return { data: null, error: { message: "not found" } };
        }
        return { data: filtradas[0], error: null };
      },
      async maybeSingle() {
        const filtradas = aplicarFiltros();
        return { data: filtradas[0] ?? null, error: null };
      },
      then(resolve: (valor: { data: unknown[]; error: null }) => void) {
        resolve({ data: aplicarFiltros(), error: null });
      },
    };

    function dentroDaFaixa(valor: unknown, faixa: { gte?: unknown; lte?: unknown } | undefined): boolean {
      if (!faixa) return true;
      if (faixa.gte !== undefined && (valor as string) < (faixa.gte as string)) return false;
      if (faixa.lte !== undefined && (valor as string) > (faixa.lte as string)) return false;
      return true;
    }

    function aplicarFiltros() {
      let filtradas = linhas.filter((linha) => {
        for (const [coluna, valor] of Object.entries(filtrosEq)) {
          if (linha[coluna] !== valor) return false;
        }
        if (filtroIn && !filtroIn.valores.includes(linha[filtroIn.coluna])) return false;
        for (const [coluna, faixa] of Object.entries(faixas)) {
          if (!dentroDaFaixa(linha[coluna], faixa)) return false;
        }
        return true;
      });
      if (ordenacao.length > 0) {
        filtradas = [...filtradas].sort((a, b2) => {
          for (const { coluna, ascending } of ordenacao) {
            const valorA = String(a[coluna] ?? "");
            const valorB = String(b2[coluna] ?? "");
            if (valorA !== valorB) return ascending ? (valorA < valorB ? -1 : 1) : valorA < valorB ? 1 : -1;
          }
          return 0;
        });
      }
      if (paginacao) {
        filtradas = filtradas.slice(paginacao.inicio, paginacao.fim + 1);
      }
      return filtradas;
    }

    return b;
  };
}

function criarClienteFalso(base: Base): SupabaseClient {
  const padraoSegundaASexta = {
    segunda: true,
    terca: true,
    quarta: true,
    quinta: true,
    sexta: true,
    sabado: false,
    domingo: false,
  };

  return {
    from(tabela: string) {
      switch (tabela) {
        case "projeto_itens":
          return tabelaGenerica(base.projetoItens as unknown as Record<string, unknown>[])();
        case "boms":
          return tabelaGenerica(base.boms as unknown as Record<string, unknown>[])();
        case "bom_operacoes":
          return tabelaGenerica(base.operacoes as unknown as Record<string, unknown>[])();
        case "bom_itens":
          return tabelaGenerica(base.itens as unknown as Record<string, unknown>[])();
        case "recursos_produtivos":
          if (base.erroConsultaRecursosEmLote) {
            const erroMensagem = base.erroConsultaRecursosEmLote;
            const builderComErro = {
              select() {
                return builderComErro;
              },
              in() {
                return builderComErro;
              },
              then(resolve: (valor: { data: null; error: { message: string } }) => void) {
                resolve({ data: null, error: { message: erroMensagem } });
              },
            };
            return builderComErro;
          }
          return tabelaGenerica(base.recursos as unknown as Record<string, unknown>[])();
        case "recurso_produtivo_compatibilidades":
          return tabelaGenerica(base.compatibilidades as unknown as Record<string, unknown>[])();
        case "calendario_operacional_empresa":
          return tabelaGenerica(
            base.calendarioIndisponivel ? [] : [{ empresa_id: base.empresaId, ...padraoSegundaASexta }],
          )();
        case "empresas":
          return tabelaGenerica([{ id: base.empresaId, pais_codigo: null, uf_codigo: null, municipio_codigo: null }])();
        case "calendario_oficial_feriados":
          return tabelaGenerica([])();
        case "calendario_empresa_eventos":
          return tabelaGenerica([])();
        default:
          throw new Error(`Tabela não suportada no cliente falso: ${tabela}`);
      }
    },
    rpc(nome: string, args: Record<string, unknown>) {
      if (nome === "calcular_produtividade_efetiva") {
        const recursoId = args.p_recurso_id as string;
        const erro = base.errosProdutividade?.find((e) => e.recursoId === recursoId);
        if (erro) {
          const resultado = { data: null, error: { message: erro.mensagem } };
          if (erro.atrasoMs) {
            return new Promise((resolve) => setTimeout(() => resolve(resultado), erro.atrasoMs));
          }
          return Promise.resolve(resultado);
        }
        const valor = base.produtividadePorRecurso[recursoId];
        return Promise.resolve({ data: valor === undefined ? null : valor, error: null });
      }
      if (nome === "calcular_comprometido_v2") {
        const recursoId = args.p_recurso_produtivo_id as string;
        return Promise.resolve({ data: base.comprometidoPorRecurso[recursoId] ?? 0, error: null });
      }
      throw new Error(`RPC não suportada no cliente falso: ${nome}`);
    },
  } as unknown as SupabaseClient;
}

// Correção de N+1: instrumenta o cliente falso para contar quantas vezes
// cada tabela/RPC é efetivamente chamada, e com quais valores em `.in()`
// - usada apenas pelos testes desta correção, não pelos 10 testes
// pré-existentes acima (que continuam usando criarClienteFalso puro).
function criarClienteFalsoComContagem(base: Base): {
  client: SupabaseClient;
  contagem: {
    porTabela: Record<string, number>;
    porRpc: Record<string, number>;
    chamadasIn: { tabela: string; coluna: string; valores: unknown[] }[];
  };
} {
  const clienteBase = criarClienteFalso(base) as unknown as {
    from: (tabela: string) => Record<string, (...args: unknown[]) => unknown>;
    rpc: (nome: string, args: Record<string, unknown>) => unknown;
  };
  const contagem = {
    porTabela: {} as Record<string, number>,
    porRpc: {} as Record<string, number>,
    chamadasIn: [] as { tabela: string; coluna: string; valores: unknown[] }[],
  };

  const client = {
    from(tabela: string) {
      contagem.porTabela[tabela] = (contagem.porTabela[tabela] ?? 0) + 1;
      const builder = clienteBase.from(tabela);
      const inOriginal = builder.in.bind(builder);
      builder.in = (coluna: unknown, valores: unknown) => {
        contagem.chamadasIn.push({ tabela, coluna: coluna as string, valores: [...(valores as unknown[])] });
        return inOriginal(coluna, valores);
      };
      return builder;
    },
    rpc(nome: string, args: Record<string, unknown>) {
      contagem.porRpc[nome] = (contagem.porRpc[nome] ?? 0) + 1;
      return clienteBase.rpc(nome, args);
    },
  } as unknown as SupabaseClient;

  return { client, contagem };
}

function baseMinima(overrides: Partial<Base> = {}): Base {
  return {
    empresaId: "empresa-1",
    projetoItens: [
      { id: "item-1", projeto_id: "projeto-1", produto_id: "produto-1", quantidade: 2, ativo: true, deleted_at: null, created_at: "2026-01-01" },
    ],
    boms: [{ id: "bom-1", produto_id: "produto-1", status: "ativo", created_at: "2026-01-01", deleted_at: null }],
    operacoes: [
      { id: "op-1", bom_id: "bom-1", ordem: 10, tempo_estimado_minutos: 60, recurso_produtivo_id: "recurso-1", ativo: true, deleted_at: null },
    ],
    itens: [],
    recursos: [{ id: "recurso-1", capacidade_horas_dia: 8 }],
    compatibilidades: [],
    produtividadePorRecurso: { "recurso-1": 0.9 },
    comprometidoPorRecurso: {},
    diasProdutivosNaJanela: 5,
    ...overrides,
  };
}

// Janela civil [segunda 2026-11-02, sexta 2026-11-06] = 5 dias
// produtivos (padrão segunda-sexta, sem feriados na fixture).
const JANELA_INICIO = "2026-11-02";
const JANELA_FIM = "2026-11-06";

describe("prepararEntradasMotor", () => {
  it("monta operações, capacidade e compatibilidades a partir do roteiro real do projeto", async () => {
    const client = criarClienteFalso(baseMinima());

    const { entradas, capacidadePorRecurso } = await prepararEntradasMotor(
      client,
      "empresa-1",
      "projeto-1",
      JANELA_INICIO,
      JANELA_FIM,
    );

    expect(entradas.operacoesOrdenadas).toEqual([
      { bomOperacaoId: "op-1", recursoOriginalId: "recurso-1", tempoEstimadoMinutos: 60, quantidade: 2 },
    ]);

    // capacidadeBruta = 5 dias × 8h = 40h; capacidadeEfetiva = 40×0.9=36h;
    // comprometido=0 -> disponívelInicial = 36.
    expect(capacidadePorRecurso["recurso-1"]).toEqual({
      capacidadeBruta: 40,
      produtividade: 0.9,
      capacidadeEfetiva: 36,
      comprometidoInicial: 0,
      capacidadeDisponivelInicial: 36,
    });
    expect(entradas.capacidadeDisponivelInicial["recurso-1"]).toBe(36);
  });

  it("desconta o comprometido de outros projetos exatamente uma vez, líquido no capacidadeDisponivelInicial", async () => {
    const client = criarClienteFalso(
      baseMinima({ comprometidoPorRecurso: { "recurso-1": 10 } }),
    );

    const { capacidadePorRecurso } = await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);

    // capacidadeEfetiva 36, comprometido 10 -> disponível 26.
    expect(capacidadePorRecurso["recurso-1"].comprometidoInicial).toBe(10);
    expect(capacidadePorRecurso["recurso-1"].capacidadeDisponivelInicial).toBe(26);
    // capacidadeEfetiva em si NUNCA é reduzida pelo comprometido - só o
    // campo específico de disponível líquido.
    expect(capacidadePorRecurso["recurso-1"].capacidadeEfetiva).toBe(36);
  });

  it("produtividade não cadastrada (RPC retorna null) é tratada como 100%, não como erro", async () => {
    const client = criarClienteFalso(baseMinima({ produtividadePorRecurso: { "recurso-1": null } }));

    const { capacidadePorRecurso } = await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);

    expect(capacidadePorRecurso["recurso-1"].produtividade).toBe(1);
    expect(capacidadePorRecurso["recurso-1"].capacidadeEfetiva).toBe(40); // = capacidadeBruta × 1
  });

  it("inclui recursos compatíveis (destino) na capacidade preparada, mesmo que nenhuma operação os use como original", async () => {
    const client = criarClienteFalso(
      baseMinima({
        recursos: [
          { id: "recurso-1", capacidade_horas_dia: 8 },
          { id: "recurso-compativel", capacidade_horas_dia: 6 },
        ],
        compatibilidades: [
          { recurso_origem_id: "recurso-1", recurso_destino_id: "recurso-compativel", prioridade: 1, ativo: true, deleted_at: null },
        ],
        produtividadePorRecurso: { "recurso-1": 0.9, "recurso-compativel": 1 },
      }),
    );

    const { entradas, capacidadePorRecurso } = await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);

    expect(entradas.compatibilidades["recurso-1"]).toEqual([{ recursoId: "recurso-compativel", prioridade: 1 }]);
    expect(capacidadePorRecurso["recurso-compativel"]).toBeDefined();
    expect(capacidadePorRecurso["recurso-compativel"].capacidadeBruta).toBe(30); // 5 × 6
  });

  it("ignora compatibilidade inativa ou excluída", async () => {
    const client = criarClienteFalso(
      baseMinima({
        recursos: [
          { id: "recurso-1", capacidade_horas_dia: 8 },
          { id: "recurso-inativo", capacidade_horas_dia: 5 },
        ],
        compatibilidades: [
          { recurso_origem_id: "recurso-1", recurso_destino_id: "recurso-inativo", prioridade: 1, ativo: false, deleted_at: null },
        ],
      }),
    );

    const { entradas } = await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);

    expect(entradas.compatibilidades["recurso-1"] ?? []).toEqual([]);
  });

  it("multiplica quantidade acumulada do subconjunto através de coletarEstruturaBom (integração real, não mockada)", async () => {
    const client = criarClienteFalso(
      baseMinima({
        boms: [
          { id: "bom-1", produto_id: "produto-1", status: "ativo", created_at: "2026-01-01", deleted_at: null },
          { id: "bom-filho", produto_id: "produto-2", status: "ativo", created_at: "2026-01-01", deleted_at: null },
        ],
        operacoes: [
          { id: "op-filho", bom_id: "bom-filho", ordem: 10, tempo_estimado_minutos: 30, recurso_produtivo_id: "recurso-1", ativo: true, deleted_at: null },
        ],
        itens: [
          { bom_id: "bom-1", quantidade: 3, componente_produto_id: "produto-2", componente_tipo: "subconjunto", ativo: true, deleted_at: null, ordem: 10 },
        ],
      }),
    );

    const { entradas } = await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);

    // projeto_item.quantidade=2 × bom_itens.quantidade=3 = 6
    expect(entradas.operacoesOrdenadas).toEqual([
      { bomOperacaoId: "op-filho", recursoOriginalId: "recurso-1", tempoEstimadoMinutos: 30, quantidade: 6 },
    ]);
  });

  it("lança ProjetoSemItensError quando o projeto não tem itens ativos", async () => {
    const client = criarClienteFalso(baseMinima({ projetoItens: [] }));

    await expect(prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM)).rejects.toThrow(
      ProjetoSemItensError,
    );
  });

  it("lança RoteiroNaoEncontradoError quando o produto não tem BOM ativo", async () => {
    const client = criarClienteFalso(baseMinima({ boms: [] }));

    await expect(prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM)).rejects.toThrow(
      RoteiroNaoEncontradoError,
    );
  });

  it("lança RecursoSemCapacidadeCadastradaError quando capacidade_horas_dia é nula", async () => {
    const client = criarClienteFalso(baseMinima({ recursos: [{ id: "recurso-1", capacidade_horas_dia: null }] }));

    await expect(prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM)).rejects.toThrow(
      RecursoSemCapacidadeCadastradaError,
    );
  });

  it("processa itens de projeto em ordem de created_at, refletida na ordem final das operações", async () => {
    const client = criarClienteFalso(
      baseMinima({
        projetoItens: [
          { id: "item-2", projeto_id: "projeto-1", produto_id: "produto-2", quantidade: 1, ativo: true, deleted_at: null, created_at: "2026-01-02" },
          { id: "item-1", projeto_id: "projeto-1", produto_id: "produto-1", quantidade: 1, ativo: true, deleted_at: null, created_at: "2026-01-01" },
        ],
        boms: [
          { id: "bom-1", produto_id: "produto-1", status: "ativo", created_at: "2026-01-01", deleted_at: null },
          { id: "bom-2", produto_id: "produto-2", status: "ativo", created_at: "2026-01-01", deleted_at: null },
        ],
        operacoes: [
          { id: "op-produto-1", bom_id: "bom-1", ordem: 10, tempo_estimado_minutos: 10, recurso_produtivo_id: "recurso-1", ativo: true, deleted_at: null },
          { id: "op-produto-2", bom_id: "bom-2", ordem: 10, tempo_estimado_minutos: 10, recurso_produtivo_id: "recurso-1", ativo: true, deleted_at: null },
        ],
      }),
    );

    const { entradas } = await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);

    // item-1 (created_at mais antigo) primeiro, mesmo aparecendo depois
    // na fixture de projetoItens.
    expect(entradas.operacoesOrdenadas.map((op) => op.bomOperacaoId)).toEqual(["op-produto-1", "op-produto-2"]);
  });

  // Correção de N+1 (fase isolada de performance, sem banco/migration):
  // ver prepararBaseFixaMotor. Os dois testes abaixo provam exatamente o
  // que foi autorizado - lote em recursos_produtivos, RPCs mantidas mas
  // paralelizadas, semântica de erro preservada - sem repetir os 10
  // testes de comportamento acima (que já provam o resultado final
  // inalterado).
  it("consulta recursos_produtivos em uma única chamada .in() cobrindo todos os recursos, e mantém uma chamada de cada RPC por recurso", async () => {
    const base = baseMinima({
      operacoes: [
        { id: "op-1", bom_id: "bom-1", ordem: 10, tempo_estimado_minutos: 60, recurso_produtivo_id: "recurso-1", ativo: true, deleted_at: null },
        { id: "op-2", bom_id: "bom-1", ordem: 20, tempo_estimado_minutos: 30, recurso_produtivo_id: "recurso-2", ativo: true, deleted_at: null },
        { id: "op-3", bom_id: "bom-1", ordem: 30, tempo_estimado_minutos: 45, recurso_produtivo_id: "recurso-3", ativo: true, deleted_at: null },
      ],
      recursos: [
        { id: "recurso-1", capacidade_horas_dia: 8 },
        { id: "recurso-2", capacidade_horas_dia: 6 },
        { id: "recurso-3", capacidade_horas_dia: 10 },
      ],
      produtividadePorRecurso: { "recurso-1": 0.9, "recurso-2": 1, "recurso-3": 0.8 },
    });
    const { client, contagem } = criarClienteFalsoComContagem(base);

    await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);

    // Antes da correção: 3 chamadas .single(), uma por recurso. Depois:
    // exatamente 1 chamada a from("recursos_produtivos"), com .in()
    // cobrindo os 3 ids de uma vez.
    expect(contagem.porTabela["recursos_produtivos"]).toBe(1);
    const chamadaIn = contagem.chamadasIn.find((c) => c.tabela === "recursos_produtivos");
    expect([...(chamadaIn?.valores ?? [])].sort()).toEqual(["recurso-1", "recurso-2", "recurso-3"]);

    // As RPCs não têm variante em lote - continuam 1 chamada por recurso
    // (a correção só deixa de aguardá-las em sequência; não reduz nem
    // substitui a lógica de cada chamada individual).
    expect(contagem.porRpc["calcular_produtividade_efetiva"]).toBe(3);
    expect(contagem.porRpc["calcular_comprometido_v2"]).toBe(3);
  });

  it("preserva a ordem determinística de erro: o erro relatado é sempre o do primeiro recurso em recursoIds, mesmo que outro recurso falhe primeiro no tempo real", async () => {
    const base = baseMinima({
      operacoes: [
        { id: "op-1", bom_id: "bom-1", ordem: 10, tempo_estimado_minutos: 60, recurso_produtivo_id: "recurso-1", ativo: true, deleted_at: null },
        { id: "op-2", bom_id: "bom-1", ordem: 20, tempo_estimado_minutos: 30, recurso_produtivo_id: "recurso-2", ativo: true, deleted_at: null },
      ],
      recursos: [
        { id: "recurso-1", capacidade_horas_dia: 8 },
        { id: "recurso-2", capacidade_horas_dia: 6 },
      ],
      // recursoIds ordenado = ["recurso-1", "recurso-2"]. recurso-2 falha
      // IMEDIATAMENTE; recurso-1 (primeiro na ordem) falha só depois de
      // um atraso. Loop sequencial antigo teria lançado o erro de
      // recurso-1 primeiro, por ordem; a versão paralela precisa
      // reproduzir o mesmo resultado, não o que "chegou primeiro" da rede.
      errosProdutividade: [
        { recursoId: "recurso-1", mensagem: "falha-recurso-1", atrasoMs: 30 },
        { recursoId: "recurso-2", mensagem: "falha-recurso-2" },
      ],
    });
    const { client } = criarClienteFalsoComContagem(base);

    await expect(
      prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM),
    ).rejects.toThrow(/falha-recurso-1/);
  });

  it("falha de infraestrutura na consulta em lote de recursos_produtivos vira Error genérico, nunca RecursoSemCapacidadeCadastradaError", async () => {
    const client = criarClienteFalso(
      baseMinima({ erroConsultaRecursosEmLote: "connection timeout" }),
    );

    let erroCapturado: unknown;
    try {
      await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(Error);
    expect(erroCapturado).not.toBeInstanceOf(RecursoSemCapacidadeCadastradaError);
    expect((erroCapturado as Error).message).toMatch(/em lote/);
    expect((erroCapturado as Error).message).toMatch(/connection timeout/);
  });

  it("recurso realmente ausente/nulo continua lançando RecursoSemCapacidadeCadastradaError, não confundido com falha de infraestrutura", async () => {
    const client = criarClienteFalso(baseMinima({ recursos: [{ id: "recurso-1", capacidade_horas_dia: null }] }));

    let erroCapturado: unknown;
    try {
      await prepararEntradasMotor(client, "empresa-1", "projeto-1", JANELA_INICIO, JANELA_FIM);
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(RecursoSemCapacidadeCadastradaError);
    expect((erroCapturado as Error).message).not.toMatch(/em lote/);
  });
});
