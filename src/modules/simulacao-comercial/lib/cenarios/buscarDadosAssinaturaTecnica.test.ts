import { describe, expect, it, vi } from "vitest";

const carregarBaseCenariosMock = vi.fn();
vi.mock("./carregarBaseCenarios", () => ({ carregarBaseCenarios: (...args: unknown[]) => carregarBaseCenariosMock(...args) }));

const carregarContextoCalendarioMock = vi.fn();
vi.mock("@/modules/calendario/lib/contextoCalendario", () => ({
  carregarContextoCalendario: (...args: unknown[]) => carregarContextoCalendarioMock(...args),
}));

const coletarArvoreCustosBomMock = vi.fn();
vi.mock("./coletarArvoreCustosBom", () => ({ coletarArvoreCustosBom: (...args: unknown[]) => coletarArvoreCustosBomMock(...args) }));

import { buscarDadosAssinaturaTecnica } from "./buscarDadosAssinaturaTecnica";

function baseFake() {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    ocorrencias: [],
    dependencias: [],
    chavesRaizOrcamentoNovo: [],
    chavesFinaisOrcamentoNovo: [],
    recursoIds: ["recurso-A"],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: { "recurso-A": 8 },
    produtividadePorRecurso: { "recurso-A": 1 },
    comprometidoInicialPorRecurso: { "recurso-A": 999 }, // deve ser IGNORADO
    valorHoraPorRecurso: { "recurso-A": 25 },
    convencoesHorasAdicionais: [],
    restricaoMaterialPorChave: {},
  };
}

function clienteFake(itens: Record<string, unknown>[]) {
  return {
    from: (tabela: string) => {
      if (tabela !== "projeto_itens") throw new Error(`Tabela inesperada no teste: ${tabela}`);
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => Promise.resolve({ data: itens, error: null }),
      };
      return builder;
    },
  } as never;
}

describe("buscarDadosAssinaturaTecnica", () => {
  it("item não editado manualmente: busca a árvore de custos; item manual: usa custo_congelado, sem buscar árvore", async () => {
    carregarBaseCenariosMock.mockResolvedValue(baseFake());
    carregarContextoCalendarioMock.mockResolvedValue({
      padraoSemanal: { segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: false, domingo: false },
      feriadosPorData: new Map(),
      eventosPorData: new Map(),
    });
    coletarArvoreCustosBomMock.mockResolvedValue({ bomId: "bom-1", bomVersao: "A", materiais: [], subconjuntos: [], terceiros: [], transportes: [] });

    const client = clienteFake([
      { id: "item-1", produto_id: "produto-1", quantidade: 2, custo_congelado: null, custo_editado_manualmente: false },
      { id: "item-2", produto_id: "produto-2", quantidade: 1, custo_congelado: "500.00", custo_editado_manualmente: true },
    ]);

    const dados = await buscarDadosAssinaturaTecnica(client, "empresa-1", "projeto-1", "2026-08-01", "2026-08-20");

    expect(dados.itens).toHaveLength(2);
    expect(dados.itens[0]).toEqual({
      projetoItemId: "item-1",
      produtoId: "produto-1",
      quantidade: "2",
      custoEditadoManualmente: false,
      custoManualValor: null,
      arvoreCustos: { bomId: "bom-1", bomVersao: "A", materiais: [], subconjuntos: [], terceiros: [], transportes: [] },
    });
    expect(dados.itens[1]).toEqual({
      projetoItemId: "item-2",
      produtoId: "produto-2",
      quantidade: "1",
      custoEditadoManualmente: true,
      custoManualValor: "500.00",
      arvoreCustos: null,
    });
    expect(coletarArvoreCustosBomMock).toHaveBeenCalledTimes(1);
    expect(coletarArvoreCustosBomMock).toHaveBeenCalledWith(client, "empresa-1", "produto-1");
  });

  it("comprometidoInicialPorRecurso de BaseCenarios nunca entra em dados.base (reservas de outros projetos, excluído por decisão do usuário)", async () => {
    carregarBaseCenariosMock.mockResolvedValue(baseFake());
    carregarContextoCalendarioMock.mockResolvedValue({
      padraoSemanal: { segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: false, domingo: false },
      feriadosPorData: new Map(),
      eventosPorData: new Map(),
    });

    const client = clienteFake([]);
    const dados = await buscarDadosAssinaturaTecnica(client, "empresa-1", "projeto-1", "2026-08-01", "2026-08-20");

    expect(dados.base).not.toHaveProperty("comprometidoInicialPorRecurso");
    expect(dados.base.recursoIds).toEqual(["recurso-A"]);
    expect(dados.base.valorHoraPorRecurso).toEqual({ "recurso-A": 25 });
  });

  it("janela repassada integralmente para carregarBaseCenarios e carregarContextoCalendario, nunca recalculada", async () => {
    carregarBaseCenariosMock.mockResolvedValue(baseFake());
    carregarContextoCalendarioMock.mockResolvedValue({
      padraoSemanal: { segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: false, domingo: false },
      feriadosPorData: new Map(),
      eventosPorData: new Map(),
    });

    const client = clienteFake([]);
    const dados = await buscarDadosAssinaturaTecnica(client, "empresa-1", "projeto-1", "2026-08-10", "2026-08-05"); // fim < início (entrega antecipada)

    expect(carregarBaseCenariosMock).toHaveBeenCalledWith(client, "empresa-1", "projeto-1", "2026-08-10", "2026-08-05");
    expect(carregarContextoCalendarioMock).toHaveBeenCalledWith(client, "empresa-1", "2026-08-10", "2026-08-05");
    expect(dados.janela).toEqual({ inicio: "2026-08-10", fim: "2026-08-05" });
  });
});
