import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarBasePrevisaoComercial } from "./carregarBasePrevisaoComercial";
import type { FixtureCalendario } from "@/modules/calendario/lib/testHelpers/criarClienteCalendarioFalso";

/**
 * Mesmo mock GENÉRICO de tabela filtrável usado em
 * carregarConfirmadosComerciais.test.ts - respeita eq/neq/in/is/order/
 * maybeSingle de verdade, e insert/update/delete sempre lançam (prova
 * de "zero métodos de escrita", não apenas ausência de chamada nos
 * testes abaixo). Usado para as tabelas do lado CONFIRMADOS (inalterado
 * pela correção deste incremento) + recursos_produtivos/compatibilidades
 * (compartilhadas pelos dois lados).
 */
function tabelaFiltravel<T extends Record<string, unknown>>(linhas: readonly T[]) {
  return () => {
    const filtros: ((linha: T) => boolean)[] = [];
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
      insert: () => {
        throw new Error("Mock não implementa insert - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
      },
      update: () => {
        throw new Error("Mock não implementa update - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
      },
      delete: () => {
        throw new Error("Mock não implementa delete - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
      },
      then: (resolve: (v: unknown) => unknown) => {
        const resultado = linhas.filter((linha) => filtros.every((f) => f(linha)));
        return Promise.resolve(resolve({ data: single ? (resultado[0] ?? null) : resultado, error: null }));
      },
    };
    return builder;
  };
}

/** Builder que SEMPRE devolve `{data: null, error: {message}}` - simula uma consulta real falhando (rede/RLS/timeout), nunca lança direto (mesmo formato de erro que o client Supabase real devolve). */
function tabelaComErro(mensagem: string) {
  return () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      is: () => builder,
      order: () => builder,
      maybeSingle: () => builder,
      insert: () => {
        throw new Error("Mock não implementa insert - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
      },
      update: () => {
        throw new Error("Mock não implementa update - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
      },
      delete: () => {
        throw new Error("Mock não implementa delete - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: { message: mensagem } })),
    };
    return builder;
  };
}

// --- Fixtures do lado ORÇAMENTO NOVO (roteiro atual - correção deste
// incremento): mesma topologia mínima usada em
// carregarNecessidadesOrcamentoNovo.test.ts, simplificada para 1
// operação por produto (sem subconjunto) - suficiente para provar
// integração, a travessia de BOM em si já é testada à exaustão no
// arquivo dedicado. ---
type ProjetoItemFixture = { id: string; empresa_id: string; projeto_id: string; produto_id: string; quantidade: number; ativo: boolean; deleted_at: string | null };
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
type OpFixture = { id: string; bom_id: string; ordem: number; ativo: boolean; deleted_at: string | null };
type DetalheFixture = { id: string; tempo_estimado_minutos: number; recurso_produtivo_id: string | null };

function noRaizSimples(produtoRaizId: string, bomId: string, quantidade: number): NoFixture {
  return {
    produto_id: produtoRaizId,
    caminho: [produtoRaizId],
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

/**
 * Monta as 4 peças de fixture (projeto_item, nó, operação, detalhe) de
 * um orçamento novo com 1 única operação (necessarioHorasPadrao =
 * tempoEstimadoMinutos/60 × quantidade, quantidade=1 aqui - simplifica
 * para "necessarioHorasPadrao = horas" diretamente).
 */
function bomOrcamentoNovoSimples(params: { projetoId: string; empresaId: string; produtoRaizId: string; recursoId: string; horas: number }) {
  const { projetoId, empresaId, produtoRaizId, recursoId, horas } = params;
  const bomId = `bom-${produtoRaizId}`;
  const opId = `op-${produtoRaizId}`;
  return {
    projetoItem: { id: `item-${projetoId}`, empresa_id: empresaId, projeto_id: projetoId, produto_id: produtoRaizId, quantidade: 1, ativo: true, deleted_at: null } as ProjetoItemFixture,
    no: noRaizSimples(produtoRaizId, bomId, 1),
    opGrafo: { id: opId, bom_id: bomId, ordem: 10, ativo: true, deleted_at: null } as OpFixture,
    detalhe: { id: opId, tempo_estimado_minutos: horas * 60, recurso_produtivo_id: recursoId } as DetalheFixture,
  };
}

interface DadosMock {
  // Confirmados (carregarConfirmadosComerciais.ts - inalterado por esta correção).
  projetos: { id: string; empresa_id: string; situacao_comercial: string; ativo: boolean; deleted_at: string | null }[];
  historico: { empresa_id: string; projeto_id: string; situacao_nova: string; created_at: string }[];
  simulacoesConfirmados: { id: string; empresa_id: string; projeto_id: string; vigente: boolean }[];
  itensConfirmados: { id: string; empresa_id: string; simulacao_comercial_id: string; necessario: number; deficit: number; versao_resultado_motor: number; recurso_considerado_id: string | null }[];
  distribuicoes: { id: string; empresa_id: string; simulacao_comercial_item_id: string; recurso_id: string; horas_padrao_alocadas: number }[];
  // Orçamento novo (carregarNecessidadesOrcamentoNovo.ts - roteiro atual, correção deste incremento).
  projetoItens: ProjetoItemFixture[];
  nosPorProdutoRaiz: Record<string, NoFixture[]>;
  opsGrafo: OpFixture[];
  detalhesBomOperacoes: DetalheFixture[];
  // Compartilhado.
  compatibilidades: { recurso_origem_id: string; recurso_destino_id: string; prioridade: number; ativo: boolean; deleted_at: string | null }[];
  recursosProdutivos: { id: string; capacidade_horas_dia: number }[];
  produtividadePorRecurso: Record<string, number>;
}

interface OpcoesFalha {
  /** Nome da tabela que deve falhar (ex.: "recursos_produtivos") - todas as outras seguem normais. */
  tabela?: string;
  /** true = a RPC "calcular_produtividade_efetiva" falha, em vez das tabelas. */
  rpcProdutividade?: boolean;
  mensagem?: string;
}

/** Default: toda data é produtiva (padrão semanal inteiro true, sem feriados/eventos) - preserva o comportamento dos testes que não são sobre calendário, sem precisar declarar uma fixture em cada um. */
const CALENDARIO_SEMPRE_PRODUTIVO: FixtureCalendario = {
  empresaId: "empresa-1",
  padraoSemanal: { segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: true, domingo: true },
};

function dentroDaFaixa(valor: string, faixa: { gte?: string; lte?: string } | undefined): boolean {
  if (!faixa) return true;
  if (faixa.gte !== undefined && valor < faixa.gte) return false;
  if (faixa.lte !== undefined && valor > faixa.lte) return false;
  return true;
}

/**
 * Builder mínimo das 4 tabelas de calendário (carregarContextoCalendario),
 * deliberadamente LENIENTE quanto a empresa_id (sempre casa, qualquer
 * valor filtrado) - diferente de criarClienteCalendarioFalso.ts (que
 * exige empresa_id === fixture.empresaId, correto para os testes
 * DEDICADOS de calendário). Aqui o mesmo `client` mock é reutilizado
 * entre chamadas com empresa_id DIFERENTES (ex.: teste de isolamento
 * entre empresas abaixo) - o calendário nunca é o que está sob teste
 * nesses casos, então precisa responder igual para qualquer empresa.
 */
function tabelaCalendario(tabela: string, fixtureCalendario: FixtureCalendario) {
  const filtros: Record<string, unknown> = {};
  const faixas: Record<string, { gte?: string; lte?: string }> = {};
  const builder = {
    select: () => builder,
    eq: (coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      return builder;
    },
    gte: (coluna: string, valor: unknown) => {
      faixas[coluna] = { ...(faixas[coluna] ?? {}), gte: valor as string };
      return builder;
    },
    lte: (coluna: string, valor: unknown) => {
      faixas[coluna] = { ...(faixas[coluna] ?? {}), lte: valor as string };
      return builder;
    },
    is: () => builder,
    order: () => builder,
    range: () => builder,
    async maybeSingle() {
      if (tabela === "calendario_operacional_empresa") return { data: fixtureCalendario.padraoSemanal, error: null };
      if (tabela === "empresas") return { data: fixtureCalendario.empresa ?? { pais_codigo: null, uf_codigo: null, municipio_codigo: null }, error: null };
      return { data: null, error: null };
    },
    then(resolve: (v: unknown) => unknown) {
      if (tabela === "calendario_oficial_feriados") {
        const linhas = (fixtureCalendario.feriados ?? [])
          .filter((f) => (filtros.pais_codigo === undefined || f.pais_codigo === filtros.pais_codigo) && dentroDaFaixa(f.data, faixas.data))
          .map((f) => ({ ...f, id: f.id ?? `${f.data}|${f.abrangencia}|${f.uf_codigo}|${f.municipio_codigo}` }));
        return Promise.resolve(resolve({ data: linhas, error: null }));
      }
      if (tabela === "calendario_empresa_eventos") {
        const linhas = (fixtureCalendario.eventos ?? []).filter((e) => dentroDaFaixa(e.data, faixas.data));
        return Promise.resolve(resolve({ data: linhas, error: null }));
      }
      return Promise.resolve(resolve({ data: [], error: null }));
    },
  };
  return builder;
}

function clienteMock(dados: DadosMock, falha?: OpcoesFalha, fixtureCalendario: FixtureCalendario = CALENDARIO_SEMPRE_PRODUTIVO): SupabaseClient {
  const mensagemFalha = falha?.mensagem ?? "falha simulada de consulta";

  const rpc = (nome: string, params: Record<string, unknown>) => {
    if (nome === "calcular_produtividade_efetiva") {
      if (falha?.rpcProdutividade) {
        return Promise.resolve({ data: null, error: { message: mensagemFalha } });
      }
      const recursoId = params.p_recurso_id as string;
      return Promise.resolve({ data: dados.produtividadePorRecurso[recursoId] ?? null, error: null });
    }
    if (nome === "gerar_lista_tecnica_projeto") {
      return Promise.resolve({ data: { estado: "calculado", itens_analisados: [], materiais: [] }, error: null });
    }
    if (nome === "lista_tecnica_nos_alcancaveis") {
      const produtoRaizId = params.p_produto_raiz_id as string;
      return Promise.resolve({ data: dados.nosPorProdutoRaiz[produtoRaizId] ?? [], error: null });
    }
    throw new Error(`Mock não implementa a RPC "${nome}" - carregarBasePrevisaoComercial nunca deveria chamá-la (ex.: calcular_comprometido_v2 contaria capacidade confirmada duas vezes).`);
  };

  const from = (tabela: string) => {
    if (falha?.tabela === tabela) {
      return tabelaComErro(mensagemFalha)();
    }
    switch (tabela) {
      case "projetos":
        return tabelaFiltravel(dados.projetos)();
      case "historico_situacao_comercial":
        return tabelaFiltravel(dados.historico)();
      case "simulacoes_comerciais":
        return tabelaFiltravel(dados.simulacoesConfirmados)();
      case "simulacao_comercial_itens":
        return tabelaFiltravel(dados.itensConfirmados)();
      case "simulacao_comercial_item_distribuicoes":
        return tabelaFiltravel(dados.distribuicoes)();
      case "recurso_produtivo_compatibilidades":
        return tabelaFiltravel(dados.compatibilidades)();
      case "recursos_produtivos":
        return tabelaFiltravel(dados.recursosProdutivos)();
      case "projeto_itens":
        return tabelaFiltravel(dados.projetoItens)();
      case "calendario_operacional_empresa":
      case "empresas":
      case "calendario_oficial_feriados":
      case "calendario_empresa_eventos":
        return tabelaCalendario(tabela, fixtureCalendario);
      case "bom_operacoes": {
        // Mesma simplificação de carregarBaseCenarios.test.ts: não filtra
        // por eq/in (sempre devolve o fixture inteiro certo pelo nome de
        // coluna do select) - quem consome só lê as chaves que realmente
        // precisa, então dados de outro cenário/empresa no mesmo array
        // nunca vazam para o resultado final.
        let colunas = "";
        const builder = {
          select: (cols: string) => {
            colunas = cols;
            return builder;
          },
          eq: () => builder,
          in: () => builder,
          is: () => builder,
          insert: () => {
            throw new Error("Mock não implementa insert - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
          },
          update: () => {
            throw new Error("Mock não implementa update - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
          },
          delete: () => {
            throw new Error("Mock não implementa delete - carregarBasePrevisaoComercial é só leitura, nunca deveria escrever.");
          },
          then: (resolve: (v: unknown) => unknown) => {
            const ehDetalhe = colunas.includes("tempo_estimado_minutos");
            return Promise.resolve(resolve({ data: ehDetalhe ? dados.detalhesBomOperacoes : dados.opsGrafo, error: null }));
          },
        };
        return builder;
      }
      case "bom_operacao_dependencias_subconjunto":
        return tabelaFiltravel([] as Record<string, unknown>[])();
      default:
        throw new Error(`Tabela inesperada neste mock: ${tabela}`);
    }
  };
  return { from, rpc } as unknown as SupabaseClient;
}

function dadosVazios(): DadosMock {
  return {
    projetos: [],
    historico: [],
    simulacoesConfirmados: [],
    itensConfirmados: [],
    distribuicoes: [],
    projetoItens: [],
    nosPorProdutoRaiz: {},
    opsGrafo: [],
    detalhesBomOperacoes: [],
    compatibilidades: [],
    recursosProdutivos: [],
    produtividadePorRecurso: {},
  };
}

const JANELA_INICIO = "2026-09-01";
const PRAZO_INTERNO = "2026-09-10";
const DATA_SOLICITADA = "2026-09-10";

describe("carregarBasePrevisaoComercial", () => {
  it("exclui o próprio orçamento novo da fila de confirmados, mesmo que ele também esteja em pedido_recebido - e calcula suas necessidades do roteiro atual, sem exigir simulação vigente", async () => {
    const bomNovo = bomOrcamentoNovoSimples({ projetoId: "projeto-novo", empresaId: "empresa-1", produtoRaizId: "produto-novo", recursoId: "recurso-A", horas: 8 });
    const dados: DadosMock = {
      ...dadosVazios(),
      projetos: [
        { id: "projeto-novo", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
        { id: "proj-confirmado", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
      ],
      historico: [
        { empresa_id: "empresa-1", projeto_id: "projeto-novo", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" },
        { empresa_id: "empresa-1", projeto_id: "proj-confirmado", situacao_nova: "pedido_recebido", created_at: "2026-08-02T10:00:00Z" },
      ],
      simulacoesConfirmados: [{ id: "sim-confirmado", empresa_id: "empresa-1", projeto_id: "proj-confirmado", vigente: true }],
      itensConfirmados: [{ id: "item-confirmado", empresa_id: "empresa-1", simulacao_comercial_id: "sim-confirmado", necessario: 5, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-A" }],
      projetoItens: [bomNovo.projetoItem],
      nosPorProdutoRaiz: { "produto-novo": [bomNovo.no] },
      opsGrafo: [bomNovo.opGrafo],
      detalhesBomOperacoes: [bomNovo.detalhe],
      recursosProdutivos: [{ id: "recurso-A", capacidade_horas_dia: 8 }],
      produtividadePorRecurso: { "recurso-A": 1 },
    };

    const base = await carregarBasePrevisaoComercial(clienteMock(dados), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO);

    expect(base.compromissosConfirmados).toHaveLength(1);
    expect(base.compromissosConfirmados[0].projetoId).toBe("proj-confirmado");
    expect(base.necessidadesOrcamentoNovo).toHaveLength(1);
    expect(base.necessidadesOrcamentoNovo[0].projetoId).toBe("projeto-novo");
    expect(base.necessidadesOrcamentoNovo[0].horasNecessariasPadrao).toBeCloseTo(8);
    expect(base.diagnosticos).toEqual([]); // nenhum diagnóstico "sem simulação vigente" - a correção deste incremento
  });

  it("snapshot ausente (confirmado em pedido_recebido sem simulação vigente) vira diagnóstico na base, nunca completado por suposição - orçamento novo continua calculado normalmente pelo roteiro", async () => {
    const bomNovo = bomOrcamentoNovoSimples({ projetoId: "projeto-novo", empresaId: "empresa-1", produtoRaizId: "produto-novo", recursoId: "recurso-A", horas: 8 });
    const dados: DadosMock = {
      ...dadosVazios(),
      projetos: [
        { id: "projeto-novo", empresa_id: "empresa-1", situacao_comercial: "em_negociacao", ativo: true, deleted_at: null },
        { id: "proj-sem-snapshot", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
      ],
      historico: [{ empresa_id: "empresa-1", projeto_id: "proj-sem-snapshot", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
      projetoItens: [bomNovo.projetoItem],
      nosPorProdutoRaiz: { "produto-novo": [bomNovo.no] },
      opsGrafo: [bomNovo.opGrafo],
      detalhesBomOperacoes: [bomNovo.detalhe],
      recursosProdutivos: [{ id: "recurso-A", capacidade_horas_dia: 8 }],
      produtividadePorRecurso: { "recurso-A": 1 },
    };

    const base = await carregarBasePrevisaoComercial(clienteMock(dados), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO);

    expect(base.compromissosConfirmados).toEqual([]);
    expect(base.necessidadesOrcamentoNovo).toHaveLength(1); // orçamento novo NUNCA depende de snapshot
    expect(base.diagnosticos).toHaveLength(1);
    expect(base.diagnosticos[0].projetoId).toBe("proj-sem-snapshot");
    expect(base.diagnosticos[0].motivo).toMatch(/sem simulação comercial vigente/);
    // Diagnóstico informativo (nunca definido por este carregador) - não bloqueia o cálculo desta base.
    expect(base.diagnosticos[0].bloqueiaCalculo).toBeUndefined();
  });

  it("isolamento entre empresas: recursos/confirmados/necessidades de uma empresa nunca vazam para a base da outra", async () => {
    const bomNovoE1 = bomOrcamentoNovoSimples({ projetoId: "projeto-novo-e1", empresaId: "empresa-1", produtoRaizId: "produto-novo-e1", recursoId: "recurso-E1", horas: 4 });
    const bomNovoE2 = bomOrcamentoNovoSimples({ projetoId: "projeto-novo-e2", empresaId: "empresa-2", produtoRaizId: "produto-novo-e2", recursoId: "recurso-E2", horas: 5 });
    const dados: DadosMock = {
      ...dadosVazios(),
      projetos: [
        { id: "proj-confirmado-e1", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
        { id: "proj-confirmado-e2", empresa_id: "empresa-2", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
      ],
      historico: [
        { empresa_id: "empresa-1", projeto_id: "proj-confirmado-e1", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" },
        { empresa_id: "empresa-2", projeto_id: "proj-confirmado-e2", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" },
      ],
      simulacoesConfirmados: [
        { id: "sim-confirmado-e1", empresa_id: "empresa-1", projeto_id: "proj-confirmado-e1", vigente: true },
        { id: "sim-confirmado-e2", empresa_id: "empresa-2", projeto_id: "proj-confirmado-e2", vigente: true },
      ],
      itensConfirmados: [
        { id: "item-confirmado-e1", empresa_id: "empresa-1", simulacao_comercial_id: "sim-confirmado-e1", necessario: 3, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-E1" },
        { id: "item-confirmado-e2", empresa_id: "empresa-2", simulacao_comercial_id: "sim-confirmado-e2", necessario: 6, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-E2" },
      ],
      projetoItens: [bomNovoE1.projetoItem, bomNovoE2.projetoItem],
      nosPorProdutoRaiz: { "produto-novo-e1": [bomNovoE1.no], "produto-novo-e2": [bomNovoE2.no] },
      opsGrafo: [bomNovoE1.opGrafo, bomNovoE2.opGrafo],
      detalhesBomOperacoes: [bomNovoE1.detalhe, bomNovoE2.detalhe],
      recursosProdutivos: [
        { id: "recurso-E1", capacidade_horas_dia: 8 },
        { id: "recurso-E2", capacidade_horas_dia: 8 },
      ],
      produtividadePorRecurso: { "recurso-E1": 1, "recurso-E2": 1 },
    };
    const client = clienteMock(dados);

    const baseE1 = await carregarBasePrevisaoComercial(client, "empresa-1", "projeto-novo-e1", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO);
    expect(baseE1.compromissosConfirmados).toHaveLength(1);
    expect(baseE1.compromissosConfirmados[0].recursoId).toBe("recurso-E1");
    expect(baseE1.necessidadesOrcamentoNovo).toHaveLength(1);
    expect(baseE1.necessidadesOrcamentoNovo[0].recursoOriginalId).toBe("recurso-E1");
    expect([...baseE1.capacidadesNormais.keys()]).toEqual(["recurso-E1"]);

    const baseE2 = await carregarBasePrevisaoComercial(client, "empresa-2", "projeto-novo-e2", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO);
    expect(baseE2.compromissosConfirmados).toHaveLength(1);
    expect(baseE2.compromissosConfirmados[0].recursoId).toBe("recurso-E2");
    expect(baseE2.necessidadesOrcamentoNovo).toHaveLength(1);
    expect(baseE2.necessidadesOrcamentoNovo[0].recursoOriginalId).toBe("recurso-E2");
    expect([...baseE2.capacidadesNormais.keys()]).toEqual(["recurso-E2"]);
  });

  it("zero métodos de escrita: carrega a base inteira (confirmados + orçamento novo via roteiro + capacidades + grade) só com leitura", async () => {
    const bomNovo = bomOrcamentoNovoSimples({ projetoId: "projeto-novo", empresaId: "empresa-1", produtoRaizId: "produto-novo", recursoId: "recurso-A", horas: 6 });
    const dados: DadosMock = {
      ...dadosVazios(),
      projetos: [{ id: "proj-confirmado", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
      historico: [{ empresa_id: "empresa-1", projeto_id: "proj-confirmado", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
      simulacoesConfirmados: [{ id: "sim-confirmado", empresa_id: "empresa-1", projeto_id: "proj-confirmado", vigente: true }],
      itensConfirmados: [{ id: "item-confirmado", empresa_id: "empresa-1", simulacao_comercial_id: "sim-confirmado", necessario: 4, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-A" }],
      projetoItens: [bomNovo.projetoItem],
      nosPorProdutoRaiz: { "produto-novo": [bomNovo.no] },
      opsGrafo: [bomNovo.opGrafo],
      detalhesBomOperacoes: [bomNovo.detalhe],
      recursosProdutivos: [{ id: "recurso-A", capacidade_horas_dia: 8 }],
      produtividadePorRecurso: { "recurso-A": 1 },
    };

    // O próprio mock lança se insert/update/delete/RPC não previsto for chamado (ver clienteMock acima) -
    // a asserção real é a promise resolver sem exceção.
    await expect(carregarBasePrevisaoComercial(clienteMock(dados), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO)).resolves.toBeDefined();
  });

  it("datasGrade construída a partir de janelaInicio/prazoInterno (construirGradeCompartilhada) - começa no piso técnico, nunca antes", async () => {
    const bomNovo = bomOrcamentoNovoSimples({ projetoId: "projeto-novo", empresaId: "empresa-1", produtoRaizId: "produto-novo", recursoId: "recurso-A", horas: 6 });
    const dados: DadosMock = {
      ...dadosVazios(),
      projetoItens: [bomNovo.projetoItem],
      nosPorProdutoRaiz: { "produto-novo": [bomNovo.no] },
      opsGrafo: [bomNovo.opGrafo],
      detalhesBomOperacoes: [bomNovo.detalhe],
      recursosProdutivos: [{ id: "recurso-A", capacidade_horas_dia: 8 }],
      produtividadePorRecurso: { "recurso-A": 1 },
    };

    const base = await carregarBasePrevisaoComercial(clienteMock(dados), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO);

    expect(base.datasGrade[0]).toBe(JANELA_INICIO);
    expect(base.datasGrade).toContain(PRAZO_INTERNO);
    expect(base.datasGrade[base.datasGrade.length - 1] > PRAZO_INTERNO).toBe(true); // grade estendida além do prazo (horizonte técnico)
  });

  describe("imutabilidade profunda em runtime - nunca só o tipo TypeScript", () => {
    async function baseComTudoPreenchido() {
      const bomNovo = bomOrcamentoNovoSimples({ projetoId: "projeto-novo", empresaId: "empresa-1", produtoRaizId: "produto-novo", recursoId: "recurso-B", horas: 6 });
      const dados: DadosMock = {
        ...dadosVazios(),
        projetos: [{ id: "proj-confirmado", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
        historico: [{ empresa_id: "empresa-1", projeto_id: "proj-confirmado", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
        simulacoesConfirmados: [{ id: "sim-confirmado", empresa_id: "empresa-1", projeto_id: "proj-confirmado", vigente: true }],
        itensConfirmados: [{ id: "item-confirmado", empresa_id: "empresa-1", simulacao_comercial_id: "sim-confirmado", necessario: 4, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-A" }],
        projetoItens: [bomNovo.projetoItem],
        nosPorProdutoRaiz: { "produto-novo": [bomNovo.no] },
        opsGrafo: [bomNovo.opGrafo],
        detalhesBomOperacoes: [bomNovo.detalhe],
        compatibilidades: [{ recurso_origem_id: "recurso-B", recurso_destino_id: "recurso-A", prioridade: 1, ativo: true, deleted_at: null }],
        recursosProdutivos: [
          { id: "recurso-A", capacidade_horas_dia: 8 },
          { id: "recurso-B", capacidade_horas_dia: 8 },
        ],
        produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1 },
      };
      return carregarBasePrevisaoComercial(clienteMock(dados), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO);
    }

    it("o objeto externo está congelado (Object.freeze real, não só readonly de tipo)", async () => {
      const base = await baseComTudoPreenchido();
      expect(Object.isFrozen(base)).toBe(true);
      expect(() => {
        (base as unknown as { empresaId: string }).empresaId = "outra-empresa";
      }).toThrow(TypeError);
    });

    it("compromissosConfirmados: array externo, cada objeto e chavesTrabalhoOrigem (array interno) estão congelados", async () => {
      const base = await baseComTudoPreenchido();
      expect(base.compromissosConfirmados.length).toBeGreaterThan(0);
      const compromisso = base.compromissosConfirmados[0];

      expect(Object.isFrozen(base.compromissosConfirmados)).toBe(true);
      expect(Object.isFrozen(compromisso)).toBe(true);
      expect(Object.isFrozen(compromisso.chavesTrabalhoOrigem)).toBe(true);

      expect(() => (base.compromissosConfirmados as unknown as unknown[]).push({})).toThrow(TypeError);
      expect(() => {
        (compromisso as unknown as { horasRestantesPadrao: number }).horasRestantesPadrao = 999;
      }).toThrow(TypeError);
      expect(() => (compromisso.chavesTrabalhoOrigem as unknown as string[]).push("op-forjada")).toThrow(TypeError);
    });

    it("necessidadesOrcamentoNovo: array externo, cada objeto e recursosCompativeisPorPrioridade (array interno) estão congelados", async () => {
      const base = await baseComTudoPreenchido();
      expect(base.necessidadesOrcamentoNovo.length).toBeGreaterThan(0);
      const necessidade = base.necessidadesOrcamentoNovo[0];

      expect(Object.isFrozen(base.necessidadesOrcamentoNovo)).toBe(true);
      expect(Object.isFrozen(necessidade)).toBe(true);
      expect(Object.isFrozen(necessidade.recursosCompativeisPorPrioridade)).toBe(true);

      expect(() => (base.necessidadesOrcamentoNovo as unknown as unknown[]).push({})).toThrow(TypeError);
      expect(() => {
        (necessidade as unknown as { horasNecessariasPadrao: number }).horasNecessariasPadrao = 999;
      }).toThrow(TypeError);
      expect(() => (necessidade.recursosCompativeisPorPrioridade as unknown as string[]).push("recurso-forjado")).toThrow(TypeError);
    });

    it("capacidadesNormais: .set()/.delete()/.clear() lançam em runtime (Object.freeze sozinho NÃO bloquearia isto num Map) - leitura continua funcionando normalmente", async () => {
      const base = await baseComTudoPreenchido();
      const mapaMutavel = base.capacidadesNormais as unknown as Map<string, { recursoId: string; produtividade: number; capacidadeHorasMaquinaDia: number }>;

      expect(() => mapaMutavel.set("recurso-forjado", { recursoId: "recurso-forjado", produtividade: 1, capacidadeHorasMaquinaDia: 8 })).toThrow(TypeError);
      expect(() => mapaMutavel.delete("recurso-A")).toThrow(TypeError);
      expect(() => mapaMutavel.clear()).toThrow(TypeError);

      // Leitura segue 100% funcional através do Proxy (this religado ao Map original).
      expect(base.capacidadesNormais.has("recurso-A")).toBe(true);
      expect(base.capacidadesNormais.get("recurso-A")?.capacidadeHorasMaquinaDia).toBe(8);
      expect(base.capacidadesNormais.size).toBeGreaterThan(0);
      expect([...base.capacidadesNormais.keys()].length).toBe(base.capacidadesNormais.size);

      // Também não dá pra mutar o objeto CapacidadeNormalRecurso devolvido pela leitura.
      const capacidadeLida = base.capacidadesNormais.get("recurso-A")!;
      expect(() => {
        (capacidadeLida as unknown as { produtividade: number }).produtividade = 0.5;
      }).toThrow(TypeError);
    });

    it("datasGrade e diagnosticos: arrays externos e cada diagnóstico estão congelados", async () => {
      const base = await baseComTudoPreenchido();

      expect(Object.isFrozen(base.datasGrade)).toBe(true);
      expect(() => (base.datasGrade as unknown as string[]).push("2099-01-01")).toThrow(TypeError);

      expect(Object.isFrozen(base.diagnosticos)).toBe(true);
      expect(() => (base.diagnosticos as unknown as unknown[]).push({ empresaId: "x", projetoId: "y", motivo: "z" })).toThrow(TypeError);
      if (base.diagnosticos.length > 0) {
        expect(Object.isFrozen(base.diagnosticos[0])).toBe(true);
        expect(() => {
          (base.diagnosticos[0] as unknown as { motivo: string }).motivo = "forjado";
        }).toThrow(TypeError);
      }
    });

    it("diasProdutivos: .add()/.delete()/.clear() lançam em runtime (Object.freeze sozinho NÃO bloquearia isto num Set) - leitura continua funcionando normalmente", async () => {
      const base = await baseComTudoPreenchido();
      const setMutavel = base.diasProdutivos as unknown as Set<string>;

      expect(() => setMutavel.add("2099-01-01")).toThrow(TypeError);
      expect(() => setMutavel.delete(JANELA_INICIO)).toThrow(TypeError);
      expect(() => setMutavel.clear()).toThrow(TypeError);

      expect(base.diasProdutivos.has(JANELA_INICIO)).toBe(true);
      expect(base.diasProdutivos.size).toBeGreaterThan(0);
    });
  });

  describe("correção de calendário (Etapa A) - capacidade normal respeita sábado/domingo/feriado/exceção da empresa", () => {
    function dadosMinimos(): DadosMock {
      const bomNovo = bomOrcamentoNovoSimples({ projetoId: "projeto-novo", empresaId: "empresa-1", produtoRaizId: "produto-novo", recursoId: "recurso-A", horas: 6 });
      return {
        ...dadosVazios(),
        projetoItens: [bomNovo.projetoItem],
        nosPorProdutoRaiz: { "produto-novo": [bomNovo.no] },
        opsGrafo: [bomNovo.opGrafo],
        detalhesBomOperacoes: [bomNovo.detalhe],
        recursosProdutivos: [{ id: "recurso-A", capacidade_horas_dia: 8 }],
        produtividadePorRecurso: { "recurso-A": 1 },
      };
    }

    // 2026-09-01 é terça-feira - JANELA_INICIO/PRAZO_INTERNO caem numa
    // semana com 1 sábado (05) e 1 domingo (06) dentro de [JANELA_INICIO, PRAZO_INTERNO].
    const padraoSegundaASexta: FixtureCalendario["padraoSemanal"] = {
      segunda: true,
      terca: true,
      quarta: true,
      quinta: true,
      sexta: true,
      sabado: false,
      domingo: false,
    };

    it("sábado e domingo, sem exceção cadastrada, ficam FORA de diasProdutivos - dias úteis comuns ficam DENTRO", async () => {
      const base = await carregarBasePrevisaoComercial(
        clienteMock(dadosMinimos(), undefined, { empresaId: "empresa-1", padraoSemanal: padraoSegundaASexta }),
        "empresa-1",
        "projeto-novo",
        DATA_SOLICITADA,
        JANELA_INICIO,
        JANELA_INICIO,
        PRAZO_INTERNO,
      );

      expect(base.diasProdutivos.has("2026-09-01")).toBe(true); // terça
      expect(base.diasProdutivos.has("2026-09-04")).toBe(true); // sexta
      expect(base.diasProdutivos.has("2026-09-05")).toBe(false); // sábado
      expect(base.diasProdutivos.has("2026-09-06")).toBe(false); // domingo
      expect(base.diasProdutivos.has("2026-09-07")).toBe(true); // segunda seguinte
    });

    it("feriado oficial nacional fica FORA de diasProdutivos, mesmo caindo num dia útil comum", async () => {
      const base = await carregarBasePrevisaoComercial(
        clienteMock(dadosMinimos(), undefined, {
          empresaId: "empresa-1",
          padraoSemanal: padraoSegundaASexta,
          empresa: { pais_codigo: "BR", uf_codigo: "SP", municipio_codigo: null },
          feriados: [{ data: "2026-09-07", abrangencia: "nacional", pais_codigo: "BR", uf_codigo: null, municipio_codigo: null, descricao: "Feriado de teste" }],
        }),
        "empresa-1",
        "projeto-novo",
        DATA_SOLICITADA,
        JANELA_INICIO,
        JANELA_INICIO,
        PRAZO_INTERNO,
      );

      expect(base.diasProdutivos.has("2026-09-04")).toBe(true); // sexta comum
      expect(base.diasProdutivos.has("2026-09-07")).toBe(false); // segunda, mas feriado nacional
    });

    it("evento 'dia_trabalhado_excepcional' num sábado sobrepõe o padrão semanal - sábado entra em diasProdutivos", async () => {
      const base = await carregarBasePrevisaoComercial(
        clienteMock(dadosMinimos(), undefined, {
          empresaId: "empresa-1",
          padraoSemanal: padraoSegundaASexta,
          eventos: [{ id: "evento-1", data: "2026-09-05", tipo: "dia_trabalhado_excepcional" }],
        }),
        "empresa-1",
        "projeto-novo",
        DATA_SOLICITADA,
        JANELA_INICIO,
        JANELA_INICIO,
        PRAZO_INTERNO,
      );

      expect(base.diasProdutivos.has("2026-09-05")).toBe(true); // sábado, mas dia_trabalhado_excepcional
      expect(base.diasProdutivos.has("2026-09-06")).toBe(false); // domingo comum, sem exceção
    });

    it("calendário é carregado até o FIM REAL de datasGrade (prazoInterno + buffer), não só até prazoInterno - feriado depois do prazo ainda é excluído", async () => {
      const base = await carregarBasePrevisaoComercial(
        clienteMock(dadosMinimos(), undefined, {
          empresaId: "empresa-1",
          padraoSemanal: { segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: true, domingo: true }, // sem fins de semana no meio, só o feriado importa aqui
          empresa: { pais_codigo: "BR", uf_codigo: null, municipio_codigo: null },
          feriados: [{ data: "2026-09-15", abrangencia: "nacional", pais_codigo: "BR", uf_codigo: null, municipio_codigo: null, descricao: "Feriado depois do prazo interno" }],
        }),
        "empresa-1",
        "projeto-novo",
        DATA_SOLICITADA,
        JANELA_INICIO,
        JANELA_INICIO,
        PRAZO_INTERNO,
      );

      expect("2026-09-15" > PRAZO_INTERNO).toBe(true); // confirma que a data está DEPOIS do prazo pedido
      expect(base.datasGrade).toContain("2026-09-15"); // dentro do horizonte técnico estendido (buffer)
      expect(base.diasProdutivos.has("2026-09-15")).toBe(false); // calendário resolveu essa data também, não só até prazoInterno
      expect(base.diasProdutivos.has("2026-09-14")).toBe(true); // vizinha, sem feriado, continua produtiva
    });
  });

  describe("falha em qualquer consulta impede base parcialmente válida - a promise inteira rejeita, nunca resolve com dado incompleto", () => {
    function dadosParaFalha(): DadosMock {
      const bomNovo = bomOrcamentoNovoSimples({ projetoId: "projeto-novo", empresaId: "empresa-1", produtoRaizId: "produto-novo", recursoId: "recurso-A", horas: 6 });
      return {
        ...dadosVazios(),
        projetos: [{ id: "proj-confirmado", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
        historico: [{ empresa_id: "empresa-1", projeto_id: "proj-confirmado", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
        simulacoesConfirmados: [{ id: "sim-confirmado", empresa_id: "empresa-1", projeto_id: "proj-confirmado", vigente: true }],
        itensConfirmados: [{ id: "item-confirmado", empresa_id: "empresa-1", simulacao_comercial_id: "sim-confirmado", necessario: 4, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-A" }],
        projetoItens: [bomNovo.projetoItem],
        nosPorProdutoRaiz: { "produto-novo": [bomNovo.no] },
        opsGrafo: [bomNovo.opGrafo],
        detalhesBomOperacoes: [bomNovo.detalhe],
        recursosProdutivos: [{ id: "recurso-A", capacidade_horas_dia: 8 }],
        produtividadePorRecurso: { "recurso-A": 1 },
      };
    }

    it("falha na consulta de projetos (etapa de confirmados) rejeita a promise inteira", async () => {
      await expect(
        carregarBasePrevisaoComercial(clienteMock(dadosParaFalha(), { tabela: "projetos", mensagem: "timeout simulado em projetos" }), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO),
      ).rejects.toThrow(/timeout simulado em projetos/);
    });

    it("falha na consulta de projeto_itens (etapa de orçamento novo) rejeita a promise inteira", async () => {
      await expect(
        carregarBasePrevisaoComercial(clienteMock(dadosParaFalha(), { tabela: "projeto_itens", mensagem: "erro RLS simulado" }), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO),
      ).rejects.toThrow(/erro RLS simulado/);
    });

    it("falha na consulta de recursos_produtivos (etapa de capacidades, DEPOIS dos 2 carregadores) rejeita a promise inteira - nunca devolve confirmados/necessidades já carregados como base parcial", async () => {
      const resultado = carregarBasePrevisaoComercial(
        clienteMock(dadosParaFalha(), { tabela: "recursos_produtivos", mensagem: "falha simulada em recursos_produtivos" }),
        "empresa-1",
        "projeto-novo",
        DATA_SOLICITADA,
        JANELA_INICIO,
        JANELA_INICIO,
        PRAZO_INTERNO,
      );
      await expect(resultado).rejects.toThrow(/falha simulada em recursos_produtivos/);
      // Nenhum objeto parcial: a promise REJEITA (nunca resolve com um BasePrevisaoComercial faltando capacidadesNormais).
      await expect(resultado).rejects.toBeInstanceOf(Error);
    });

    it("falha na RPC calcular_produtividade_efetiva (dentro da etapa de capacidades) rejeita a promise inteira", async () => {
      await expect(
        carregarBasePrevisaoComercial(clienteMock(dadosParaFalha(), { rpcProdutividade: true, mensagem: "falha simulada na RPC de produtividade" }), "empresa-1", "projeto-novo", DATA_SOLICITADA, JANELA_INICIO, JANELA_INICIO, PRAZO_INTERNO),
      ).rejects.toThrow(/falha simulada na RPC de produtividade/);
    });
  });
});
